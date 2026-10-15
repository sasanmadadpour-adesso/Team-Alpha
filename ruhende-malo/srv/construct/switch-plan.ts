/**
 * Step S6 — Umstellung auf ruhende MaLo inkl. MeMa/MaMa. Pure planning (no I/O).
 *
 * Faithful to Prozessschritte.pdf:
 *  §6.1 MeMa  — from the Reststrom-MaLo's Anlage to ALL participating Bezugs-MeLos.
 *  §6.2 MaMa  — each participating Bezugs-MaLo gets the Reststrom-MaLo with the relevant Zeitscheibe.
 *  §6.3 Einspeise-MeMa — generator: MeMa only (never MaMa), only after the MCM process is completed.
 * Zeitscheibe convention: half-open [validFrom, validToExclusive); open end (null) = SAP 31.12.9999.
 *
 * Every item carries a step trace (process board): PRUEFUNG → VSZ → PREREQ → MEMA → MAMA → RUHEND → UEBERGABE.
 * A problem stops only the affected item; the first failing step is marked and later steps are "not reached".
 */
import { ROLE, isGeneration, type RuleRow } from './rules.js';

export type ItemStatus = 'READY' | 'SUCCESS' | 'SKIPPED' | 'ALREADY_DONE' | 'BLOCKED' | 'REVIEW' | 'ERROR';
export type RelationshipContext = 'HOUSEHOLD_MEMA' | 'MAMA' | 'EINSPEISE_MEMA';
export type StepId = 'PRUEFUNG' | 'VSZ' | 'PREREQ' | 'MEMA' | 'MAMA' | 'RUHEND' | 'UEBERGABE';
export type StepState = 'OK' | 'DONE' | 'TODO' | 'FAIL' | 'WAIT' | 'SKIP' | 'NA';
export interface Step { id: StepId; state: StepState; detail: string }
export const STEP_ORDER: StepId[] = ['PRUEFUNG', 'VSZ', 'PREREQ', 'MEMA', 'MAMA', 'RUHEND', 'UEBERGABE'];

export interface PlannedRelationship {
  kind: 'MEMA' | 'MAMA'; context: RelationshipContext; pdfRef: string;
  fromId: string; toId: string; validFrom: string; validToExclusive: null;
  status: 'TO_CREATE' | 'EXISTS' | 'CREATED'; ownerKey: string;
}
export interface SwitchItem {
  key: string; sourceId: string; maloId: string; meloId: string; role: string;
  status: ItemStatus; code: string; message: string; beforeState: string | null; afterState: string | null;
  steps: Step[];
}
export interface SwitchPlan {
  constructId: string; stichtag: string | null; reststromMaloId: string | null;
  status: 'READY' | 'BLOCKED' | 'NOTHING_TO_DO'; code: string; message: string;
  items: SwitchItem[]; relationships: PlannedRelationship[];
}
export interface ExistingRelationship { kind: string; context?: string | null; fromLocationId: string; toLocationId: string; validFrom?: string | null; validToExclusive?: string | null }
export interface FindingRef { ruleId: string; severity: string; message: string; affects: string[]; step?: 'PRUEFUNG' | 'PREREQ' }
export interface SwitchInput {
  construct: { constructId: string; stichtag?: string | null; reststromMaloId?: string | null };
  rows: RuleRow[];
  openFindings: FindingRef[];
  vsz: { complete: boolean; missing: string[] };
  states: Map<string, string>;
  relationships: ExistingRelationship[];
  /** MaLos with a successful SET_DORMANT at this Stichtag (idempotency). */
  completed: Set<string>;
  /** Start of the currently open ACTIVE period per MaLo (null = since baseline). */
  activeFrom?: Map<string, string | null>;
  /** Manual mode: restrict to one household MaLo. Generators are only handled in the construct run. */
  onlyMaloId?: string;
}

type Overrides = Partial<Record<StepId, [StepState, string]>>;

