import { beforeAll, describe, expect, it } from 'vitest';
import { readParticipantWorkbook, type ParticipantRow } from '../scripts/workbook.js';
import { maloCheckDigit, validMaloCheckDigit, validateConstructs, type RuleRow } from '../srv/construct/rules.js';
import { buildSwitchPlan } from '../srv/construct/switch-plan.js';
import { runScenarios } from '../srv/construct/scenario-runner.js';

let rows: RuleRow[];
const constructs = ['B-FRA-01', 'B-CGN-01', 'B-MUL-01'].map((constructId) => ({ constructId, stichtag: '2026-10-01' }));
const toRule = (r: ParticipantRow, over: Partial<RuleRow> = {}): RuleRow => ({
  sourceId: r.sourceId, constructId: r.buildingId, role: r.role, participationRaw: r.participationRaw, participates: r.participates,
  maloId: r.maloId, meloId: r.meloId, generationFeedInMaloId: r.generationFeedInMaloId ?? null, reststromMaloId: r.reststromMaloId ?? null,
  excluded: false, imsysStatus: 'UNKNOWN', deregistrationStatus: 'UNKNOWN', mcmStatus: 'UNKNOWN', ...over,
});
beforeAll(async () => { rows = (await readParticipantWorkbook()).rows.map((r) => toRule(r)); });

const withSap = (over: Record<string, Partial<RuleRow>> = {}) => rows.map((r) => ({ ...r, imsysStatus: 'INSTALLED', deregistrationStatus: 'CONFIRMED', mcmStatus: 'COMPLETED', ...(over[r.maloId] ?? {}) }));

describe('Prüfung der Daten on the real workbook', () => {
  it('finds the real data problems; check digits are notices that block nothing', () => {
    const findings = validateConstructs(constructs, withSap(), []);
    const blocking = findings.filter((f) => f.affects.length).map((f) => `${f.ruleId}:${f.objectId}`).sort();
    expect(blocking).toEqual(['V02:DE00733257078200000000000000880945', 'V05:50539603888', 'V14:51664053767']);
    expect(findings.filter((f) => f.ruleId === 'V03').length).toBe(17); // synthetic IDs fail the BDEW check digit
  });
  it('without SAP state every household waits for iMSys and Abmeldung (UNKNOWN, never assumed)', () => {
    const v10 = validateConstructs(constructs, rows, []).filter((f) => f.ruleId === 'V10' || f.ruleId === 'V11');
    expect(v10.length).toBe(20); // 10 participating household rows × (V10 + V11); 50539603604 is 'nein'
  });
  it('never raises V05 again once one assignment is excluded', () => {
    const corrected = withSap().map((r) => (r.maloId === '50539603888' && r.constructId === 'B-FRA-01' ? { ...r, excluded: true } : r));
    expect(validateConstructs(constructs, corrected, []).some((f) => f.ruleId === 'V05')).toBe(false);
  });
});

describe('BDEW MaLo check digit (AWH Identifikatoren §8.1)', () => {
  it('reproduces the official example 4137355924 → 1', () => expect(maloCheckDigit('4137355924')).toBe(1));
  it('accepts a valid and rejects a wrong check digit', () => { expect(validMaloCheckDigit('41373559241')).toBe(true); expect(validMaloCheckDigit('41373559242')).toBe(false); });
});

describe('Umstellung plan on the real workbook (B-MUL-01)', () => {
  const plan = (over: Record<string, Partial<RuleRow>> = {}) => {
    const data = withSap(over);
    return buildSwitchPlan({
      construct: { constructId: 'B-MUL-01', stichtag: '2026-10-01', reststromMaloId: '50539603639' }, rows: data, openFindings: validateConstructs(constructs, data, []),
      vsz: { complete: true, missing: [] }, states: new Map(data.map((r) => [r.maloId, 'ACTIVE'])), relationships: [], completed: new Set(),
    });
  };
  it('readies 3 households and skips 50539603604 (Teilnahme nein)', () => {
    const items = plan().items;
    expect(items.filter((i) => i.status === 'READY').map((i) => i.maloId).sort()).toEqual(['50539603000', '50539603921', '50539603944']);
    expect(items.find((i) => i.maloId === '50539603604')?.status).toBe('SKIPPED');
  });
  it('plans 3 MeMa from Reststrom-MaLo 50539603639 and 3 MaMa to it, all from the Stichtag', () => {
    const rels = plan().relationships;
    expect(rels.filter((r) => r.context === 'HOUSEHOLD_MEMA').every((r) => r.fromId === '50539603639')).toBe(true);
    expect(rels.filter((r) => r.context === 'MAMA').map((r) => r.toId)).toEqual(['50539603639', '50539603639', '50539603639']);
    expect(rels.every((r) => r.validFrom === '2026-10-01' && r.validToExclusive === null)).toBe(true);
  });
  it('a pending Abmeldung stops only that MaLo, at the prerequisite step', () => {
    const items = plan({ '50539603921': { deregistrationStatus: 'PENDING' } }).items;
    const held = items.find((i) => i.maloId === '50539603921')!;
    expect(held.status).toBe('BLOCKED');
    expect(held.steps.map((s) => s.state)).toEqual(['OK', 'OK', 'WAIT', 'SKIP', 'SKIP', 'SKIP', 'SKIP']);
    expect(items.filter((i) => i.status === 'READY').length).toBe(2);
  });
  it('holds the solar generator back: shared Einspeise-MaLo (V14) needs a decision', () => {
    const gen = plan().items.find((i) => i.role === 'Solaranlage');
    expect(gen?.status).toBe('REVIEW');
    expect(gen?.steps.find((s) => s.id === 'MAMA')?.state).toBe('NA');
  });
});

describe('Self-check scenarios', () => {
  it('all scenarios pass', async () => {
    const failed = (await runScenarios()).filter((r) => !r.passed);
    expect(failed).toEqual([]);
  });
});
