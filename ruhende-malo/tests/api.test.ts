/**
 * HTTP integration tests for the public REST API (/api/v1), following the solution map end to end.
 * Starts a real CAP server against a temporary copy of the imported SQLite database;
 * the presentation database is never touched. Tests run in order and share state.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const PORT = 4455;
const BASE = `http://localhost:${PORT}/api/v1`;
let server: ChildProcess;
let dir: string;

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
let token = '';
const login = async (user: string) => ((await (await fetch(`${BASE}/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user }) })).json()) as { token: string }).token;
const send = async (path: string, payload: object, bearer?: string) => {
  const res = await fetch(`${BASE}/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}) }, body: JSON.stringify(payload) });
  const text = await res.text();
  let body: Json;
  try { body = JSON.parse(text) as Json; } catch { body = { value: text }; }
  return { status: res.status, body };
};
const post = async (path: string, payload: object = {}) => {
  const res = await fetch(`${BASE}/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(payload) });
  const text = await res.text();
  let body: Json;
  try { body = JSON.parse(text) as Json; } catch { body = { value: text }; }
  return { status: res.status, body };
};
const get = async <T = Json[]>(path: string) => (await fetch(`${BASE}/${path.replaceAll(' ', '%20')}`)).json() as Promise<T>;
const openIssues = (rule: string) => get<{ ID: string }[]>(`Issues?$filter=status eq 'OPEN' and ruleId eq '${rule}'&$select=ID`).then((r) => r.map((i) => i.ID));
const state = async (maloId: string) => (await get<{ businessState: string }[]>(`MarketLocations?$filter=maloId eq '${maloId}'`))[0]?.businessState;

beforeAll(async () => {
  if (!existsSync('db.sqlite')) throw new Error('Run npm run import:data first.');
  dir = mkdtempSync(join(tmpdir(), 'ruhend-api-'));
  copyFileSync('db.sqlite', join(dir, 'db.sqlite'));
  server = spawn('npx', ['cds', 'serve', '--port', String(PORT)], { env: { ...process.env, cds_requires_db_credentials_url: join(dir, 'db.sqlite') }, stdio: 'pipe' });
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('CAP server did not start')), 30000);
    server.stdout?.on('data', (chunk: Buffer) => { if (chunk.toString().includes('server listening')) { clearTimeout(timer); resolve(); } });
  });
  token = await login('m.weber');
  expect((await post('resetDemo', { confirm: true })).status).toBe(200);
}, 40000);
afterAll(() => { server?.kill(); if (dir) rmSync(dir, { recursive: true, force: true }); });

describe('REST API v1 — construct process', () => {
  it('reports simulation mode and no SAP connection', async () => {
    expect(await get('health()')).toMatchObject({ mode: 'SIMULATION', sapConnection: 'NOT_CONFIGURED' });
  });

  it('S1/S4: 3 constructs, 17 assignments, 16 unique MaLos', async () => {
    expect((await get('Constructs')).length).toBe(3);
    expect((await get('Participants')).length).toBe(17);
    expect((await get('MarketLocations')).length).toBe(16);
    const mul = await get<Json>('Constructs/B-MUL-01');
    expect(mul).toMatchObject({ reststromMaloId: '50539603639', stichtag: '2026-10-01', eligibleCount: 3 });
  });

  it('cases(): before the first check every participant is NEW, the non-participant is NOT_PARTICIPATING', async () => {
    const cases = await get('cases()');
    expect(cases.length).toBe(14); // 17 rows minus 3 Reststrom anchors
    expect(cases.filter((c) => c.status === 'NEW').length).toBe(13);
    expect(cases.find((c) => c.maloId === '50539603604')?.status).toBe('NOT_PARTICIPATING');
  });

  it('re-validating without a run does not mark constructs as processed (cases stay NEW)', async () => {
    await post('Constructs/B-MUL-01/validate');
    const cases = await get('cases()');
    expect(cases.filter((c) => c.status === 'NEW').length).toBe(13);
    expect((await get('Constructs?$select=constructId,validatedAt')).every((c) => !c.validatedAt)).toBe(true);
  });

  it('preview never writes', async () => {
    const before = (await get('ProcessRequests')).length;
    const plan = await post('Constructs/B-MUL-01/previewSwitch');
    expect(plan.body.code).toBe('VSZ_NOT_READY'); // SAP status is only read when the process runs
    expect((await get('VszChecklist')).every((v) => v.status === 'UNKNOWN')).toBe(true);
    expect((await get('ProcessRequests')).length).toBe(before);
  });

  it('first automatic run: reads SAP, clean MaLos become ruhend at once, problems stop only their MaLo', async () => {
    const run = await post('processAll');
    // Stage 3 executes / checks the 10 vSZ steps per construct during the run.
    const vsz = await get('VszChecklist');
    const byCode = (c: string, code: string) => vsz.find((v) => v.constructId === c && v.itemCode === code);
    expect(byCode('B-MUL-01', 'RESTSTROM_MALO')).toMatchObject({ status: 'DONE' });
    expect(byCode('B-MUL-01', 'RESTSTROM_MALO')?.evidence).toContain('50539603639');
    expect(byCode('B-MUL-01', 'GERAETEINFOSATZ')?.evidence).toMatch(/^i18n:vsz\.ev\.GERAETEINFOSATZ\|.*50539603639/); // language-neutral result, translated by the UI
    expect(byCode('B-MUL-01', 'STECKBRIEFE')).toMatchObject({ status: 'CHECKED' });
    expect(byCode('B-MUL-01', 'MESSKONZEPT')).toMatchObject({ status: 'CONFIRMED' });
    expect(byCode('B-CGN-01', 'IMSYS_EINBAU')).toMatchObject({ status: 'CHECKED' }); // workbook column messsystem = iMS/TF for every MeLo
    expect((await get("AuditEvents?$filter=operation eq 'VSZ_SETUP'")).length).toBe(3);
    expect(run.body.success).toBe(6);
    for (const m of ['50539603921', '50539603000', '50539603944', '50539603532', '50539603234', '50539603873']) expect(await state(m)).toBe('RUHEND');
    for (const m of ['50539603888', '50539603876', '50539603103', '50539603604']) expect(await state(m)).toBe('ACTIVE');
    const statuses = (await get('cases()')).reduce((acc: Json, c) => ({ ...acc, [c.status]: (acc[c.status] ?? 0) + 1 }), {});
    expect(statuses).toMatchObject({ DONE: 6, WAITING: 2, NOT_PARTICIPATING: 1 });
    const held = run.body.constructs.flatMap((c: Json) => c.items).find((i: Json) => i.maloId === '50539603876');
    expect(held.steps.map((s: Json) => s.state)).toEqual(['OK', 'OK', 'WAIT', 'SKIP', 'SKIP', 'SKIP', 'SKIP']);
    const rels = await get('Constructs/B-MUL-01/relationshipList()');
    expect(rels.filter((r) => r.context === 'HOUSEHOLD_MEMA' && r.fromId === '50539603639').length).toBe(3);
    expect(rels.filter((r) => r.context === 'MAMA' && r.toId === '50539603639').length).toBe(3);
  });

  it('UTILMD (Einzug Reststrom) is emitted only after the first ruhende MaLo of a construct', async () => {
    const events = await get('Outbox');
    expect(events.filter((e) => e.eventType === 'UTILMD_EINZUG_RESTSTROM_LIEFERANT').map((e) => e.constructId).sort()).toEqual(['B-CGN-01', 'B-FRA-01', 'B-MUL-01']);
  });

  it('status input: the Abmeldung arrives via API and the next run finishes the MaLo automatically', async () => {
    expect((await post('updateSapState', { attribute: 'abmeldung', objectId: '50539603876', value: 'MAYBE' })).status).toBe(400);
    expect((await post('updateSapState', { attribute: 'abmeldung', objectId: '59999999999', value: 'CONFIRMED' })).status).toBe(404);
    expect((await post('updateSapState', { attribute: 'abmeldung', objectId: '50539603876', value: 'CONFIRMED', actor: 'MAKO_GATEWAY' })).status).toBe(200);
    // Event-driven: no manual run needed — the status input continues the construct automatically.
    expect(await state('50539603876')).toBe('RUHEND');
    const c = (await get('cases()')).find((x) => x.maloId === '50539603876');
    expect(c).toMatchObject({ status: 'DONE', category: null });
  });

  it('S3 rejects a Korrektur without reason (422) and an unknown resolution (400)', async () => {
    const [id] = await openIssues('V11');
    expect((await post(`Issues/${id}/resolve`, { resolution: 'CONFIRM_ASSUMPTION' })).status).toBe(422);
    expect((await post(`Issues/${id}/resolve`, { resolution: 'DELETE', reason: 'x' })).status).toBe(400);
  });

  it('iMSys comes from the workbook: no V10 finding for any workbook MaLo', async () => {
    expect((await openIssues('V10')).length).toBe(0);
  });

  it('manual override with reason (Abmeldung confirmed) lets the next run finish the MaLo', async () => {
    const [id] = await openIssues('V11');
    expect((await post(`Issues/${id}/resolve`, { resolution: 'CONFIRM_ASSUMPTION', reason: 'Abmeldung per Lieferantenbrief 12.10. bestätigt' })).status).toBe(200);
    expect(await state('50539603103')).toBe('RUHEND'); // continued automatically
  });

  it('Korrektur CHOOSE_BUILDING clears V05; next run switches 50539603888 in Köln', async () => {
    const [v05] = await openIssues('V05');
    expect((await post(`Issues/${v05}/resolve`, { resolution: 'CHOOSE_BUILDING', value: 'B-CGN-01', reason: 'Tenant lives in Köln' })).status).toBe(200);
    expect(await state('50539603888')).toBe('RUHEND'); // continued automatically
    const cases = (await get('cases()')).filter((x) => x.maloId === '50539603888');
    expect(cases.map((x) => `${x.constructId}:${x.status}`).sort()).toEqual(['B-CGN-01:DONE', 'B-FRA-01:EXCLUDED']);
    const mama = await get(`Relationships?$filter=kind eq 'MAMA' and fromLocationId eq '50539603888'`);
    expect(mama.map((r) => r.toLocationId)).toEqual(['51781215999']);
  });

  it('repeating the run is idempotent (no new success, no new audit events)', async () => {
    const before = (await get('AuditEvents?$filter=operation eq \'SET_DORMANT\'')).length;
    const run = await post('processAll');
    expect(run.body.success).toBe(0);
    expect(run.body.alreadyDone).toBeGreaterThanOrEqual(9);
    expect((await get('AuditEvents?$filter=operation eq \'SET_DORMANT\'')).length).toBe(before);
  });

  it('outbox records downstream handovers as NOT_IMPLEMENTED', async () => {
    const events = await get('Outbox');
    expect(events.filter((e) => e.eventType === 'INVOIC_SCHLUSSRECHNUNG').length).toBe(9);
    expect(events.filter((e) => e.eventType === 'UTILMD_EINZUG_RESTSTROM_LIEFERANT').length).toBe(3);
    expect(events.every((e) => e.status === 'NOT_IMPLEMENTED')).toBe(true);
  });
});

describe('REST API v1 — manual lifecycle', () => {
  const cmd = (operation: string, maloId: string, buildingId: string, effectiveDate: string, extra: object = {}) => ({ command: { operation, maloId, buildingId, effectiveDate, ...extra } });

  it('rejects an unknown operation with 400', async () => {
    expect((await post('execute', cmd('DELETE_EVERYTHING', '50539603921', 'B-MUL-01', '2026-10-01'))).status).toBe(400);
  });

  it('Wiederaktivierung then Rücknahme with reference and reason', async () => {
    const reactivated = await post('execute', cmd('REACTIVATE', '50539603921', 'B-MUL-01', '2026-12-01'));
    expect(reactivated.body).toMatchObject({ status: 'SUCCESS', afterState: 'ACTIVE' });
    expect((await post('execute', cmd('REVERSE_TRANSITION', '50539603921', 'B-MUL-01', '2027-01-01', { referenceOperationId: reactivated.body.requestId }))).body.code).toBe('REFERENCE_AND_REASON_REQUIRED');
    const reversed = await post('execute', cmd('REVERSE_TRANSITION', '50539603921', 'B-MUL-01', '2027-01-01', { referenceOperationId: reactivated.body.requestId, reason: 'Reactivated by mistake' }));
    expect(reversed.body).toMatchObject({ status: 'SUCCESS', afterState: 'RUHEND' });
  });

  it('Herauslösung closes MeMa/MaMa and the pipeline does not re-create them', async () => {
    const removed = await post('execute', cmd('REMOVE_FROM_CONSTRUCT', '50539603000', 'B-MUL-01', '2026-11-01', { reason: 'Tenant leaves MK7' }));
    expect(removed.body.status).toBe('SUCCESS');
    const open = await get(`Relationships?$filter=fromLocationId eq '50539603000' and validToExclusive eq null`);
    expect(open.length).toBe(0);
    await post('processAll');
    expect((await get(`Relationships?$filter=fromLocationId eq '50539603000' and validToExclusive eq null`)).length).toBe(0);
  });
});

describe('REST API v1 — Anmeldung by JSON', () => {
  it('registers a new construct and validates it', async () => {
    const res = await post('registerConstruct', { construct: { buildingId: 'B-TST-01', city: 'Teststadt', stichtag: '2026-11-01', participants: [
      { role: 'Marktlokation Reststrom', maloId: '50000000001', meloId: `DE${'0'.repeat(30)}9` },
      { role: 'Haushaltsverbrauch', maloId: '50000000010', meloId: `DE${'0'.repeat(30)}1`, participates: true },
    ] } });
    expect(res.body).toMatchObject({ constructIds: ['B-TST-01'], households: 1, participating: 1 });
    const report = await post('Constructs/B-TST-01/validate');
    expect(report.body.issues.filter((i: Json) => i.status === 'OPEN' && !i.notice).map((i: Json) => i.ruleId).sort()).toEqual(['V10', 'V11']);
  });

  it('without SAP state the new construct stops at the vSZ gate and sets nothing dormant', async () => {
    const run = await post('Constructs/B-TST-01/process');
    expect(run.body.stoppedAt).toBe('VSZ');
    expect(await state('50000000010')).toBe('ACTIVE');
    const c = (await get('cases()')).find((x) => x.maloId === '50000000010');
    expect(c?.status).toBe('WAITING');
  });

  it('rejects a registration without participants (400)', async () => {
    expect((await post('registerConstruct', { construct: { buildingId: 'B-X', participants: [] } })).status).toBe(400);
  });
});

/* ------------------------------------------------------------------------------------------------
 * End-to-end: every action a user has, driven through the real API on a fresh baseline.
 * ---------------------------------------------------------------------------------------------- */