/** Builds a step trace: steps before `at` are OK, `at` gets the state, later steps are not reached. */
function trace(at: StepId | null, state: StepState, detail: string, overrides: Overrides = {}): Step[] {
  const idx = at ? STEP_ORDER.indexOf(at) : STEP_ORDER.length;
  return STEP_ORDER.map((id, i) => {
    const o = overrides[id];
    if (o) return { id, state: o[0], detail: o[1] };
    if (i < idx) return { id, state: 'OK', detail: '' };
    if (i === idx) return { id, state, detail };
    return { id, state: 'SKIP', detail: 'Not reached' };
  });
}
const findingState = (f: FindingRef[]): StepState => (f.some((x) => x.severity === 'ERROR') ? 'FAIL' : 'WAIT');
const describe = (f: FindingRef[]) => f.map((x) => `${x.ruleId}: ${x.message}`).join(' ');
const GENERATOR_NA: Overrides = { MAMA: ['NA', 'Generators get no MaMa (§6.3)'], RUHEND: ['NA', 'Not a dormancy target'], UEBERGABE: ['NA', ''] };
const asGenerator = (steps: Step[]) => steps.map((s) => { const o = GENERATOR_NA[s.id]; return o ? { id: s.id, state: o[0], detail: o[1] } : s; });

