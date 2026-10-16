/**
 * Self-check: real business scenarios executed against the construct engine on isolated in-memory fixtures.
 * Nothing here touches the database; results are computed, never preset.
 */
import { readParticipantWorkbook, ROLES } from '../../scripts/workbook.js';
import { buildLifecyclePlan } from '../domain/lifecycle.js';
import { maloCheckDigit, validateConstructs, type RuleRow } from './rules.js';
import { buildSwitchPlan, type SwitchInput } from './switch-plan.js';

export interface ScenarioResult { id: string; title: string; expected: string; actual: string; passed: boolean }

const C = 'B-TEST';
const RS = '50000000001';
const row = (over: Partial<RuleRow> = {}): RuleRow => ({
  sourceId: `R${Math.random()}`, constructId: C, role: ROLES.household, participationRaw: 'Ja', participates: true,
  maloId: '50000000010', meloId: `DE${'0'.repeat(30)}1`, generationFeedInMaloId: null, reststromMaloId: RS,
  excluded: false, imsysStatus: 'INSTALLED', deregistrationStatus: 'CONFIRMED', mcmStatus: 'COMPLETED', ...over,
});
const reststrom = row({ role: ROLES.reststrom, maloId: RS, meloId: `DE${'0'.repeat(30)}9` });

function run(rows: RuleRow[], over: Partial<SwitchInput> = {}) {
  const construct = { constructId: C, stichtag: '2026-10-01', reststromMaloId: RS };
  const findings = validateConstructs([construct], rows, []);
  return buildSwitchPlan({
    construct, rows, openFindings: findings, vsz: { complete: true, missing: [] },
    states: new Map(rows.map((r) => [r.maloId, 'ACTIVE'])), relationships: [], completed: new Set(), ...over,
  });
}
const status = (plan: ReturnType<typeof run>, maloId: string) => plan.items.find((i) => i.maloId === maloId)?.status ?? 'MISSING';

