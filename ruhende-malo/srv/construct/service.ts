import cds from '@sap/cds';
import { ROLE, validateConstructs, type Finding, type Resolution, type RuleRow } from './rules.js';
import { buildSwitchPlan, completeSteps, type SwitchItem, type SwitchPlan } from './switch-plan.js';
import { VSZ_ITEMS, vszComplete, vszMissing, vszPassed } from './vsz.js';
import { readSapState } from './sap-state.js';
import { runVszSetup } from './vsz-setup.js';

/**
 * Orchestration of the construct process (S2–S7). Domain decisions live in rules.ts / switch-plan.ts;
 * this module only loads state, persists results, verifies writes and records audit + outbox.
 * All writes happen in the caller's CAP transaction. Everything is SIMULATED — no SAP connection.
 */
const ns = (name: string) => `mk7.controlcenter.${name}`;

export interface ConstructRow { constructId: string; stichtag: string | null; reststromMaloId: string | null; validatedAt: string | null }
interface IssueRow { ID: string; fingerprint: string; ruleId: string; checkGroup: string; severity: string; constructId: string; resolutionValue?: string | null; reason?: string | null; resolvedBy?: string | null; resolvedAt?: string | null; status: string; resolution: string | null; message: string; affects: string; constructIds: string; objectType: string; objectId: string; sourceId: string | null; field: string | null; allowedResolutions: string }
interface PeriodRow { ID: string; maloId: string; businessState: string; validFrom: string | null; validToExclusive: string | null }
interface RelRow { ID: string; kind: string; context: string | null; buildingId: string; fromLocationId: string; toLocationId: string; validFrom: string | null; validToExclusive: string | null }

export interface Context {
  constructs: ConstructRow[]; rows: RuleRow[]; periods: PeriodRow[]; issues: IssueRow[];
  checklist: { constructId: string; itemCode: string; status: string }[];
  relationships: RelRow[]; states: Map<string, string>; requests: { maloId: string; buildingId: string; effectiveDate: string; operation: string; status: string }[];
}

export async function loadContext(tx: cds.Service): Promise<Context> {
  const [constructs, rows, periods, issues, checklist, relationships, locations, requests] = await Promise.all([
    tx.run(SELECT.from(ns('Constructs')).columns('constructId', 'stichtag', 'reststromMaloId', 'validatedAt').orderBy('constructId')),
    tx.run(SELECT.from(ns('ParticipantSourceRows')).columns('sourceId', 'constructId', 'role', 'participationRaw', 'participates', 'maloId', 'meloId', 'generationFeedInMaloId', 'reststromMaloId', 'excluded', 'exclusionReason', 'imsysStatus', 'deregistrationStatus', 'mcmStatus').orderBy('sourceRowNumber')),
    tx.run(SELECT.from(ns('LifecyclePeriods')).columns('ID', 'maloId', 'businessState', 'validFrom', 'validToExclusive')),
    tx.run(SELECT.from(ns('ValidationIssues'))),
    tx.run(SELECT.from(ns('VszChecklistItems')).columns('constructId', 'itemCode', 'status')),
    tx.run(SELECT.from(ns('Relationships')).columns('ID', 'kind', 'context', 'buildingId', 'fromLocationId', 'toLocationId', 'validFrom', 'validToExclusive').where({ source: 'SIMULATED' })),
    tx.run(SELECT.from(ns('MarketLocations')).columns('maloId', 'businessState')),
    tx.run(SELECT.from(ns('ProcessRequests')).columns('maloId', 'buildingId', 'effectiveDate', 'operation', 'status')),
  ]) as [ConstructRow[], RuleRow[], PeriodRow[], IssueRow[], Context['checklist'], RelRow[], { maloId: string; businessState: string }[], Context['requests']];
  return { constructs, rows, periods, issues, checklist, relationships, states: new Map(locations.map((l) => [l.maloId, l.businessState])), requests };
}

