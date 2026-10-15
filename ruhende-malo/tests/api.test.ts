/**
 * HTTP integration tests for the public REST API (/api/v1), following the solution map end to end.
 * Starts a real CAP server against a temporary copy of the imported SQLite database;
 * the presentation database is never touched. Tests run in order and share state.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { copyFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const PORT = 4455;
const BASE = `http://localhost:${PORT}/api/v1`;
let server: ChildProcess;
let dir: string;

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const post = async (path: string, payload: object = {}) => {
  const res = await fetch(`${BASE}/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
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

  it('preview never writes', async () => {
    const before = (await get('ProcessRequests')).length;
    const plan = await post('Constructs/B-MUL-01/previewSwitch');
    expect(plan.body.code).toBe('READY');
    expect((await get('ProcessRequests')).length).toBe(before);
  });

  it('first automatic run: clean MaLos become ruhend at once, problems stop only their MaLo', async () => {
    const run = await post('processAll');
    expect(run.body.success).toBe(6);
    for (const m of ['50539603921', '50539603000', '50539603944', '50539603532', '50539603234', '50539603873']) expect(await state(m)).toBe('RUHEND');
    for (const m of ['50539603888', '50539603876', '50539603103', '50539603604']) expect(await state(m)).toBe('ACTIVE');
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
    await post('processAll');
    expect(await state('50539603876')).toBe('RUHEND');
  });

  it('S3 rejects a Korrektur without reason (422) and an unknown resolution (400)', async () => {
    const [id] = await openIssues('V10');
    expect((await post(`Issues/${id}/resolve`, { resolution: 'CONFIRM_ASSUMPTION' })).status).toBe(422);
    expect((await post(`Issues/${id}/resolve`, { resolution: 'DELETE', reason: 'x' })).status).toBe(400);
  });

  it('manual override with reason (iMSys confirmed) lets the next run finish the MaLo', async () => {
    const [id] = await openIssues('V10');
    expect((await post(`Issues/${id}/resolve`, { resolution: 'CONFIRM_ASSUMPTION', reason: 'iMSys installed per MSB note 12.10.' })).status).toBe(200);
    await post('processAll');
    expect(await state('50539603103')).toBe('RUHEND');
  });

  it('Korrektur CHOOSE_BUILDING clears V05; next run switches 50539603888 in Köln', async () => {
    const [v05] = await openIssues('V05');
    expect((await post(`Issues/${v05}/resolve`, { resolution: 'CHOOSE_BUILDING', value: 'B-CGN-01', reason: 'Tenant lives in Köln' })).status).toBe(200);
    await post('processAll');
    expect(await state('50539603888')).toBe('RUHEND');
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
  });

  it('rejects a registration without participants (400)', async () => {
    expect((await post('registerConstruct', { construct: { buildingId: 'B-X', participants: [] } })).status).toBe(400);
  });
});