describe('End-to-end: every user action works and leaves consistent data', () => {
  const issueOf = async (rule: string, objectId?: string) => (await get<{ ID: string; objectId: string }[]>(`Issues?$filter=status eq 'OPEN' and ruleId eq '${rule}'&$select=ID,objectId`)).find((i) => !objectId || i.objectId === objectId);
  const periods = (maloId: string) => get<{ businessState: string; validFrom: string | null; validToExclusive: string | null }[]>(`LifecyclePeriods?$filter=maloId eq '${maloId}'&$orderby=validFrom`);
  const openRels = (query: string) => get(`Relationships?$filter=${query} and validToExclusive eq null`);
  const cmd = (operation: string, maloId: string, buildingId: string, effectiveDate: string, extra: object = {}) => ({ command: { operation, maloId, buildingId, effectiveDate, ...extra } });

  it('baseline via workbook UPLOAD (base64 xlsx): 17 rows, 3 constructs, every participant NEW', async () => {
    const bytes = readFileSync('data/source/Datensatz_Deutsch.xlsx').toString('base64');
    const res = await post('importWorkbook', { fileName: 'Datensatz_Deutsch.xlsx', contentBase64: bytes });
    expect(res.body).toMatchObject({ rows: 17, households: 11, participating: 10 });
    expect((await get('Constructs')).length).toBe(3);
    expect((await get('cases()')).filter((c) => c.status === 'NEW').length).toBe(13);
    expect((await post('importWorkbook', { fileName: 'x.xlsx', contentBase64: Buffer.from('not a workbook').toString('base64') })).status).toBe(422);
  });

  it('first run: 6 ruhend; data error, decisions and waiting cases are parked', async () => {
    const run = await post('processAll');
    expect(run.body.success).toBe(6);
    const st = (await get('cases()')).reduce((a: Json, c) => ({ ...a, [c.status]: (a[c.status] ?? 0) + 1 }), {});
    expect(st).toMatchObject({ DONE: 6, DECISION: 5, WAITING: 2, NOT_PARTICIPATING: 1 });
  });

  it('FIX_VALUE: a wrong MeLo (34 chars) is rejected live, a correct one clears the data error', async () => {
    const v02 = await issueOf('V02');
    expect((await post(`Issues/${v02!.ID}/resolve`, { resolution: 'FIX_VALUE', value: '', reason: 'x' })).status).toBe(422);
    const fixed = await post(`Issues/${v02!.ID}/resolve`, { resolution: 'FIX_VALUE', value: 'DE0073325707820000000000000880945', reason: 'Typo corrected per MSB list' });
    expect(fixed.status).toBe(200);
    expect((await get(`Participants?$filter=maloId eq '51781123945'&$select=meloId`))[0].meloId).toBe('DE0073325707820000000000000880945');
    expect(await issueOf('V02')).toBeUndefined();
  });

  it('status input + manual override resolve the two Abmeldung cases; the MaLos finish by themselves', async () => {
    expect((await post('updateSapState', { attribute: 'abmeldung', objectId: '50539603876', value: 'CONFIRMED', actor: 'MAKO' })).status).toBe(200);
    const v11 = await issueOf('V11', '50539603103');
    expect((await post(`Issues/${v11!.ID}/resolve`, { resolution: 'CONFIRM_ASSUMPTION', reason: 'Lieferantenbrief liegt vor' })).status).toBe(200);
    expect(await state('50539603876')).toBe('RUHEND');
    expect(await state('50539603103')).toBe('RUHEND');
  });

  it('CHOOSE_BUILDING: 50539603888 goes to Köln, Frankfurt excludes it', async () => {
    const v05 = await issueOf('V05');
    expect((await post(`Issues/${v05!.ID}/resolve`, { resolution: 'CHOOSE_BUILDING', value: 'B-NOPE', reason: 'x' })).status).toBe(422);
    expect((await post(`Issues/${v05!.ID}/resolve`, { resolution: 'CHOOSE_BUILDING', value: 'B-CGN-01', reason: 'Tenant lives in Köln' })).status).toBe(200);
    const rows = (await get('cases()')).filter((c) => c.maloId === '50539603888');
    expect(rows.map((c) => `${c.constructId}:${c.status}`).sort()).toEqual(['B-CGN-01:DONE', 'B-FRA-01:EXCLUDED']);
  });

  it('V14 CONFIRM: all three generators get Einspeise-MeMa (MeMa only) to exactly the cleared MeLos of their construct', async () => {
    const v14 = await issueOf('V14');
    expect((await post(`Issues/${v14!.ID}/resolve`, { resolution: 'CONFIRM_ASSUMPTION', reason: 'Shared feed-in is intended' })).status).toBe(200);
    const ein = await openRels(`context eq 'EINSPEISE_MEMA'`);
    expect(ein.length).toBe(9); // CGN 4 + FRA 2 + MUL 3 households
    expect(new Set(ein.map((r) => r.fromLocationId))).toEqual(new Set(['51664053767']));
    expect((await get(`Relationships?$filter=kind eq 'MAMA' and fromLocationId eq '51664053767'`)).length).toBe(0); // never MaMa for generators
  });

  it('the whole pipeline is complete and consistent: 9 ruhend, no open case, UTILMD once per construct', async () => {
    const cases = await get('cases()');
    expect(cases.filter((c) => ['DECISION', 'CORRECTION', 'WAITING'].includes(c.status)).length).toBe(0);
    expect(new Set(cases.filter((c) => c.kind === 'HOUSEHOLD' && c.status === 'DONE').map((c) => c.maloId)).size).toBe(9);
    expect((await get('Outbox?$filter=' + encodeURIComponent("eventType eq 'UTILMD_EINZUG_RESTSTROM_LIEFERANT'"))).length).toBe(3);
    expect(await openRels(`kind eq 'MEMA' and context eq 'HOUSEHOLD_MEMA'`)).toHaveLength(9);
    expect(await openRels(`kind eq 'MAMA'`)).toHaveLength(9);
  });

  it('Korrektur moves the dormant start; MeMa/MaMa follow; the next run does NOT book anything twice', async () => {
    const dormant = (await get(`ProcessRequests?$filter=maloId eq '50539603921' and operation eq 'SET_DORMANT' and status eq 'SUCCESS'`))[0];
    const noReason = await post('execute', cmd('CORRECT_TRANSITION', '50539603921', 'B-MUL-01', '2026-10-15', { referenceOperationId: dormant.ID }));
    expect(noReason.body.code).toBe('REFERENCE_AND_REASON_REQUIRED');
    const done = await post('execute', cmd('CORRECT_TRANSITION', '50539603921', 'B-MUL-01', '2026-10-15', { referenceOperationId: dormant.ID, reason: 'Switch date was 15.10.' }));
    expect(done.body.status).toBe('SUCCESS');
    expect(await periods('50539603921')).toMatchObject([{ businessState: 'ACTIVE', validToExclusive: '2026-10-15' }, { businessState: 'RUHEND', validFrom: '2026-10-15', validToExclusive: null }]);
    { const moved = (await openRels(`fromLocationId eq '50539603921' or toLocationId eq 'DE0001815707800000101300000131964'`)).map((r) => r.validFrom); expect(moved.length).toBeGreaterThanOrEqual(2); expect(new Set(moved)).toEqual(new Set(['2026-10-15'])); } // MeMa and MaMa move together
    const before = { rel: (await get('Relationships')).length, per: (await get('LifecyclePeriods')).length };
    await post('processAll');
    expect((await get(`ProcessRequests?$filter=maloId eq '50539603921' and operation eq 'SET_DORMANT'`))[0].status).toBe('SUCCESS'); // a later run never downgrades history
    expect((await get('cases()')).find((c) => c.maloId === '50539603921')?.status).toBe('DONE'); // a Korrektur is accepted, not flagged as conflict
    expect({ rel: (await get('Relationships')).length, per: (await get('LifecyclePeriods')).length }).toEqual(before);
    expect(await periods('50539603921')).toHaveLength(2);
  });

  it('Herauslösung ends the relationships and takes the MaLo out; the next run keeps it out', async () => {
    const r = await post('execute', cmd('REMOVE_FROM_CONSTRUCT', '50539603000', 'B-MUL-01', '2026-11-01', { reason: 'Tenant leaves MK7' }));
    expect(r.body).toMatchObject({ status: 'SUCCESS', beforeState: 'RUHEND', afterState: 'ACTIVE' }); // leaves the construct and is active again
    expect(await state('50539603000')).toBe('ACTIVE');
    expect(await openRels(`fromLocationId eq '50539603000'`)).toHaveLength(0);
    await post('processAll');
    expect(await openRels(`fromLocationId eq '50539603000'`)).toHaveLength(0);
    expect(await state('50539603000')).toBe('ACTIVE'); // not switched again
    expect((await get('cases()')).find((c) => c.maloId === '50539603000')?.status).toBe('EXCLUDED');
  });

  it('Wiederaktivierung then Rücknahme restore the right states and keep full history', async () => {
    const re = await post('execute', cmd('REACTIVATE', '50539603944', 'B-MUL-01', '2026-12-01'));
    expect(re.body).toMatchObject({ status: 'SUCCESS', afterState: 'ACTIVE' });
    expect((await post('execute', cmd('REACTIVATE', '50539603944', 'B-MUL-01', '2026-12-05'))).body.code).toBe('INVALID_OPERATION_SEQUENCE'); // already active
    const rev = await post('execute', cmd('REVERSE_TRANSITION', '50539603944', 'B-MUL-01', '2027-01-01', { referenceOperationId: re.body.requestId, reason: 'Reactivated by mistake' }));
    expect(rev.body).toMatchObject({ status: 'SUCCESS', afterState: 'RUHEND' });
    expect((await periods('50539603944')).map((p) => p.businessState)).toEqual(['ACTIVE', 'RUHEND', 'ACTIVE', 'RUHEND']);
  });

  it('data invariants hold after everything: no overlap, state = open period, every ruhend MaLo has exactly one open MaMa', async () => {
    const malos = await get<{ maloId: string; businessState: string }[]>('MarketLocations?$select=maloId,businessState');
    for (const m of malos.filter((x) => x.businessState !== 'UNKNOWN')) {
      const ps = await periods(m.maloId);
      const open = ps.filter((p) => !p.validToExclusive);
      if (ps.length) {
        expect(open.length, `open periods of ${m.maloId}`).toBe(1);
        expect(open[0].businessState, `state of ${m.maloId}`).toBe(m.businessState);
        for (let i = 1; i < ps.length; i++) expect((ps[i - 1].validToExclusive ?? '9999') <= (ps[i].validFrom ?? '0000'), `overlap ${m.maloId}`).toBe(true);
      }
      if (m.businessState === 'RUHEND') expect(await openRels(`kind eq 'MAMA' and fromLocationId eq '${m.maloId}'`), `MaMa of ${m.maloId}`).toHaveLength(1);
    }
  });

  it('API registration reaches ruhend: vSZ gate → evidence → status inputs → ruhend; EXCLUDE removes a bad row', async () => {
    const reg = await post('registerConstruct', { construct: { buildingId: 'B-E2E-01', city: 'Teststadt', stichtag: '2026-11-01', participants: [
      { role: 'Marktlokation Reststrom', maloId: '50000000001', meloId: `DE${'0'.repeat(30)}9` },
      { role: 'Haushaltsverbrauch', maloId: '50000000010', meloId: `DE${'0'.repeat(30)}1`, participates: true },
      { role: 'Haushaltsverbrauch', maloId: '5000000002', meloId: `DE${'0'.repeat(30)}2`, participates: true }, // 10 digits: invalid
    ] } });
    expect(reg.status).toBe(200);
    const bad = await issueOf('V02', '5000000002');
    expect(bad).toBeDefined();
    expect((await post(`Issues/${bad!.ID}/resolve`, { resolution: 'EXCLUDE_PARTICIPANT', reason: 'Row is wrong, tenant not registered' })).status).toBe(200);
    expect((await get('cases()')).find((c) => c.maloId === '5000000002')?.status).toBe('EXCLUDED');
    // gate: the DSO-DP order is unknown for an API construct → a person confirms with evidence
    expect((await post('Constructs/B-E2E-01/confirmVsz', { evidence: '' })).status).toBe(422);
    expect((await post('Constructs/B-E2E-01/confirmVsz', { evidence: 'DSO-DP order C1001_M001 confirmed by phone' })).status).toBe(200);
    expect(await state('50000000010')).toBe('ACTIVE'); // still waiting for iMSys + Abmeldung
    await post('updateSapState', { attribute: 'imsys', objectId: `DE${'0'.repeat(30)}1`, value: 'INSTALLED' });
    expect(await state('50000000010')).toBe('ACTIVE');
    await post('updateSapState', { attribute: 'abmeldung', objectId: '50000000010', value: 'CONFIRMED' });
    expect(await state('50000000010')).toBe('RUHEND');
    expect((await get<Json>('Constructs/B-E2E-01')).stage).toBe('SWITCHED');
  });

  it('setStichtag changes the date of an unprocessed construct and the run uses it', async () => {
    await post('registerConstruct', { construct: { buildingId: 'B-E2E-02', city: 'Zweitstadt', stichtag: '2026-11-01', participants: [
      { role: 'Marktlokation Reststrom', maloId: '50000000003', meloId: `DE${'0'.repeat(30)}8` },
      { role: 'Haushaltsverbrauch', maloId: '50000000020', meloId: `DE${'0'.repeat(30)}3`, participates: true },
    ] } });
    expect((await post('Constructs/B-E2E-02/setStichtag', { stichtag: '2026-13-45' })).status).toBe(400);
    expect((await post('Constructs/B-E2E-02/setStichtag', { stichtag: '2026-12-15' })).status).toBe(200);
    expect((await get<Json>('Constructs/B-E2E-02')).stichtag).toBe('2026-12-15');
  });

  it('producer onboarding creates a new construct with separate MeLo and MaLo identifiers', async () => {
    const payload = {
      first_name: 'Anna', last_name: 'Schmidt', email: 'anna.schmidt@example.de', salutation: 'Frau', is_business: true, is_reverse_charge: false,
      deliv_address_street: 'Rathausmarkt', deliv_address_house_number: '1', deliv_address_zipcode: '20095', deliv_address_city: 'Hamburg', subscription_reason: 'E01',
      construct_type: 'FEED_IN', production_type: 'Solar', plant_capacity_kw: 6, plant_specifics: { latitude: 53.55, longitude: 10 },
      market_location_identifier: 'DE0073325707820000000000000090001', market_location_malo: '51781123945', tranche: null,
      preferred_delivery_start: '2026-10-01T00:00:00Z', saas_customer_id: null, saas_contract_id: null, product_name: null,
      consumer_saas_contract_id: null, control_resource: null, technical_resources: null,
      contract_start_utc: '2026-10-01T00:00:00Z', contract_end_utc: '2027-10-01T00:00:00Z', building_id: 'B-HAM-01',
    };
    const res = await fetch(`${BASE}/producer-onboardings`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'Idempotency-Key': 'producer-api-test-001' }, body: JSON.stringify(payload) });
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ building_id: 'B-HAM-01', market_location_identifier: payload.market_location_identifier, market_location_malo: payload.market_location_malo, simulation: true });
    expect(await get<Json>('Constructs/B-HAM-01')).toMatchObject({ constructId: 'B-HAM-01', registrationSource: 'producer-onboardings' });
  });

  it('reset restores the exact baseline: all NEW, no relationships, no handovers, audit shows only the registration', async () => {
    expect((await post('resetDemo', { confirm: true })).status).toBe(200);
    expect((await get('Constructs')).length).toBe(3);
    expect((await get('cases()')).filter((c) => c.status === 'NEW').length).toBe(13);
    expect((await get('Relationships')).length).toBe(0);
    expect((await get('Outbox')).length).toBe(0);
    expect((await get('AuditEvents')).map((e) => e.operation)).toEqual(['REGISTER_CONSTRUCT', 'REGISTER_CONSTRUCT', 'REGISTER_CONSTRUCT']);
  });
});