/** Fingerprints a person explicitly accepted without a data change (CONFIRM_ASSUMPTION). */
const acknowledged = (ctx: Context) => new Set(ctx.issues.filter((i) => i.status === 'RESOLVED' && i.resolution === 'CONFIRM_ASSUMPTION').map((i) => i.fingerprint));
export const currentFindings = (ctx: Context): Finding[] => validateConstructs(ctx.constructs, ctx.rows, ctx.periods, acknowledged(ctx), new Set(ctx.requests.filter((r) => r.operation === 'SET_DORMANT' && r.status === 'SUCCESS').map((r) => `${r.buildingId}|${r.maloId}`)));

/* ------------------------------------------------------------------ S2 Prüfung der Daten */

/** Re-validates all constructs (cross-construct rules need the full picture). Only the given constructs are marked as processed. */
export async function validateAll(tx: cds.Service, actor: string, processed: string[] = []) {
  const ctx = await loadContext(tx);
  const findings = currentFindings(ctx);
  const now = new Date().toISOString();
  const byFingerprint = new Map(ctx.issues.map((i) => [i.fingerprint, i]));
  let opened = 0, cleared = 0;
  for (const f of findings) {
    const record = {
      ruleId: f.ruleId, checkGroup: f.checkGroup, severity: f.severity, constructId: f.constructIds[0], constructIds: f.constructIds.join(','),
      objectType: f.objectType, objectId: f.objectId, sourceId: f.sourceId ?? null, field: f.field ?? null, message: f.message,
      allowedResolutions: f.allowedResolutions.join(','), affects: JSON.stringify(f.affects),
    };
    const existing = byFingerprint.get(f.fingerprint);
    if (!existing) { await tx.run(INSERT.into(ns('ValidationIssues')).entries({ fingerprint: f.fingerprint, ...record, status: 'OPEN' })); opened++; }
    else if (existing.status === 'OPEN') await tx.run(UPDATE(ns('ValidationIssues')).set(record).where({ ID: existing.ID }));
    else { await tx.run(UPDATE(ns('ValidationIssues')).set({ ...record, status: 'OPEN', resolution: null, reason: null }).where({ ID: existing.ID })); opened++; }
  }
  const live = new Set(findings.map((f) => f.fingerprint));
  for (const i of ctx.issues.filter((x) => x.status === 'OPEN' && !live.has(x.fingerprint))) {
    await tx.run(UPDATE(ns('ValidationIssues')).set({ status: 'RESOLVED', resolution: 'AUTO_CLEARED', resolvedBy: 'SYSTEM', resolvedAt: now, reason: null }).where({ ID: i.ID }));
    cleared++;
  }
  if (processed.length) await tx.run(UPDATE(ns('Constructs')).set({ validatedAt: now }).where({ constructId: { in: processed } }));
  await tx.run(INSERT.into(ns('AuditEvents')).entries({ operation: 'VALIDATE', actor, eventTime: now, afterValue: JSON.stringify({ findings: findings.length, opened, cleared }), reason: null, simulated: true }));
  await refreshConstructs(tx);
  return { findings: findings.length, opened, cleared };
}

export async function validationReport(tx: cds.Service, constructId?: string) {
  const issues = await tx.run(SELECT.from(ns('ValidationIssues')).orderBy('ruleId', 'objectId')) as IssueRow[];
  const scoped = constructId ? issues.filter((i) => i.constructIds.split(',').includes(constructId)) : issues;
  const open = scoped.filter((i) => i.status === 'OPEN' && i.affects !== '[]');
  return {
    constructId: constructId ?? null, total: scoped.length, open: open.length,
    blocking: open.filter((i) => i.severity !== 'INFO').length,
    notices: scoped.filter((i) => i.status === 'OPEN' && i.affects === '[]').length,
    issues: scoped.map(toIssueDto),
  };
}
export const toIssueDto = (i: IssueRow) => ({
  ID: i.ID, ruleId: i.ruleId, checkGroup: i.checkGroup, severity: i.severity, status: i.status, constructIds: i.constructIds,
  objectType: i.objectType, objectId: i.objectId, field: i.field, message: i.message, allowedResolutions: i.allowedResolutions,
  notice: i.affects === '[]', resolution: i.resolution, resolutionValue: i.resolutionValue ?? null, reason: i.reason ?? null, resolvedBy: i.resolvedBy ?? null, resolvedAt: i.resolvedAt ?? null,
});

