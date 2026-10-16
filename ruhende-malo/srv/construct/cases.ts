import cds from '@sap/cds';
import { ROLE, isGeneration } from './rules.js';
import { loadContext, planFor, processConstruct, type Context } from './service.js';
import type { Step } from './switch-plan.js';

/**
 * One case per participant row — the single truth every screen shows.
 * Computed from the LIVE plan (not from the last run), so a fix is visible immediately.
 */
export type CaseStatus = 'NEW' | 'DONE' | 'READY' | 'WAITING' | 'DECISION' | 'CORRECTION' | 'EXCLUDED' | 'NOT_PARTICIPATING' | 'REACTIVATED';
export type CaseCategory = 'STATUS' | 'VSZ' | 'DECISION' | 'CORRECTION';

const CATEGORY_OF_RULE: Record<string, CaseCategory> = {
  V09: 'STATUS', V10: 'STATUS', V11: 'STATUS',
  V05: 'DECISION', V06: 'DECISION', V14: 'DECISION',
  V01: 'CORRECTION', V02: 'CORRECTION', V04: 'CORRECTION', V07: 'CORRECTION', V08: 'CORRECTION', V12: 'CORRECTION', V13: 'CORRECTION',
};
const PRIORITY: CaseCategory[] = ['DECISION', 'CORRECTION', 'STATUS', 'VSZ'];

export interface CaseIssue { ID: string; ruleId: string; severity: string; checkGroup: string; message: string; allowedResolutions: string; field: string | null; constructIds: string; createdAt: string }
export interface CaseDto {
  caseId: string; constructId: string; city: string | null; maloId: string; meloId: string; role: string; kind: 'HOUSEHOLD' | 'GENERATOR';
  status: CaseStatus; category: CaseCategory | null; code: string; message: string; businessState: string | null;
  steps: Step[]; issues: CaseIssue[]; since: string | null; feedInMaloId: string | null; reststromMaloId: string | null; exclusionReason: string | null;
}

export function buildCases(ctx: Context, cities: Map<string, string>): CaseDto[] {
  const openIssues = ctx.issues.filter((i) => i.status === 'OPEN' && i.affects !== '[]') as unknown as (CaseIssue & { affects: string })[];
  const cases: CaseDto[] = [];
  for (const c of ctx.constructs) {
    const plan = planFor(ctx, c.constructId);
    const rows = ctx.rows.filter((r) => r.constructId === c.constructId && r.role !== ROLE.reststrom);
    for (const r of rows) {
      const key = r.role === ROLE.household ? `MALO:${r.maloId}` : `GEN:${r.sourceId}`;
      const item = plan.items.find((i) => i.sourceId === r.sourceId);
      const issues = openIssues.filter((i) => (JSON.parse(i.affects) as string[]).includes(key));
      const categories = issues.map((i) => CATEGORY_OF_RULE[i.ruleId]).filter(Boolean);
      const category = PRIORITY.find((p) => categories.includes(p)) ?? (plan.code === 'VSZ_NOT_READY' ? 'VSZ' : null);
      const state = ctx.states.get(r.maloId) ?? null;
      const status: CaseStatus = r.excluded ? 'EXCLUDED'
        : !r.participates ? 'NOT_PARTICIPATING'
          : !c.validatedAt ? 'NEW'
          : item?.code === 'REACTIVATED' ? 'REACTIVATED'
            : item?.status === 'ALREADY_DONE' ? 'DONE'
              : category === 'DECISION' ? 'DECISION'
                : category === 'CORRECTION' || ['CONFLICTING_MAMA', 'TIME_SLICE_CONFLICT', 'INVALID_STATE', 'CONSTRUCT_BLOCKED', 'CONSTRUCT_INCOMPLETE'].includes(item?.code ?? '') ? 'CORRECTION'
                  : category ? 'WAITING'
                    : 'READY';
      cases.push({
        caseId: r.sourceId, constructId: c.constructId, city: cities.get(c.constructId) ?? null, maloId: r.maloId, meloId: r.meloId, role: r.role,
        kind: isGeneration(r.role) ? 'GENERATOR' : 'HOUSEHOLD', status, category: ['DONE', 'READY', 'NEW'].includes(status) ? null : category,
        code: item?.code ?? (r.excluded ? 'EXCLUDED' : 'NOT_PLANNED'), message: item?.message ?? (r.excluded ? `Excluded: ${(r as { exclusionReason?: string }).exclusionReason ?? ''}` : ''),
        businessState: state, steps: item?.steps ?? [], since: issues.map((i) => i.createdAt).sort()[0] ?? null,
        issues: issues.map(({ ID, ruleId, severity, checkGroup, message, allowedResolutions, field, constructIds, createdAt }) => ({ ID, ruleId, severity, checkGroup, message, allowedResolutions, field, constructIds, createdAt })),
        feedInMaloId: r.generationFeedInMaloId ?? null, reststromMaloId: r.reststromMaloId ?? null,
        exclusionReason: (r as { exclusionReason?: string | null }).exclusionReason ?? null,
      });
    }
  }
  return cases;
}

export async function listCases(tx: cds.Service): Promise<CaseDto[]> {
  const ctx = await loadContext(tx);
  const constructs = await tx.run(SELECT.from('mk7.controlcenter.Constructs').columns('constructId', 'city')) as { constructId: string; city: string }[];
  return buildCases(ctx, new Map(constructs.map((c) => [c.constructId, c.city])));
}

/** Event-driven continuation: after any fix or status input, the affected constructs are processed again (same engine). */
export async function continueProcessing(tx: cds.Service, constructIds: string[], actor: string): Promise<Awaited<ReturnType<typeof processConstruct>>[]> {
  const runId = cds.utils.uuid();
  const results: Awaited<ReturnType<typeof processConstruct>>[] = [];
  for (const id of [...new Set(constructIds)].filter(Boolean)) results.push(await processConstruct(tx, id, actor, runId));
  return results;
}
