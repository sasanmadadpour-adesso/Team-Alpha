import cds from '@sap/cds';
import { parseParticipantWorkbook, readParticipantWorkbook, WORKBOOK_PATH } from '../scripts/workbook.js';
import { registerConstructs, rowsFromRegistration, type RegistrationInput } from './construct/registration.js';
import {
  ProcessError, confirmVsz, currentFindings, executeSwitch, loadContext, previewSwitch, processAll, processConstruct,
  relationshipList, resolveIssue, setStichtag, validateAll, validationReport,
} from './construct/service.js';
import { RULES, type Resolution } from './construct/rules.js';
import type { SwitchItem, SwitchPlan } from './construct/switch-plan.js';
import { runScenarios } from './construct/scenario-runner.js';
import { continueProcessing, listCases } from './construct/cases.js';
import { SAP_VALUES, updateSapState, type SapAttribute } from './construct/sap-state.js';
import { executeLifecycle, planLifecycle } from './construct/lifecycle-ops.js';
import type { LifecyclePlan } from './domain/lifecycle.js';

/**
 * REST facade (/api/v1). Transport only: input validation, error mapping and DTO shaping.
 * Business decisions live in srv/construct (construct process) and srv/domain (lifecycle).
 */
type Operation = 'SET_DORMANT' | 'REACTIVATE' | 'REMOVE_FROM_CONSTRUCT' | 'CORRECT_TRANSITION' | 'REVERSE_TRANSITION';
interface Command { operation: Operation; maloId: string; buildingId: string; effectiveDate?: string; reason?: string; referenceOperationId?: string }

const OPERATIONS: Operation[] = ['SET_DORMANT', 'REACTIVATE', 'REMOVE_FROM_CONSTRUCT', 'CORRECT_TRANSITION', 'REVERSE_TRANSITION'];
const RESOLUTIONS: Resolution[] = ['CHOOSE_BUILDING', 'EXCLUDE_PARTICIPANT', 'FIX_VALUE', 'CONFIRM_ASSUMPTION'];
const MANUAL_CHECK_RULES = ['V02', 'V05', 'V07', 'V10', 'V11', 'V12'];

const actorOf = (req: cds.Request) => {
  const a = (req.data as { actor?: string }).actor?.trim();
  return a ? a.slice(0, 80) : 'API_CLIENT';
};
const items = (list: SwitchItem[]) => list.map(({ key, ...rest }) => ({ itemKey: key, ...rest }));
const switchDto = (plan: SwitchPlan) => ({ ...plan, items: items(plan.items), simulated: true });
const keyOf = (req: cds.Request) => {
  const params = req.params as unknown[];
  const last = params[params.length - 1] as string | { constructId?: string; ID?: string };
  return typeof last === 'string' ? last : last.constructId ?? last.ID ?? '';
};