/* ------------------------------------------------------------------ S3 Korrektur Daten */

/** Domain error with a stable machine code and parameters. The REST layer returns code + args; clients translate. */
export class ProcessError extends Error { constructor(readonly status: number, message: string, readonly errorCode = 'ERROR', readonly params: Record<string, string | number> = {}) { super(message); } }

const FIXABLE_FIELDS = new Set(['maloId', 'meloId', 'participationRaw', 'generationFeedInMaloId', 'stichtag']);

export async function resolveIssue(tx: cds.Service, issueId: string, resolution: Resolution, value: string | undefined, reason: string | undefined, actor: string) {
  const issue = await tx.run(SELECT.one.from(ns('ValidationIssues')).where({ ID: issueId })) as IssueRow | undefined;
  if (!issue) throw new ProcessError(404, `Issue ${issueId} not found.`, 'ISSUE_NOT_FOUND');
  if (issue.status !== 'OPEN') throw new ProcessError(409, `Issue is already ${issue.status}.`, 'ISSUE_NOT_OPEN', { status: issue.status });
  if (!issue.allowedResolutions.split(',').includes(resolution)) throw new ProcessError(422, `Resolution ${resolution} is not allowed for ${issue.ruleId}. Allowed: ${issue.allowedResolutions || 'none (re-register the construct)'}.`, 'RESOLUTION_NOT_ALLOWED', { resolution, rule: issue.ruleId });
  if (!reason?.trim()) throw new ProcessError(422, 'A reason is required for every Korrektur.', 'REASON_REQUIRED');
  const now = new Date().toISOString();
  const constructIds = issue.constructIds.split(',');
  const rows = ns('ParticipantSourceRows');

  if (resolution === 'CHOOSE_BUILDING') {
    if (!value || !constructIds.includes(value)) throw new ProcessError(422, `Choose one of: ${constructIds.join(', ')}.`, 'CHOOSE_ONE_OF', { options: constructIds.join(', ') });
    await tx.run(UPDATE(rows).set({ excluded: true, exclusionReason: reason }).where({ maloId: issue.objectId, constructId: { '!=': value } }));
  } else if (resolution === 'EXCLUDE_PARTICIPANT') {
    const where = issue.sourceId ? { sourceId: issue.sourceId }
      : issue.objectType === 'MELO' ? { meloId: issue.objectId }
        : issue.objectType === 'GENERATOR' ? { generationFeedInMaloId: issue.objectId }
          : { maloId: issue.objectId, ...(value ? { constructId: value } : {}) };
    await tx.run(UPDATE(rows).set({ excluded: true, exclusionReason: reason }).where(where));
  } else if (resolution === 'FIX_VALUE') {
    if (!issue.field || !FIXABLE_FIELDS.has(issue.field)) throw new ProcessError(422, 'This finding has no correctable field.', 'NOT_CORRECTABLE');
    if (!value?.trim()) throw new ProcessError(422, `A new value for ${issue.field} is required.`, 'VALUE_REQUIRED', { field: issue.field });
    if (issue.field === 'stichtag') await tx.run(UPDATE(ns('Constructs')).set({ stichtag: value.trim() }).where({ constructId: issue.constructId }));
    else {
      const set: Record<string, unknown> = { [issue.field]: value.trim() };
      if (issue.field === 'participationRaw') set.participates = value.trim().toLowerCase() === 'ja';
      await tx.run(UPDATE(rows).set(set).where({ sourceId: issue.sourceId }));
    }
  } else if (resolution === 'CONFIRM_ASSUMPTION') {
    const column = { V10: 'imsysStatus', V11: 'deregistrationStatus', V09: 'mcmStatus' }[issue.ruleId];
    if (column && issue.sourceId) await tx.run(UPDATE(rows).set({ [column]: 'CONFIRMED_MANUAL' }).where({ sourceId: issue.sourceId }));
  }

  await tx.run(UPDATE(ns('ValidationIssues')).set({ status: 'RESOLVED', resolution, resolutionValue: value ?? null, reason, resolvedBy: actor, resolvedAt: now }).where({ ID: issueId }));
  await tx.run(INSERT.into(ns('AuditEvents')).entries({
    operation: 'RESOLVE_ISSUE', maloId: issue.objectType === 'MALO' ? issue.objectId : null, actor, eventTime: now,
    beforeValue: JSON.stringify({ ruleId: issue.ruleId, objectId: issue.objectId, message: issue.message }),
    afterValue: JSON.stringify({ resolution, value: value ?? null, constructIds }), reason, simulated: true,
  }));
  await validateAll(tx, actor);
  return validationReport(tx, issue.constructId);
}