export async function runScenarios(): Promise<ScenarioResult[]> {
  const results: ScenarioResult[] = [];
  const check = (id: string, title: string, expected: string, actual: string) => results.push({ id, title, expected, actual, passed: expected === actual });

  const hh = row();
  const ok = run([reststrom, hh]);
  check('SC01', 'Eligible household is ready for Umstellung', 'READY', status(ok, hh.maloId));
  check('SC02', 'Umstellung plans MeMa Reststrom→MeLo (§6.1) and MaMa MaLo→Reststrom (§6.2)', 'MEMA:50000000001>DE,MAMA:50000000010>50000000001',
    ok.relationships.map((r) => `${r.kind}:${r.fromId}>${r.toId.slice(0, r.kind === 'MEMA' ? 2 : 11)}`).join(','));

  const nein = row({ maloId: '50000000011', participationRaw: 'nein', participates: false });
  const p2 = run([reststrom, hh, nein]);
  check('SC03', 'Non-participant is skipped and gets no relationship', 'SKIPPED/0', `${status(p2, nein.maloId)}/${p2.relationships.filter((r) => r.fromId === nein.maloId || r.toId === nein.meloId).length}`);

  const other = { ...reststrom, sourceId: 'x', constructId: 'B-OTHER' };
  const dup = [reststrom, hh, other, { ...hh, sourceId: 'y', constructId: 'B-OTHER', meloId: `DE${'0'.repeat(30)}2` }];
  check('SC04', 'MaLo in two constructs goes to REVIEW, never chosen automatically', 'REVIEW', status(run(dup), hh.maloId));

  check('SC05', 'Without vSZ confirmation the construct is blocked', 'VSZ_NOT_READY', run([reststrom, hh], { vsz: { complete: false, missing: ['LASTPROFIL'] } }).code);
  check('SC06', 'Missing Reststrom-MaLo blocks the construct (V04)', 'CONSTRUCT_BLOCKED', run([hh]).code);
  check('SC07', 'Unknown iMSys status blocks the household (V10)', 'BLOCKED', status(run([reststrom, row({ imsysStatus: 'UNKNOWN' })]), hh.maloId));
  check('SC08', 'Conflicting open MaMa target blocks the household', 'CONFLICTING_MAMA',
    run([reststrom, hh], { relationships: [{ kind: 'MAMA', fromLocationId: hh.maloId, toLocationId: '59999999999', validFrom: '2026-01-01' }] }).items.find((i) => i.maloId === hh.maloId)?.code ?? '');
  check('SC09', 'Repeating a completed Umstellung is ALREADY_DONE', 'ALREADY_DONE', status(run([reststrom, hh], {
    states: new Map([[hh.maloId, 'RUHEND']]), completed: new Set([hh.maloId]),
    relationships: [{ kind: 'MEMA', fromLocationId: RS, toLocationId: hh.meloId, validFrom: '2026-10-01' }, { kind: 'MAMA', fromLocationId: hh.maloId, toLocationId: RS, validFrom: '2026-10-01' }],
  }), hh.maloId));

  const gen = row({ sourceId: 'GEN1', role: 'Solaranlage', maloId: '50000000020', meloId: `DE${'0'.repeat(30)}3`, generationFeedInMaloId: '50000000099', mcmStatus: 'UNKNOWN' });
  check('SC10', 'Generator waits for MCM before Einspeise-MeMa (§6.3)', 'WAITING_FOR_MCM', run([reststrom, hh, gen]).items.find((i) => i.sourceId === 'GEN1')?.code ?? '');
  const genPlan = run([reststrom, hh, { ...gen, mcmStatus: 'COMPLETED' }]);
  check('SC11', 'Generator gets MeMa only, never MaMa', '1 MEMA/0 MAMA', `${genPlan.relationships.filter((r) => r.context === 'EINSPEISE_MEMA').length} MEMA/${genPlan.relationships.filter((r) => r.kind === 'MAMA' && r.fromId === gen.maloId).length} MAMA`);
  check('SC12', 'MeLo with 34 characters is rejected (V02)', 'V02', validateConstructs([{ constructId: C, stichtag: '2026-10-01' }], [reststrom, row({ meloId: `DE${'0'.repeat(32)}` })], []).find((f) => f.ruleId === 'V02')?.ruleId ?? 'none');

  const periods = [{ id: 'a', businessState: 'ACTIVE' as const, validToExclusive: '2026-10-01' }, { id: 'r', businessState: 'RUHEND' as const, validFrom: '2026-10-01' }];
  check('SC13', 'Wiederaktivierung of a dormant MaLo after the dormant start', 'READY:ACTIVE', (() => { const p = buildLifecyclePlan({ operation: 'REACTIVATE', effectiveDate: '2026-12-01', currentState: 'RUHEND', periods }); return `${p.status}:${p.afterState}`; })());
  check('SC14', 'Wiederaktivierung before the dormant start is rejected', 'INVALID_CHRONOLOGY', buildLifecyclePlan({ operation: 'REACTIVATE', effectiveDate: '2026-09-01', currentState: 'RUHEND', periods }).code);
  check('SC15', 'Rücknahme without reason is rejected', 'REFERENCE_AND_REASON_REQUIRED', buildLifecyclePlan({ operation: 'REVERSE_TRANSITION', effectiveDate: '2026-12-01', currentState: 'RUHEND', periods, referenceOperationId: 'x' }).code);

  const pending = row({ maloId: '50000000012', meloId: `DE${'0'.repeat(30)}4`, deregistrationStatus: 'PENDING' });
  const p17 = run([reststrom, hh, pending]);
  check('SC17', 'Pending Abmeldung stops only that MaLo; the others continue', 'BLOCKED/READY', `${status(p17, pending.maloId)}/${status(p17, hh.maloId)}`);
  check('SC18', 'BDEW check digit: official example 4137355924 → 1', '1', String(maloCheckDigit('4137355924')));

  const { rows } = await readParticipantWorkbook();
   check('SC16', 'Workbook: 17 assignments, 17 unique MaLos, 10 participating households', '17/17/10', `${rows.length}/${new Set(rows.map((r) => r.maloId)).size}/${rows.filter((r) => r.role === ROLES.household && r.participates).length}`);
  return results;
}