describe('Access layer: roles, sessions, API keys, audit actor', () => {
  it('rejects writes without a token and lets reads through', async () => {
    const r = await send('processAll', {});
    expect(r.status).toBe(401);
    expect(r.body.error.code).toBe('AUTH_REQUIRED');
    expect((await get('Constructs')).length).toBe(3);
  });

  it('a viewer (read-only API key) may preview but not change anything', async () => {
    const viewer = (await send('createApiKey', { name: 'Read-only', role: 'VIEWER' }, token)).body.token as string;
    expect((await send('processAll', {}, viewer)).body.error.code).toBe('FORBIDDEN');
    expect((await send('Constructs/B-MUL-01/previewSwitch', {}, viewer)).status).toBe(200);
    expect((await send('resetDemo', { confirm: true }, viewer)).status).toBe(403);
  });

  it('rejects a forged or tampered session token', async () => {
    const good = await login('m.weber');
    expect((await send('processAll', {}, `${good.slice(0, -2)}xx`)).status).toBe(401);
    expect((await send('processAll', {}, 's1.m.weber.9999999999999.AAAA')).status).toBe(401);
  });

  it('an API key works once created, is stored hashed, and the audit actor is the key — never a client-supplied name', async () => {
    const created = await send('createApiKey', { name: 'ERP-Test', role: 'PIPELINE' }, token);
    expect(created.status).toBe(200);
    const secret = created.body.token as string;
    expect(secret.startsWith('rk_')).toBe(true);
    expect(JSON.stringify(await get('ApiKeys'))).not.toContain(secret);
    expect((await get<{ ID: string; name: string }[]>('ApiKeys')).find((k) => k.name === 'ERP-Test')).toMatchObject({ revokedAt: null });
    const run = await send('processAll', { actor: 'FORGED' }, secret);
    expect(run.status).toBe(200);
    const actors = new Set((await get('AuditEvents')).map((e) => e.actor));
    expect(actors.has('Key: ERP-Test')).toBe(true);
    expect(actors.has('FORGED')).toBe(false);
    expect((await get('ApiCalls')).some((c) => c.actor === 'Key: ERP-Test' && c.path.endsWith('/processAll') && c.status === 200)).toBe(true);
    expect((await send('resetDemo', { confirm: true }, secret)).status).toBe(403); // a pipeline key cannot reset the demo
  });

  it('a revoked key stops working at once', async () => {
    const created = await send('createApiKey', { name: 'Temp', role: 'MAINTAINER' }, token);
    expect((await send('processAll', {}, created.body.token)).status).toBe(200);
    expect((await send('revokeApiKey', { id: created.body.ID }, token)).body).toBe(true);
    expect((await send('processAll', {}, created.body.token)).status).toBe(401);
    expect((await send('revokeApiKey', { id: created.body.ID }, token)).body.error.code).toBe('KEY_NOT_FOUND');
  });

  it('validates key creation input and the persona list', async () => {
    expect((await send('createApiKey', { name: '  ' }, token)).body.error.code).toBe('KEY_NAME_REQUIRED');
    expect((await send('createApiKey', { name: 'x', role: 'ROOT' }, token)).body.error.code).toBe('KEY_ROLE_INVALID');
    expect((await send('login', { user: 'nobody' })).body.error.code).toBe('USER_UNKNOWN');
    expect((await get<{ id: string }[]>('personas()')).map((p) => p.id)).toEqual(['m.weber']);
    const me = await (await fetch(`${BASE}/me()`, { headers: { Authorization: `Bearer ${token}` } })).json();
    expect(me).toMatchObject({ authenticated: true, name: 'M. Weber', role: 'MAINTAINER' });
  });
});