/* ------------------------------------------------------------------ S5 vSZ gate */

export async function confirmVsz(tx: cds.Service, constructId: string, itemCodes: string[] | undefined, evidence: string | undefined, actor: string) {
  await requireConstruct(tx, constructId);
  if (!evidence?.trim()) throw new ProcessError(422, 'Evidence is required (e.g. "Checked in SAP by <name> on <date>").', 'EVIDENCE_REQUIRED');
  const codes = itemCodes?.length ? itemCodes : VSZ_ITEMS.map((i) => i.itemCode);
  const unknown = codes.filter((c) => !VSZ_ITEMS.some((i) => i.itemCode === c));
  if (unknown.length) throw new ProcessError(422, `Unknown checklist item(s): ${unknown.join(', ')}.`, 'UNKNOWN_VSZ_ITEMS', { items: unknown.join(', ') });
  const now = new Date().toISOString();
  await tx.run(UPDATE(ns('VszChecklistItems')).set({ status: 'CONFIRMED', confirmedBy: actor, confirmedAt: now, evidence }).where({ constructId, itemCode: { in: codes } }));
  await tx.run(INSERT.into(ns('AuditEvents')).entries({ operation: 'CONFIRM_VSZ', actor, eventTime: now, afterValue: JSON.stringify({ constructId, items: codes }), reason: evidence, simulated: true }));
  await refreshConstructs(tx);
  return tx.run(SELECT.from(ns('VszChecklistItems')).where({ constructId }).orderBy('step'));
}

export async function setStichtag(tx: cds.Service, constructId: string, stichtag: string, actor: string) {
  await requireConstruct(tx, constructId);
  await tx.run(UPDATE(ns('Constructs')).set({ stichtag }).where({ constructId }));
  await tx.run(INSERT.into(ns('AuditEvents')).entries({ operation: 'SET_STICHTAG', actor, eventTime: new Date().toISOString(), effectiveDate: stichtag, afterValue: JSON.stringify({ constructId, stichtag }), reason: null, simulated: true }));
  await validateAll(tx, actor);
}

/* ------------------------------------------------------------------ S6 Umstellung */

export async function previewSwitch(tx: cds.Service, constructId: string, onlyMaloId?: string): Promise<SwitchPlan> {
  const ctx = await loadContext(tx);
  return planFor(ctx, constructId, onlyMaloId);
}

