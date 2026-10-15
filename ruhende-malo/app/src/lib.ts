import type { Operation, Snapshot } from './api';

export const ROLE: Record<string, string> = {
  Haushaltsverbrauch: 'Household', 'Marktlokation Reststrom': 'Reststrom', Solaranlage: 'Solar', Windkraftanlage: 'Wind',
};
export const OPERATION: Record<Operation, { label: string; de: string }> = {
  SET_DORMANT: { label: 'Set dormant', de: 'Ruhendstellung' },
  REACTIVATE: { label: 'Reactivate', de: 'Wiederaktivierung' },
  REMOVE_FROM_CONSTRUCT: { label: 'Remove', de: 'Herauslösung' },
  CORRECT_TRANSITION: { label: 'Correct', de: 'Korrektur' },
  REVERSE_TRANSITION: { label: 'Reverse', de: 'Rücknahme' },
};
const OP_LABEL: Record<string, string> = {
  SET_DORMANT: 'Set dormant', MAINTAIN_EINSPEISE_MEMA: 'Einspeise-MeMa', REACTIVATE: 'Reactivated', REMOVE_FROM_CONSTRUCT: 'Herauslösung',
  CORRECT_TRANSITION: 'Korrektur', REVERSE_TRANSITION: 'Rücknahme', RESOLVE_ISSUE: 'Korrektur Daten', CONFIRM_VSZ: 'vSZ confirmed',
  VALIDATE: 'Prüfung', REGISTER_CONSTRUCT: 'Anmeldung', SET_STICHTAG: 'Stichtag changed',
};
export const opLabel = (op: string) => OP_LABEL[op] ?? op;

export const STAGE: Record<string, { label: string; tone: Tone }> = {
  REGISTERED: { label: 'Registered', tone: 'gray' },
  VALIDATED: { label: 'Checked', tone: 'blue' },
  IN_CORRECTION: { label: 'In Korrektur', tone: 'amber' },
  VSZ_READY: { label: 'vSZ ready', tone: 'blue' },
  SWITCHED_PARTIAL: { label: 'Partly switched', tone: 'amber' },
  SWITCHED: { label: 'Switched', tone: 'green' },
};
export const RULE_TITLE: Record<string, string> = {
  V01: 'Required fields', V02: 'ID format', V03: 'MaLo check digit (BDEW)', V04: 'One Reststrom-MaLo', V05: 'MaLo in several constructs', V06: 'MeLo assigned twice',
  V07: 'Teilnahme value', V08: 'Einspeise-MaLo missing', V09: 'MCM not completed', V10: 'iMSys at the Bezugs-MeLo', V11: 'Abmeldung of the current supplier',
  V12: 'Zeitscheiben', V13: 'No participant', V14: 'Shared Einspeise-MaLo',
};

export type Tone = 'green' | 'blue' | 'amber' | 'red' | 'gray' | 'violet';
export function statusTone(status: string): Tone {
  if (['SUCCESS', 'RUHEND', 'READY', 'PASSED', 'CREATED', 'CONFIRMED', 'RESOLVED'].includes(status)) return 'green';
  if (['ACTIVE', 'EXISTS', 'TO_CREATE'].includes(status)) return 'blue';
  if (['REVIEW', 'ASSUMED', 'UNKNOWN', 'ALREADY_DONE', 'WARNING', 'INFO', 'OPEN'].includes(status)) return 'amber';
  if (['BLOCKED', 'ERROR', 'FAILED', 'CONFLICT'].includes(status)) return 'red';
  return 'gray';
}
export const STATE_LABEL: Record<string, string> = { RUHEND: 'Dormant', ACTIVE: 'Active', UNKNOWN: 'Unknown' };

export interface MaloView {
  maloId: string; role: string; constructs: string[]; activeConstructs: string[]; meloIds: string[]; participates: boolean;
  state: string; reststrom?: string | null; excludedReason?: string | null; openIssues: number;
}

/** One entry per unique MaLo; the source rows remain visible as construct/MeLo lists. */
export function maloViews(s: Snapshot): MaloView[] {
  const state = new Map(s.locations.map((l) => [l.maloId, l.businessState]));
  const map = new Map<string, MaloView>();
  for (const p of s.participants) {
    const v = map.get(p.maloId) ?? { maloId: p.maloId, role: p.role, constructs: [], activeConstructs: [], meloIds: [], participates: p.participates, state: state.get(p.maloId) ?? 'UNKNOWN', openIssues: 0 };
    v.constructs.push(p.constructId);
    if (!p.excluded) { v.activeConstructs.push(p.constructId); v.reststrom = p.reststromMaloId; } else v.excludedReason = p.exclusionReason;
    v.meloIds.push(p.meloId);
    map.set(p.maloId, v);
  }
  for (const i of s.issues.filter((x) => x.status === 'OPEN')) {
    const v = map.get(i.objectId); if (v) v.openIssues++;
  }
  return [...map.values()];
}

export const fmtDate = (d?: string | null) => (d ? new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—');
export const fmtTime = (t: string) => new Date(t).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
export const short = (id: string, n = 8) => (id.length > 14 ? `…${id.slice(-n)}` : id);
