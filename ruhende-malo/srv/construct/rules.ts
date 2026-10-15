/**
 * Step S2 — Prüfung der Daten. Pure rule engine (no CAP, no I/O).
 * Sub-checks follow the solution map: Teilnehmerliste, Einspeiser, iMSys, Abmeldeanfrage (+ Zeitscheiben).
 * Every open finding blocks exactly the objects listed in `affects`; other MaLos continue (per-MaLo isolation).
 */
export const ROLE = { reststrom: 'Marktlokation Reststrom', household: 'Haushaltsverbrauch', generation: ['Solaranlage', 'Windkraftanlage'] } as const;
export const isGeneration = (role: string) => (ROLE.generation as readonly string[]).includes(role);

export type Severity = 'ERROR' | 'REVIEW' | 'WARNING' | 'INFO';
export type Resolution = 'CHOOSE_BUILDING' | 'EXCLUDE_PARTICIPANT' | 'FIX_VALUE' | 'CONFIRM_ASSUMPTION';
export type CheckGroup = 'Teilnehmerliste' | 'Einspeiser' | 'iMSys' | 'Abmeldeanfrage' | 'Zeitscheiben';

export interface RuleRow {
  sourceId: string; constructId: string; role: string; participationRaw: string; participates: boolean;
  maloId: string; meloId: string; generationFeedInMaloId?: string | null; reststromMaloId?: string | null;
  excluded: boolean; imsysStatus: string; deregistrationStatus: string; mcmStatus: string;
}
export interface RuleConstruct { constructId: string; stichtag?: string | null }
export interface RulePeriod { maloId: string; businessState: string; validFrom?: string | null; validToExclusive?: string | null }

export interface Finding {
  fingerprint: string; ruleId: string; checkGroup: CheckGroup; severity: Severity;
  constructIds: string[]; objectType: 'MALO' | 'MELO' | 'GENERATOR' | 'CONSTRUCT'; objectId: string; sourceId?: string; field?: string;
  message: string; allowedResolutions: Resolution[];
  /** Blocked objects: `MALO:<id>` (household Umstellung), `GEN:<sourceId>` (Einspeise-MeMa), `CONSTRUCT:<id>` (everything). Empty = notice only. */
  affects: string[];
  /** Pipeline step the finding belongs to (process board column). */
  step: 'PRUEFUNG' | 'PREREQ';
}

export const RULES: { id: string; group: CheckGroup; title: string }[] = [
  { id: 'V01', group: 'Teilnehmerliste', title: 'Required fields present' },
  { id: 'V02', group: 'Teilnehmerliste', title: 'MaLo ID 11 digits (first digit 1–9), MeLo ID 33 characters (DE…)' },
  { id: 'V03', group: 'Teilnehmerliste', title: 'MaLo check digit (BDEW Lok- und Waggon-Verfahren) — notice only' },
  { id: 'V04', group: 'Teilnehmerliste', title: 'Exactly one Reststrom-MaLo per construct' },
  { id: 'V05', group: 'Teilnehmerliste', title: 'MaLo not assigned to several constructs' },
  { id: 'V06', group: 'Teilnehmerliste', title: 'MeLo not assigned twice' },
  { id: 'V07', group: 'Teilnehmerliste', title: 'Teilnahme MK7 is Ja or nein' },
  { id: 'V08', group: 'Einspeiser', title: 'Generation row has an Einspeise-MaLo' },
  { id: 'V09', group: 'Einspeiser', title: 'MCM process completed before Einspeise-MeMa (§6.3)' },
  { id: 'V10', group: 'iMSys', title: 'iMSys installed at every participating Bezugs-MeLo' },
  { id: 'V11', group: 'Abmeldeanfrage', title: 'Current supplier has deregistered the MaLo (Abmeldung confirmed)' },
  { id: 'V12', group: 'Zeitscheiben', title: 'Valid Stichtag, no conflicting dormant period' },
  { id: 'V13', group: 'Teilnehmerliste', title: 'At least one participating household' },
  { id: 'V14', group: 'Einspeiser', title: 'Einspeise-MaLo not shared by several constructs' },
];