export function planFor(ctx: Context, constructId: string, onlyMaloId?: string): SwitchPlan {
  const construct = ctx.constructs.find((c) => c.constructId === constructId);
  if (!construct) throw new ProcessError(404, `Construct ${constructId} not found.`, 'CONSTRUCT_NOT_FOUND', { construct: constructId });
  const checklist = ctx.checklist.filter((c) => c.constructId === constructId);
  const findings = currentFindings(ctx);
  // A MaLo that was switched once stays switched, whatever its date is now (a Korrektur may have moved it).
  const completed = new Set(ctx.requests.filter((r) => r.operation === 'SET_DORMANT' && r.status === 'SUCCESS' && r.buildingId === constructId).map((r) => r.maloId));
  const activeFrom = new Map(ctx.periods.filter((p) => p.businessState === 'ACTIVE' && !p.validToExclusive).map((p) => [p.maloId, p.validFrom]));
  return buildSwitchPlan({
    construct, rows: ctx.rows, openFindings: findings, vsz: { complete: vszComplete(checklist), missing: vszMissing(checklist).map((i) => i.itemCode) },
    states: ctx.states, relationships: ctx.relationships.filter((r) => r.buildingId === constructId), completed, activeFrom, onlyMaloId,
  });
}

export interface ExecuteOptions { actor: string; mode: 'AUTO' | 'MANUAL'; runId?: string; onlyMaloId?: string }