export function buildSwitchPlan(input: SwitchInput): SwitchPlan {
  const { construct } = input;
  const stichtag = construct.stichtag ?? null;
  const reststrom = construct.reststromMaloId ?? null;
  const rows = input.rows.filter((r) => r.constructId === construct.constructId && !r.excluded && (!input.onlyMaloId || r.maloId === input.onlyMaloId));
  const base = { constructId: construct.constructId, stichtag, reststromMaloId: reststrom };
  const findingsFor = (key: string) => input.openFindings.filter((f) => f.affects.includes(key));
  const constructFindings = findingsFor(`CONSTRUCT:${construct.constructId}`);

  const item = (r: RuleRow, status: ItemStatus, code: string, message: string, steps: Step[], after?: string | null): SwitchItem => ({
    key: r.role === ROLE.household ? `MALO:${r.maloId}` : `GEN:${r.sourceId}`, sourceId: r.sourceId, maloId: r.maloId, meloId: r.meloId, role: r.role,
    status, code, message, steps: isGeneration(r.role) ? asGenerator(steps) : steps,
    beforeState: input.states.get(r.maloId) ?? null, afterState: after === undefined ? input.states.get(r.maloId) ?? null : after,
  });

  if (input.onlyMaloId && rows.length === 0) {
    return { ...base, status: 'BLOCKED', code: 'MALO_NOT_IN_CONSTRUCT', message: `MaLo ${input.onlyMaloId} is not an active participant of ${construct.constructId}.`, items: [], relationships: [] };
  }

  // Construct-level gate: stops only this construct; other constructs continue.
  const gate = constructFindings.length
    ? { code: 'CONSTRUCT_BLOCKED', message: describe(constructFindings), at: 'PRUEFUNG' as StepId }
    : !reststrom || !stichtag ? { code: 'CONSTRUCT_INCOMPLETE', message: 'Reststrom-MaLo or Stichtag missing.', at: 'PRUEFUNG' as StepId }
      : !input.vsz.complete ? { code: 'VSZ_NOT_READY', message: `Aufbau vSZ not confirmed: ${input.vsz.missing.length} checklist item(s) open (${input.vsz.missing.join(', ')}).`, at: 'VSZ' as StepId }
        : undefined;
  if (gate) {
    return {
      ...base, status: 'BLOCKED', code: gate.code, message: gate.message, relationships: [],
      items: rows.filter((r) => r.role !== ROLE.reststrom).map((r) => {
        const own = findingsFor(r.role === ROLE.household ? `MALO:${r.maloId}` : `GEN:${r.sourceId}`).filter((f) => f.step !== 'PREREQ');
        const steps = own.length && gate.at === 'VSZ' ? trace('PRUEFUNG', findingState(own), describe(own)) : trace(gate.at, gate.at === 'VSZ' ? 'WAIT' : 'FAIL', gate.message);
        return item(r, 'BLOCKED', gate.code, gate.message, steps);
      }),
    };
  }

  const open = input.relationships.filter((r) => !r.validToExclusive || r.validToExclusive > stichtag!);
  const exists = (kind: string, from: string, to: string) => open.some((r) => r.kind === kind && r.fromLocationId === from && r.toLocationId === to && (r.validFrom ?? '') <= stichtag!);
  const rel = (kind: 'MEMA' | 'MAMA', context: RelationshipContext, pdfRef: string, fromId: string, toId: string, ownerKey: string): PlannedRelationship =>
    ({ kind, context, pdfRef, fromId, toId, validFrom: stichtag!, validToExclusive: null, status: exists(kind, fromId, toId) ? 'EXISTS' : 'TO_CREATE', ownerKey });

  const items: SwitchItem[] = [];
  const relationships: PlannedRelationship[] = [];
  const clearedMelos: string[] = [];
  const blockedAt = (blocking: FindingRef[]) => {
    const pruefung = blocking.filter((f) => f.step !== 'PREREQ');
    const relevant = pruefung.length ? pruefung : blocking;
    return trace(pruefung.length ? 'PRUEFUNG' : 'PREREQ', findingState(relevant), describe(relevant));
  };

  for (const r of rows.filter((x) => x.role === ROLE.household)) {
    const key = `MALO:${r.maloId}`;
    if (!r.participates) {
      items.push(item(r, 'SKIPPED', 'NOT_PARTICIPATING', 'Teilnahme MK7 = nein: no MeMa/MaMa, MaLo stays ACTIVE.', trace(null, 'OK', '', { PREREQ: ['NA', 'Teilnahme nein'], MEMA: ['NA', ''], MAMA: ['NA', ''], RUHEND: ['NA', 'Stays ACTIVE'], UEBERGABE: ['NA', ''] })));
      continue;
    }
    const blocking = findingsFor(key);
    if (blocking.length) {
      items.push(item(r, blocking.some((f) => f.severity === 'REVIEW') ? 'REVIEW' : 'BLOCKED', blocking[0].ruleId, describe(blocking), blockedAt(blocking)));
      continue;
    }
    const conflictingMama = open.find((x) => x.kind === 'MAMA' && x.fromLocationId === r.maloId && x.toLocationId !== reststrom);
    if (conflictingMama) { const m = `An open MaMa already points to ${conflictingMama.toLocationId}.`; items.push(item(r, 'BLOCKED', 'CONFLICTING_MAMA', m, trace('MAMA', 'FAIL', m))); continue; }
    const memo = rel('MEMA', 'HOUSEHOLD_MEMA', '§6.1', reststrom!, r.meloId, key);
    const mama = rel('MAMA', 'MAMA', '§6.2', r.maloId, reststrom!, key);
    const state = input.states.get(r.maloId);
    if (state === 'RUHEND' && input.completed.has(r.maloId)) {
      clearedMelos.push(r.meloId);
      if (memo.status === 'EXISTS' && mama.status === 'EXISTS') {
        relationships.push(memo, mama);
        items.push(item(r, 'ALREADY_DONE', 'ALREADY_DONE', 'Already RUHEND with MeMa and MaMa for this Stichtag.', STEP_ORDER.map((id) => ({ id, state: 'DONE' as StepState, detail: '' }))));
        continue;
      }
    } else if (state === 'ACTIVE' && input.completed.has(r.maloId)) {
      const m = `Was set dormant from ${stichtag} and reactivated later (manual Wiederaktivierung); not switched again automatically.`;
      items.push(item(r, 'SKIPPED', 'REACTIVATED', m, trace(null, 'OK', '', { MEMA: ['DONE', ''], MAMA: ['DONE', ''], RUHEND: ['NA', m], UEBERGABE: ['NA', ''] }))); continue;
    } else if (state === 'ACTIVE' && (input.activeFrom?.get(r.maloId) ?? '') >= stichtag!) {
      const m = `MaLo is ACTIVE since ${input.activeFrom?.get(r.maloId)}; a RUHEND Zeitscheibe from ${stichtag} would overlap.`;
      items.push(item(r, 'BLOCKED', 'TIME_SLICE_CONFLICT', m, trace('RUHEND', 'FAIL', m))); continue;
    } else if (state !== 'ACTIVE') {
      const m = `Business state is ${state ?? 'unknown'}; only ACTIVE MaLos can be set dormant.`;
      items.push(item(r, 'BLOCKED', 'INVALID_STATE', m, trace('RUHEND', 'FAIL', m))); continue;
    } else clearedMelos.push(r.meloId);
    relationships.push(memo, mama);
    items.push(item(r, 'READY', 'READY', `MeMa ${reststrom} → ${r.meloId} (§6.1), MaMa ${r.maloId} → ${reststrom} (§6.2), then RUHEND from ${stichtag}.`, trace(null, 'OK', '', {
      MEMA: [memo.status === 'EXISTS' ? 'DONE' : 'TODO', `${reststrom} → ${r.meloId} (§6.1)`],
      MAMA: [mama.status === 'EXISTS' ? 'DONE' : 'TODO', `${r.maloId} → ${reststrom} from ${stichtag} (§6.2)`],
      RUHEND: ['TODO', `RUHEND from ${stichtag}`], UEBERGABE: ['TODO', 'Schlussrechnung (INVOIC) event'],
    }), 'RUHEND'));
  }

  for (const r of rows.filter((x) => x.role === ROLE.reststrom)) {
    items.push(item(r, 'SKIPPED', 'RESTSTROM_TARGET', 'Reststrom-MaLo is the anchor of the construct, not a dormancy candidate.', STEP_ORDER.map((id) => ({ id, state: 'NA' as StepState, detail: 'Anchor' }))));
  }

  if (!input.onlyMaloId) {
    for (const r of rows.filter((x) => isGeneration(x.role))) {
      const key = `GEN:${r.sourceId}`;
      const blocking = findingsFor(key);
      if (blocking.length) {
        const waitingForMcm = blocking.every((f) => f.ruleId === 'V09');
        items.push(item(r, blocking.some((f) => f.severity === 'REVIEW') ? 'REVIEW' : 'BLOCKED', waitingForMcm ? 'WAITING_FOR_MCM' : blocking[0].ruleId, describe(blocking), blockedAt(blocking)));
        continue;
      }
      if (!r.participates) { items.push(item(r, 'SKIPPED', 'NOT_PARTICIPATING', 'Generator does not participate.', trace('PREREQ', 'NA', 'Teilnahme nein'))); continue; }
      const planned = clearedMelos.map((melo) => rel('MEMA', 'EINSPEISE_MEMA', '§6.3', r.generationFeedInMaloId!, melo, key));
      relationships.push(...planned);
      const todo = planned.filter((p) => p.status === 'TO_CREATE').length;
      const memaDetail = `${r.generationFeedInMaloId} → ${planned.length} Bezugs-MeLo(s) (§6.3)`;
      items.push(planned.length === 0
        ? item(r, 'SKIPPED', 'NO_CLEARED_MELOS', 'No participating Bezugs-MeLo is cleared yet.', trace('MEMA', 'WAIT', 'No cleared Bezugs-MeLo yet'))
        : todo === 0 ? item(r, 'ALREADY_DONE', 'ALREADY_DONE', `Einspeise-MeMa to ${planned.length} Bezugs-MeLo(s) already maintained.`, trace(null, 'OK', '', { MEMA: ['DONE', memaDetail] }))
          : item(r, 'READY', 'READY', `Einspeise-MeMa ${r.generationFeedInMaloId} → ${todo} Bezugs-MeLo(s) (§6.3, MeMa only, no MaMa).`, trace(null, 'OK', '', { MEMA: ['TODO', memaDetail] })));
    }
  }

  const ready = items.some((i) => i.status === 'READY');
  return {
    ...base, status: ready ? 'READY' : 'NOTHING_TO_DO', code: ready ? 'READY' : 'NOTHING_TO_DO',
    message: ready ? `${items.filter((i) => i.status === 'READY').length} item(s) ready for simulated Umstellung on ${stichtag}.` : 'Nothing to execute: all items are done, skipped or waiting for Korrektur.',
    items, relationships,
  };
}

/** After a verified write, planned (TODO) steps become DONE. */
export const completeSteps = (steps: Step[]): Step[] => steps.map((s) => (s.state === 'TODO' ? { ...s, state: 'DONE' as StepState } : s));