const MALO_ID = /^[1-9]\d{10}$/;
const MELO_ID = /^DE[0-9A-Z]{31}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** BDEW AWH "Identifikatoren in der Marktkommunikation" §3.3/§8.1 (Lok- und Waggon-Kennzeichnungsverfahren). */
export function maloCheckDigit(body10: string): number {
  const digits = [...body10].map(Number);
  const odd = digits.filter((_, i) => i % 2 === 0).reduce((a, b) => a + b, 0);
  const even = digits.filter((_, i) => i % 2 === 1).reduce((a, b) => a + b, 0) * 2;
  return (10 - ((odd + even) % 10)) % 10;
}
export const validMaloCheckDigit = (id: string) => MALO_ID.test(id) && maloCheckDigit(id.slice(0, 10)) === Number(id[10]);
const ok = (status: string, ...good: string[]) => [...good, 'CONFIRMED_MANUAL'].includes(status);

/**
 * Validates all constructs together (cross-construct rules need the full picture).
 * `acknowledged` holds fingerprints of findings a person explicitly accepted (CONFIRM_ASSUMPTION without data change).
 */
export function validateConstructs(constructs: RuleConstruct[], allRows: RuleRow[], periods: RulePeriod[], acknowledged: Set<string> = new Set()): Finding[] {
  const rows = allRows.filter((r) => !r.excluded);
  const findings: Finding[] = [];
  const add = (f: Omit<Finding, 'step'> & { step?: Finding['step'] }) => { if (!acknowledged.has(f.fingerprint)) findings.push({ step: 'PRUEFUNG', ...f }); };
  const households = (c: string) => rows.filter((r) => r.constructId === c && r.role === ROLE.household && r.participates);

  for (const r of rows) {
    const target = r.role === ROLE.household ? `MALO:${r.maloId}` : isGeneration(r.role) ? `GEN:${r.sourceId}` : `CONSTRUCT:${r.constructId}`;
    if (!r.role || !r.maloId || !r.meloId) {
      add({ fingerprint: `V01|${r.sourceId}`, ruleId: 'V01', checkGroup: 'Teilnehmerliste', severity: 'ERROR', constructIds: [r.constructId], objectType: 'MALO', objectId: r.maloId || r.sourceId, sourceId: r.sourceId, field: !r.maloId ? 'maloId' : 'meloId', message: 'A required field (role, MaLo or MeLo) is missing.', allowedResolutions: ['FIX_VALUE', 'EXCLUDE_PARTICIPANT'], affects: [target] });
      continue;
    }
    if (!MALO_ID.test(r.maloId)) add({ fingerprint: `V02|${r.sourceId}|maloId`, ruleId: 'V02', checkGroup: 'Teilnehmerliste', severity: 'ERROR', constructIds: [r.constructId], objectType: 'MALO', objectId: r.maloId, sourceId: r.sourceId, field: 'maloId', message: `MaLo ID "${r.maloId}" must have exactly 11 digits and must not start with 0 (BDEW).`, allowedResolutions: ['FIX_VALUE', 'EXCLUDE_PARTICIPANT'], affects: [target] });
    else if (!validMaloCheckDigit(r.maloId)) add({ fingerprint: `V03|${r.maloId}`, ruleId: 'V03', checkGroup: 'Teilnehmerliste', severity: 'INFO', constructIds: [r.constructId], objectType: r.role === ROLE.household ? 'MALO' : 'GENERATOR', objectId: r.maloId, sourceId: r.sourceId, message: `Check digit is ${r.maloId[10]}, BDEW algorithm gives ${maloCheckDigit(r.maloId.slice(0, 10))}. Typical for anonymized test data; a productive run would reject this ID.`, allowedResolutions: [], affects: [] });
    if (!MELO_ID.test(r.meloId)) add({ fingerprint: `V02|${r.sourceId}|meloId`, ruleId: 'V02', checkGroup: 'Teilnehmerliste', severity: 'ERROR', constructIds: [r.constructId], objectType: 'MELO', objectId: r.meloId, sourceId: r.sourceId, field: 'meloId', message: `MeLo ID has ${r.meloId.length} characters; a MeLo ID has 33 (DE + 31). Row: ${r.role} ${r.maloId}.`, allowedResolutions: ['FIX_VALUE', 'EXCLUDE_PARTICIPANT'], affects: [target] });
    if (!['ja', 'nein'].includes(r.participationRaw.trim().toLowerCase())) add({ fingerprint: `V07|${r.sourceId}`, ruleId: 'V07', checkGroup: 'Teilnehmerliste', severity: 'ERROR', constructIds: [r.constructId], objectType: 'MALO', objectId: r.maloId, sourceId: r.sourceId, field: 'participationRaw', message: `Teilnahme MK7 is "${r.participationRaw}"; expected Ja or nein.`, allowedResolutions: ['FIX_VALUE', 'EXCLUDE_PARTICIPANT'], affects: [target] });
    if (isGeneration(r.role)) {
      if (!r.generationFeedInMaloId) add({ fingerprint: `V08|${r.sourceId}`, ruleId: 'V08', checkGroup: 'Einspeiser', severity: 'ERROR', constructIds: [r.constructId], objectType: 'GENERATOR', objectId: r.maloId, sourceId: r.sourceId, field: 'generationFeedInMaloId', message: `${r.role} ${r.maloId} has no Einspeise-MaLo.`, allowedResolutions: ['FIX_VALUE', 'EXCLUDE_PARTICIPANT'], affects: [target] });
      else if (!ok(r.mcmStatus, 'COMPLETED')) add({ step: 'PREREQ', fingerprint: `V09|${r.sourceId}`, ruleId: 'V09', checkGroup: 'Einspeiser', severity: r.mcmStatus === 'OPEN' ? 'WARNING' : 'INFO', constructIds: [r.constructId], objectType: 'GENERATOR', objectId: r.generationFeedInMaloId, sourceId: r.sourceId, message: `MCM process (C1003_M001/C1006_M001) for ${r.role} ${r.maloId} is ${r.mcmStatus}; Einspeise-MeMa is maintained only after completion (§6.3).`, allowedResolutions: ['CONFIRM_ASSUMPTION'], affects: [target] });
    }
  }

  // V05 — same MaLo in several constructs: never decided automatically.
  const byMalo = group(rows.filter((r) => r.role === ROLE.household), (r) => r.maloId);
  for (const [maloId, list] of byMalo) {
    const cs = [...new Set(list.map((r) => r.constructId))];
    if (cs.length > 1) add({ fingerprint: `V05|${maloId}`, ruleId: 'V05', checkGroup: 'Teilnehmerliste', severity: 'REVIEW', constructIds: cs, objectType: 'MALO', objectId: maloId, message: `MaLo is assigned to ${cs.join(' and ')} with different MeLos. Choose the correct construct.`, allowedResolutions: ['CHOOSE_BUILDING', 'EXCLUDE_PARTICIPANT'], affects: [`MALO:${maloId}`] });
  }
  // V06 — same MeLo on different MaLos or constructs.
  for (const [meloId, list] of group(rows, (r) => r.meloId)) {
    if (meloId && new Set(list.map((r) => `${r.constructId}|${r.maloId}`)).size > 1) add({ fingerprint: `V06|${meloId}`, ruleId: 'V06', checkGroup: 'Teilnehmerliste', severity: 'REVIEW', constructIds: [...new Set(list.map((r) => r.constructId))], objectType: 'MELO', objectId: meloId, message: `MeLo is assigned to ${list.length} rows (${list.map((r) => r.maloId).join(', ')}).`, allowedResolutions: ['EXCLUDE_PARTICIPANT'], affects: list.map((r) => (r.role === ROLE.household ? `MALO:${r.maloId}` : `GEN:${r.sourceId}`)) });
  }
  // V14 — one Einspeise-MaLo used by several constructs.
  for (const [feedIn, list] of group(rows.filter((r) => isGeneration(r.role) && r.generationFeedInMaloId), (r) => r.generationFeedInMaloId!)) {
    const cs = [...new Set(list.map((r) => r.constructId))];
    if (cs.length > 1) add({ fingerprint: `V14|${feedIn}`, ruleId: 'V14', checkGroup: 'Einspeiser', severity: 'REVIEW', constructIds: cs, objectType: 'GENERATOR', objectId: feedIn, message: `Einspeise-MaLo ${feedIn} is used by generators in ${cs.join(', ')}. Confirm this is intended before Einspeise-MeMa is maintained.`, allowedResolutions: ['CONFIRM_ASSUMPTION', 'EXCLUDE_PARTICIPANT'], affects: list.map((r) => `GEN:${r.sourceId}`) });
  }

  for (const c of constructs) {
    const own = rows.filter((r) => r.constructId === c.constructId);
    const reststrom = [...new Set(own.filter((r) => r.role === ROLE.reststrom).map((r) => r.maloId))];
    if (reststrom.length !== 1) add({ fingerprint: `V04|${c.constructId}`, ruleId: 'V04', checkGroup: 'Teilnehmerliste', severity: 'ERROR', constructIds: [c.constructId], objectType: 'CONSTRUCT', objectId: c.constructId, message: `Found ${reststrom.length} Reststrom-MaLos; exactly one is required. Re-register the construct.`, allowedResolutions: [], affects: [`CONSTRUCT:${c.constructId}`] });
    const hh = households(c.constructId);
    if (hh.length === 0) add({ fingerprint: `V13|${c.constructId}`, ruleId: 'V13', checkGroup: 'Teilnehmerliste', severity: 'ERROR', constructIds: [c.constructId], objectType: 'CONSTRUCT', objectId: c.constructId, message: 'No participating household in this construct.', allowedResolutions: [], affects: [`CONSTRUCT:${c.constructId}`] });
    for (const r of hh) {
      if (!ok(r.imsysStatus, 'INSTALLED')) add({ step: 'PREREQ', fingerprint: `V10|${r.sourceId}`, ruleId: 'V10', checkGroup: 'iMSys', severity: r.imsysStatus === 'MISSING' ? 'ERROR' : 'WARNING', constructIds: [c.constructId], objectType: 'MALO', objectId: r.maloId, sourceId: r.sourceId, message: r.imsysStatus === 'MISSING' ? `No iMSys at MeLo ${r.meloId}. A virtual summation meter needs an iMSys at every participating MeLo.` : `iMSys status of MeLo ${r.meloId} is UNKNOWN (no SAP/MSB data).`, allowedResolutions: ['CONFIRM_ASSUMPTION', 'EXCLUDE_PARTICIPANT'], affects: [`MALO:${r.maloId}`] });
      if (!ok(r.deregistrationStatus, 'CONFIRMED')) add({ step: 'PREREQ', fingerprint: `V11|${r.sourceId}`, ruleId: 'V11', checkGroup: 'Abmeldeanfrage', severity: 'WARNING', constructIds: [c.constructId], objectType: 'MALO', objectId: r.maloId, sourceId: r.sourceId, message: r.deregistrationStatus === 'PENDING' ? 'Abmeldung by the current supplier is PENDING. While a supplier is still assigned, the MaLo cannot become ruhend.' : 'Abmeldung status of the current supplier is UNKNOWN (no market-communication data).', allowedResolutions: ['CONFIRM_ASSUMPTION', 'EXCLUDE_PARTICIPANT'], affects: [`MALO:${r.maloId}`] });
    }
    if (!c.stichtag || !DATE.test(c.stichtag) || Number.isNaN(Date.parse(`${c.stichtag}T00:00:00Z`))) {
      add({ fingerprint: `V12|${c.constructId}`, ruleId: 'V12', checkGroup: 'Zeitscheiben', severity: 'ERROR', constructIds: [c.constructId], objectType: 'CONSTRUCT', objectId: c.constructId, field: 'stichtag', message: 'Stichtag is missing or not a valid date (YYYY-MM-DD).', allowedResolutions: ['FIX_VALUE'], affects: [`CONSTRUCT:${c.constructId}`] });
    } else {
      for (const r of hh) {
        const dormant = periods.find((p) => p.maloId === r.maloId && p.businessState === 'RUHEND' && !p.validToExclusive);
        if (dormant && dormant.validFrom !== c.stichtag) add({ fingerprint: `V12|${r.maloId}|${c.stichtag}`, ruleId: 'V12', checkGroup: 'Zeitscheiben', severity: 'ERROR', constructIds: [c.constructId], objectType: 'MALO', objectId: r.maloId, message: `MaLo is already RUHEND since ${dormant.validFrom}; a second Zeitscheibe from ${c.stichtag} would overlap. Use Korrektur in manual mode.`, allowedResolutions: ['EXCLUDE_PARTICIPANT'], affects: [`MALO:${r.maloId}`] });
      }
    }
  }
  return findings;
}

/** Objects blocked by open findings. */
export function blockedObjects(findings: Pick<Finding, 'affects'>[]): Set<string> {
  return new Set(findings.flatMap((f) => f.affects));
}

function group<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) map.set(key(item), [...(map.get(key(item)) ?? []), item]);
  return map;
}