/** Executes a fresh plan: writes relationships and lifecycle, reads them back, and only then reports SUCCESS. */
export async function executeSwitch(tx: cds.Service, constructId: string, options: ExecuteOptions): Promise<SwitchPlan> {
  const ctx = await loadContext(tx);
  const plan = planFor(ctx, constructId, options.onlyMaloId);
  const now = new Date().toISOString();
  const stichtag = plan.stichtag!;
  const items: SwitchItem[] = [];

  for (const item of plan.items) {
    if (item.role === ROLE.reststrom) { items.push(item); continue; }
    if (item.status === 'SKIPPED' && item.code === 'NO_CLEARED_MELOS') { items.push(item); continue; }
    const operation = item.role === ROLE.household ? 'SET_DORMANT' : 'MAINTAIN_EINSPEISE_MEMA';
    const own = plan.relationships.filter((r) => r.ownerKey === item.key && r.status === 'TO_CREATE');
    const key = operation === 'SET_DORMANT' ? `SET_DORMANT|${item.maloId}|${constructId}|${stichtag}` : `EINSPEISE_MEMA|${item.sourceId}|${stichtag}|${plan.relationships.filter((r) => r.ownerKey === item.key).length}`;

    if (item.status !== 'READY') {
      if (item.status !== 'ALREADY_DONE') await upsertRequest(tx, key, { operation, maloId: item.maloId, buildingId: constructId, effectiveDate: stichtag, mode: options.mode, actor: options.actor, batchId: options.runId, status: item.status, resultCode: item.code, resultMessage: item.message.slice(0, 1000), beforeState: item.beforeState, afterState: item.beforeState, trace: JSON.stringify(item.steps) });
      else await tx.run(UPDATE(ns('ProcessRequests')).set({ trace: JSON.stringify(item.steps) }).where({ idempotencyKey: key, status: 'SUCCESS' }));
      items.push(item); continue;
    }
    const requestId = await upsertRequest(tx, key, { operation, maloId: item.maloId, buildingId: constructId, effectiveDate: stichtag, mode: options.mode, actor: options.actor, batchId: options.runId, status: 'PROCESSING', beforeState: item.beforeState, reststromMaloId: plan.reststromMaloId });
    if (own.length) {
      await tx.run(INSERT.into(ns('Relationships')).entries(own.map((r) => ({
        kind: r.kind, context: r.context, source: 'SIMULATED', buildingId: constructId, fromLocationId: r.fromId, toLocationId: r.toId,
        validFrom: r.validFrom, validToExclusive: null, requestId, provenance: `${r.pdfRef} Umstellung — simulated, not written to SAP`,
      }))));
    }
    if (operation === 'SET_DORMANT') {
      await tx.run(UPDATE(ns('LifecyclePeriods')).set({ validToExclusive: stichtag }).where({ maloId: item.maloId, businessState: 'ACTIVE', validToExclusive: null }));
      await tx.run(INSERT.into(ns('LifecyclePeriods')).entries({ maloId: item.maloId, businessState: 'RUHEND', validFrom: stichtag, provenance: 'SIMULATED_UMSTELLUNG' }));
      await tx.run(UPDATE(ns('MarketLocations')).set({ businessState: 'RUHEND' }).where({ maloId: item.maloId }));
    }

    // Read-back verification: never report success for something that is not persisted.
    const written = await tx.run(SELECT.from(ns('Relationships')).columns('kind', 'fromLocationId', 'toLocationId').where({ source: 'SIMULATED', buildingId: constructId, validFrom: stichtag })) as RelRow[];
    const missing = own.filter((r) => !written.some((w) => w.kind === r.kind && w.fromLocationId === r.fromId && w.toLocationId === r.toId));
    const state = operation === 'SET_DORMANT' ? (await tx.run(SELECT.one.from(ns('MarketLocations')).columns('businessState').where({ maloId: item.maloId })) as { businessState: string }).businessState : null;
    if (missing.length || (operation === 'SET_DORMANT' && state !== 'RUHEND')) throw new Error(`Read-back verification failed for ${item.maloId}; transaction rolled back.`);

    const message = operation === 'SET_DORMANT'
      ? `RUHEND from ${stichtag}; MeMa and MaMa to ${plan.reststromMaloId} maintained (simulated, verified in SQLite).`
      : `Einspeise-MeMa to ${own.length} Bezugs-MeLo(s) maintained (simulated, verified in SQLite).`;
    const steps = completeSteps(item.steps);
    await tx.run(UPDATE(ns('ProcessRequests')).set({ status: 'SUCCESS', resultCode: 'SIMULATED_SUCCESS', resultMessage: message, afterState: state ?? item.beforeState, executionTime: now, trace: JSON.stringify(steps) }).where({ ID: requestId }));
    await tx.run(INSERT.into(ns('AuditEvents')).entries({
      requestId, operation, maloId: item.maloId, actor: options.actor, effectiveDate: stichtag, eventTime: now,
      beforeValue: JSON.stringify({ businessState: item.beforeState }),
      afterValue: JSON.stringify({ businessState: state ?? item.beforeState, relationships: own.map((r) => ({ kind: r.kind, context: r.context, from: r.fromId, to: r.toId, validFrom: r.validFrom })) }),
      reason: null, simulated: true,
    }));
    if (operation === 'SET_DORMANT') {
      // Solution map: Umstellung auf ruhende MaLo → Schlussrechnung (INVOIC). Recorded only.
      await outbox(tx, `INVOIC|${item.maloId}|${stichtag}`, constructId, 'INVOIC_SCHLUSSRECHNUNG', 'Schlussrechnung (INVOIC)', item.maloId, { maloId: item.maloId, constructId, stichtag });
    }
    items.push({ ...item, status: 'SUCCESS', code: 'SIMULATED_SUCCESS', message, afterState: state ?? item.beforeState, steps });
  }
  if (plan.code !== 'VSZ_NOT_READY' && plan.code !== 'CONSTRUCT_BLOCKED' && plan.code !== 'CONSTRUCT_INCOMPLETE') {
    // Solution map: Aufbau vSZ → Anpassung EDM (recorded only).
    await outbox(tx, `EDM|${constructId}`, constructId, 'EDM_ANPASSUNG', 'Anpassung EDM', constructId, { constructId, reststromMaloId: plan.reststromMaloId });
  }
  if (items.some((i) => i.status === 'SUCCESS' && i.role === ROLE.household)) {
    await tx.run(UPDATE(ns('Constructs')).set({ switchedAt: now }).where({ constructId }));
    // Market practice: the virtual MaLo is assigned to the Reststrom supplier only after the first ruhende MaLo is confirmed.
    await outbox(tx, `UTILMD|${constructId}`, constructId, 'UTILMD_EINZUG_RESTSTROM_LIEFERANT', 'Einzug Reststrom Lieferant (UTILMD)', plan.reststromMaloId ?? constructId, { constructId, reststromMaloId: plan.reststromMaloId, stichtag });
  }
  await refreshConstructs(tx);
  return { ...plan, items, relationships: plan.relationships.map((r) => (r.status === 'TO_CREATE' && items.find((i) => i.key === r.ownerKey)?.status === 'SUCCESS' ? { ...r, status: 'CREATED' } : r)), status: plan.status, message: summarize(items) };
}