export default class ProcessApi extends cds.ApplicationService {
  async init(): Promise<void> {
    // Domain errors map to HTTP status codes; anything else is a 500 — never a false success.
    const guard = <T>(fn: (req: cds.Request) => Promise<T>) => async (req: cds.Request) => {
      try { return await fn(req); } catch (e) { return e instanceof ProcessError ? req.reject(e.status, e.message) : req.reject(500, e instanceof Error ? e.message : String(e)); }
    };

    this.on('cases', guard(async (req) => listCases(cds.tx(req))));

    this.on('health', () => ({ status: 'OK', mode: 'SIMULATION', sapConnection: 'NOT_CONFIGURED', version: 'v1' }));

    /* ---------------- S1 Anmeldung */
    this.on('registerConstruct', guard(async (req) => {
      const input = (req.data as { construct?: RegistrationInput }).construct;
      if (!input?.buildingId?.trim()) throw new ProcessError(400, 'construct.buildingId is required.');
      if (!Array.isArray(input.participants) || input.participants.length === 0) throw new ProcessError(400, 'construct.participants must contain at least one row.');
      const missing = input.participants.findIndex((p) => !p.role || !p.maloId || !p.meloId);
      if (missing >= 0) throw new ProcessError(400, `participants[${missing}]: role, maloId and meloId are required.`);
      const tx = cds.tx(req);
      const result = await registerConstructs(tx, rowsFromRegistration(input), { file: 'API', actor: actorOf(req) }, { stichtag: input.stichtag });
      await continueProcessing(tx, result.constructIds, actorOf(req)); // Anmeldung is an event: process at once
      return result;
    }));
    this.on('importWorkbook', guard(async (req) => {
      const d = req.data as { fileName?: string; contentBase64?: string };
      if (!d.contentBase64) throw new ProcessError(400, 'contentBase64 is required.');
      let parsed;
      try { parsed = parseParticipantWorkbook(Buffer.from(d.contentBase64, 'base64'), d.fileName ?? 'upload.xlsx'); }
      catch (e) { throw new ProcessError(422, `Workbook rejected: ${e instanceof Error ? e.message : String(e)}`); }
      const tx = cds.tx(req);
      const result = await registerConstructs(tx, parsed.rows, { file: d.fileName ?? 'upload.xlsx', checksum: parsed.checksum, actor: actorOf(req) }, { replaceAll: true });
      await validateAll(tx, actorOf(req));
      return result;
    }));

    /* ---------------- Status input from other systems (simulated SAP / market communication) */
    this.on('updateSapState', guard(async (req) => {
      const d = req.data as { attribute?: SapAttribute; objectId?: string; value?: string };
      if (!d.attribute || !(d.attribute in SAP_VALUES)) throw new ProcessError(400, `attribute must be one of ${Object.keys(SAP_VALUES).join(', ')}.`);
      if (!d.objectId || !d.value || !SAP_VALUES[d.attribute].includes(d.value)) throw new ProcessError(400, `objectId and value (${SAP_VALUES[d.attribute!]?.join(' | ')}) are required.`);
      const tx = cds.tx(req);
      const updated = await updateSapState(tx, d.attribute, d.objectId, d.value, actorOf(req));
      if (!updated) throw new ProcessError(404, `No participant found for ${d.attribute} ${d.objectId} (imsys: MeLo, abmeldung: MaLo, mcm: Einspeise-MaLo).`);
      const field = d.attribute === 'imsys' ? 'meloId' : d.attribute === 'mcm' ? 'generationFeedInMaloId' : 'maloId';
      const affected = await tx.run(SELECT.from('mk7.controlcenter.ParticipantSourceRows').columns('constructId').where({ [field]: d.objectId })) as { constructId: string }[];
      await continueProcessing(tx, affected.map((a) => a.constructId), actorOf(req));
      return validationReport(tx);
    }));

    /* ---------------- S2 Prüfung, S3 Korrektur */
    this.on('validate', 'Constructs', guard(async (req) => {
      const tx = cds.tx(req);
      await validateAll(tx, actorOf(req));
      return validationReport(tx, keyOf(req));
    }));
    this.on('resolve', 'Issues', guard(async (req) => {
      const d = req.data as { resolution: Resolution; value?: string; reason?: string };
      if (!RESOLUTIONS.includes(d.resolution)) throw new ProcessError(400, `resolution must be one of ${RESOLUTIONS.join(', ')}.`);
      const tx = cds.tx(req);
      const report = await resolveIssue(tx, keyOf(req), d.resolution, d.value, d.reason, actorOf(req));
      await continueProcessing(tx, report.issues.flatMap((i) => i.constructIds.split(',')), actorOf(req));
      return validationReport(tx, report.constructId ?? undefined);
    }));
    this.on('resolveIssues', guard(async (req) => {
      const d = req.data as { ids?: string[]; resolution: Resolution; value?: string; reason?: string };
      if (!d.ids?.length) throw new ProcessError(400, 'ids must not be empty.');
      const tx = cds.tx(req);
      let report;
      const constructs = new Set<string>();
      for (const id of d.ids) {
        report = await resolveIssue(tx, id, d.resolution, d.value, d.reason, actorOf(req));
        report.issues.filter((i) => i.ID === id).forEach((i) => i.constructIds.split(',').forEach((c) => constructs.add(c)));
      }
      await continueProcessing(tx, [...constructs], actorOf(req));
      return report;
    }));

    /* ---------------- S5 vSZ gate */
    this.on('confirmVsz', 'Constructs', guard(async (req) => {
      const d = req.data as { itemCodes?: string[]; evidence?: string };
      const tx = cds.tx(req);
      const items = await confirmVsz(tx, keyOf(req), d.itemCodes, d.evidence, actorOf(req));
      await continueProcessing(tx, [keyOf(req)], actorOf(req));
      return items;
    }));
    this.on('setStichtag', 'Constructs', guard(async (req) => {
      const stichtag = (req.data as { stichtag?: string }).stichtag;
      if (!stichtag || !/^\d{4}-\d{2}-\d{2}$/.test(stichtag)) throw new ProcessError(400, 'stichtag must be YYYY-MM-DD.');
      const tx = cds.tx(req);
      await setStichtag(tx, keyOf(req), stichtag, actorOf(req));
      return validationReport(tx, keyOf(req));
    }));

    /* ---------------- S6 Umstellung + automatic pipeline */
    this.on('previewSwitch', 'Constructs', guard(async (req) => switchDto(await previewSwitch(cds.tx(req), keyOf(req)))));
    this.on('executeSwitch', 'Constructs', guard(async (req) => switchDto(await executeSwitch(cds.tx(req), keyOf(req), { actor: actorOf(req), mode: 'MANUAL' }))));
    this.on('process', 'Constructs', guard(async (req) => {
      const run = await processConstruct(cds.tx(req), keyOf(req), actorOf(req), cds.utils.uuid());
      return { ...run, items: items(run.items) };
    }));
    this.on('processAll', guard(async (req) => {
      const result = await processAll(cds.tx(req), actorOf(req), (req.data as { constructIds?: string[] }).constructIds);
      return { ...result, constructs: result.constructs.map((c) => ({ ...c, items: items(c.items) })), simulated: true };
    }));
    this.on('relationshipList', 'Constructs', guard(async (req) => relationshipList(cds.tx(req), keyOf(req))));

    /* ---------------- Manual mode (one MaLo) */
    const validateCommand = (c?: Command): Command => {
      if (!c) throw new ProcessError(400, 'Body must contain a "command" object.');
      if (!OPERATIONS.includes(c.operation)) throw new ProcessError(400, `operation must be one of ${OPERATIONS.join(', ')}.`);
      if (!c.maloId || !c.buildingId) throw new ProcessError(400, 'maloId and buildingId are required.');
      if (c.operation !== 'SET_DORMANT' && !c.effectiveDate) throw new ProcessError(400, 'effectiveDate is required for lifecycle operations.');
      return c;
    };
    const manualDormant = async (req: cds.Request, c: Command, execute: boolean) => {
      const tx = cds.tx(req);
      const ctx = await loadContext(tx);
      const construct = ctx.constructs.find((x) => x.constructId === c.buildingId);
      if (!construct) throw new ProcessError(404, `Construct ${c.buildingId} not found.`);
      if (c.effectiveDate && construct.stichtag && c.effectiveDate !== construct.stichtag) {
        return { operation: c.operation, status: 'BLOCKED', code: 'STICHTAG_MISMATCH', message: `The Umstellung of ${c.buildingId} uses the construct Stichtag ${construct.stichtag}. Change it with setStichtag first.`, maloId: c.maloId, buildingId: c.buildingId, effectiveDate: c.effectiveDate, canExecute: false, simulated: true, checks: [], relationships: [] };
      }
      const plan = execute ? await executeSwitch(tx, c.buildingId, { actor: actorOf(req), mode: 'MANUAL', onlyMaloId: c.maloId }) : await previewSwitch(tx, c.buildingId, c.maloId);
      const item = plan.items.find((i) => i.maloId === c.maloId);
      const findings = currentFindings(execute ? await loadContext(tx) : ctx).filter((f) => f.affects.includes(`MALO:${c.maloId}`));
      const checks = [
        ...MANUAL_CHECK_RULES.map((id) => {
          const hit = findings.find((f) => f.ruleId === id);
          const rule = RULES.find((r) => r.id === id)!;
          return { code: `${id} ${rule.group}`, result: hit ? 'FAILED' : 'PASSED', confidence: hit?.severity === 'WARNING' ? 'UNKNOWN' : 'VERIFIED_SIMULATED', message: hit?.message ?? rule.title };
        }),
        { code: 'vSZ readiness', result: plan.code === 'VSZ_NOT_READY' ? 'FAILED' : 'PASSED', confidence: 'MANUALLY_CONFIRMED', message: plan.code === 'VSZ_NOT_READY' ? plan.message : 'Aufbau vSZ checklist confirmed.' },
      ];
      const requestId = execute ? ((await tx.run(SELECT.one.from('mk7.controlcenter.ProcessRequests').columns('ID').where({ idempotencyKey: `SET_DORMANT|${c.maloId}|${c.buildingId}|${plan.stichtag}` }))) as { ID: string } | undefined)?.ID ?? null : null;
      return {
        operation: c.operation, status: item?.status ?? plan.status, code: item?.code ?? plan.code, message: item?.message ?? plan.message,
        maloId: c.maloId, buildingId: c.buildingId, reststromMaloId: plan.reststromMaloId, effectiveDate: plan.stichtag,
        beforeState: item?.beforeState ?? null, afterState: item?.afterState ?? null, canExecute: item?.status === 'READY', simulated: true, requestId, checks,
        relationships: plan.relationships.filter((r) => r.ownerKey === `MALO:${c.maloId}`).map((r) => ({ kind: r.kind, status: r.status, code: r.context, blocking: false, message: `${r.pdfRef} from ${r.validFrom}`, fromId: r.fromId, toId: r.toId })),
      };
    };
    const lifecycleDto = (c: Command, plan: LifecyclePlan, requestId?: string) => ({
      operation: c.operation, status: plan.status, code: plan.code, message: plan.message, maloId: c.maloId, buildingId: c.buildingId,
      reststromMaloId: null, effectiveDate: c.effectiveDate, beforeState: plan.beforeState, afterState: plan.afterState,
      canExecute: plan.canExecute, simulated: true, requestId: requestId ?? null, relationships: [],
      checks: [{ code: 'Lifecycle rules', result: plan.canExecute || plan.status === 'SUCCESS' ? 'PASSED' : 'FAILED', confidence: 'VERIFIED_SIMULATED', message: plan.message }],
    });
    const lifecycleCommand = (c: Command) => ({ maloId: c.maloId, buildingId: c.buildingId, effectiveDate: c.effectiveDate!, reason: c.reason, referenceOperationId: c.referenceOperationId });
    this.on('preview', guard(async (req) => {
      const c = validateCommand((req.data as { command?: Command }).command);
      if (c.operation === 'SET_DORMANT') return manualDormant(req, c, false);
      return lifecycleDto(c, await planLifecycle(cds.tx(req), c.operation, lifecycleCommand(c)));
    }));
    this.on('execute', guard(async (req) => {
      const c = validateCommand((req.data as { command?: Command }).command);
      if (c.operation === 'SET_DORMANT') return manualDormant(req, c, true);
      const { plan, requestId } = await executeLifecycle(cds.tx(req), c.operation, lifecycleCommand(c), actorOf(req));
      return lifecycleDto(c, plan, requestId);
    }));

    /* ---------------- System */
    this.on('resetDemo', guard(async (req) => {
      if ((req.data as { confirm?: boolean }).confirm !== true) throw new ProcessError(400, 'Set "confirm": true to reset the demo.');
      const tx = cds.tx(req);
      const { rows, checksum } = await readParticipantWorkbook();
      await tx.run(DELETE.from('mk7.controlcenter.AuditEvents'));
      await registerConstructs(tx, rows, { file: WORKBOOK_PATH.split('/').at(-1)!, checksum, actor: 'RESET' }, { replaceAll: true });
      return 'Demo reset: workbook baseline re-registered, simulated state and history cleared. The workbook itself is unchanged.';
    }));
    this.on('runSelfCheck', guard(async () => {
      const results = await runScenarios();
      return { passed: results.filter((r) => r.passed).length, failed: results.filter((r) => !r.passed).length, results: JSON.stringify(results) };
    }));

    await super.init();
  }
}