/* ------------------------------------------------------------------ Automatic pipeline */

export async function processConstruct(tx: cds.Service, constructId: string, actor: string, runId: string) {
  await requireConstruct(tx, constructId);
  // Stages 3 + 4: query the (simulated) SAP state now, at run time — nothing is pre-confirmed at import.
  await readSapState(tx, constructId, actor);
  await runVszSetup(tx, constructId, actor);
  await validateAll(tx, actor, [constructId]);
  const preview = await previewSwitch(tx, constructId);
  if (preview.status === 'BLOCKED') {
    await executeSwitch(tx, constructId, { actor, mode: 'AUTO', runId }); // records BLOCKED requests for traceability
    return { constructId, stoppedAt: preview.code === 'VSZ_NOT_READY' ? 'VSZ' : 'PRUEFUNG', message: preview.message, ...(await constructSnapshot(tx, constructId)), items: preview.items };
  }
  const result = await executeSwitch(tx, constructId, { actor, mode: 'AUTO', runId });
  const waiting = result.items.filter((i) => i.status === 'BLOCKED' || i.status === 'REVIEW').length;
  return { constructId, stoppedAt: waiting ? 'KORREKTUR' : 'DONE', message: result.message, ...(await constructSnapshot(tx, constructId)), items: result.items };
}

export async function processAll(tx: cds.Service, actor: string, constructIds?: string[]) {
  const runId = cds.utils.uuid();
  const startedAt = new Date().toISOString();
  const ids = constructIds?.length ? constructIds : (await tx.run(SELECT.from(ns('Constructs')).columns('constructId').orderBy('constructId')) as { constructId: string }[]).map((c) => c.constructId);
  const constructs = [];
  for (const id of ids) constructs.push(await processConstruct(tx, id, actor, runId));
  const all = constructs.flatMap((c) => c.items);
  const count = (s: string) => all.filter((i) => i.status === s).length;
  const summary = { success: count('SUCCESS'), alreadyDone: count('ALREADY_DONE'), skipped: count('SKIPPED'), blocked: count('BLOCKED'), review: count('REVIEW'), error: count('ERROR') };
  await tx.run(INSERT.into(ns('ProcessRuns')).entries({ ID: runId, mode: 'AUTO', scope: ids.join(','), actor, startedAt, finishedAt: new Date().toISOString(), summary: JSON.stringify(summary) }));
  return { runId, ...summary, constructs };
}

/* ------------------------------------------------------------------ S7 Output */

/** §5 list: relationships handed over to Abrechnung (simulated). */
export async function relationshipList(tx: cds.Service, constructId?: string) {
  const rels = await tx.run(SELECT.from(ns('Relationships')).where({ source: 'SIMULATED', ...(constructId ? { buildingId: constructId } : {}) }).orderBy('buildingId', 'kind', 'fromLocationId', 'toLocationId')) as (RelRow & { provenance: string })[];
  return rels.map((r) => ({
    constructId: r.buildingId, kind: r.kind, context: r.context, fromId: r.fromLocationId, toId: r.toLocationId,
    validFrom: r.validFrom, validTo: r.validToExclusive ?? '9999-12-31', open: !r.validToExclusive, provenance: r.provenance,
  }));
}

/* ------------------------------------------------------------------ Helpers */

async function requireConstruct(tx: cds.Service, constructId: string) {
  const c = await tx.run(SELECT.one.from(ns('Constructs')).where({ constructId })) as ConstructRow | undefined;
  if (!c) throw new ProcessError(404, `Construct ${constructId} not found.`, 'CONSTRUCT_NOT_FOUND', { construct: constructId });
  return c;
}

async function upsertRequest(tx: cds.Service, idempotencyKey: string, fields: Record<string, unknown>): Promise<string> {
  const existing = await tx.run(SELECT.one.from(ns('ProcessRequests')).columns('ID', 'status').where({ idempotencyKey })) as { ID: string; status: string } | undefined;
  // History is never downgraded: a successful request stays SUCCESS, whatever a later run finds.
  if (existing?.status === 'SUCCESS' && fields.status !== 'SUCCESS') return existing.ID;
  const data = { ...fields, executionTime: new Date().toISOString(), simulated: true };
  if (existing) { await tx.run(UPDATE(ns('ProcessRequests')).set(data).where({ ID: existing.ID })); return existing.ID; }
  const ID = cds.utils.uuid();
  await tx.run(INSERT.into(ns('ProcessRequests')).entries({ ID, idempotencyKey, ...data }));
  return ID;
}

async function outbox(tx: cds.Service, dedupeKey: string, constructId: string, eventType: string, targetProcess: string, objectId: string, payload: object) {
  const exists = await tx.run(SELECT.one.from(ns('OutboxEvents')).columns('ID').where({ dedupeKey }));
  if (!exists) await tx.run(INSERT.into(ns('OutboxEvents')).entries({ dedupeKey, constructId, eventType, targetProcess, objectId, payload: JSON.stringify(payload), status: 'NOT_IMPLEMENTED' }));
}

const summarize = (items: SwitchItem[]) => {
  const c = (s: string) => items.filter((i) => i.status === s).length;
  return `${c('SUCCESS')} done, ${c('ALREADY_DONE')} already done, ${c('SKIPPED')} skipped, ${c('BLOCKED') + c('REVIEW')} waiting for Korrektur/vSZ.`;
};

/** Recomputes the denormalized construct summary (stage + counts) after every write. */
export async function refreshConstructs(tx: cds.Service) {
  const ctx = await loadContext(tx);
  const open = ctx.issues.filter((i) => i.status === 'OPEN' && i.affects !== '[]');
  for (const c of ctx.constructs) {
    const rows = ctx.rows.filter((r) => r.constructId === c.constructId);
    const households = rows.filter((r) => r.role === ROLE.household);
    const eligible = households.filter((r) => r.participates && !r.excluded);
    const dormant = eligible.filter((r) => ctx.states.get(r.maloId) === 'RUHEND').length;
    const issues = open.filter((i) => i.constructIds.split(',').includes(c.constructId));
    const checklist = ctx.checklist.filter((x) => x.constructId === c.constructId);
    const vszDone = checklist.filter((x) => vszPassed(x.status)).length;
    const stage = eligible.length > 0 && dormant === eligible.length ? 'SWITCHED'
      : dormant > 0 ? 'SWITCHED_PARTIAL'
        : !c.validatedAt ? 'REGISTERED'
          : issues.some((i) => i.severity !== 'INFO') ? 'IN_CORRECTION'
            : vszComplete(checklist) ? 'VSZ_READY' : 'VALIDATED';
    await tx.run(UPDATE(ns('Constructs')).set({
      stage, householdCount: households.length, eligibleCount: eligible.length, dormantCount: dormant,
      excludedCount: rows.filter((r) => r.excluded).length, openIssueCount: issues.length,
      blockingIssueCount: issues.filter((i) => i.severity !== 'INFO').length, vszConfirmed: vszDone, vszTotal: VSZ_ITEMS.length,
    }).where({ constructId: c.constructId }));
  }
}

async function constructSnapshot(tx: cds.Service, constructId: string) {
  const c = await tx.run(SELECT.one.from(ns('Constructs')).columns('stage', 'dormantCount', 'eligibleCount', 'openIssueCount').where({ constructId })) as { stage: string; dormantCount: number; eligibleCount: number; openIssueCount: number };
  return { stage: c.stage, dormantCount: c.dormantCount, eligibleCount: c.eligibleCount, openIssueCount: c.openIssueCount };
}
