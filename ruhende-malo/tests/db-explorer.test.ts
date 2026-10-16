/**
 * Database explorer (/api/v1/db/*): read-only catalog and rows, redaction of secrets and personal data,
 * and the live monitor stream. Runs a real CAP server against a temporary copy of the database.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { copyFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const PORT = 4457;
const BASE = `http://localhost:${PORT}/api/v1`;
let server: ChildProcess;
let dir: string;
let token = '';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const get = async (path: string, bearer: string | null = token) => {
  const res = await fetch(`${BASE}/${path}`, { headers: bearer ? { Authorization: `Bearer ${bearer}` } : {} });
  return { status: res.status, body: (await res.json()) as Json };
};
const post = async (path: string, payload: object) => {
  const res = await fetch(`${BASE}/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(payload) });
  const text = await res.text();
  let body: Json;
  try { body = JSON.parse(text) as Json; } catch { body = { value: text }; }
  return { status: res.status, body };
};
const counts = async () => Object.fromEntries(((await get('db/catalog')).body.tables as Json[]).map((t) => [t.name, t.rows as number]));

beforeAll(async () => {
  if (!existsSync('db.sqlite')) throw new Error('Run npm run import:data first.');
  dir = mkdtempSync(join(tmpdir(), 'ruhend-db-'));
  copyFileSync('db.sqlite', join(dir, 'db.sqlite'));
  server = spawn('npx', ['cds', 'serve', '--port', String(PORT)], { env: { ...process.env, cds_requires_db_credentials_url: join(dir, 'db.sqlite') }, stdio: 'pipe' });
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('CAP server did not start')), 30000);
    server.stdout?.on('data', (chunk: Buffer) => { if (chunk.toString().includes('server listening')) { clearTimeout(timer); resolve(); } });
  });
  token = ((await (await fetch(`${BASE}/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user: 'm.weber' }) })).json()) as { token: string }).token;
  expect((await post('resetDemo', { confirm: true })).status).toBe(200);
}, 40000);
afterAll(() => { server?.kill(); if (dir) rmSync(dir, { recursive: true, force: true }); });

describe('database explorer — catalog and rows', () => {
  it('requires a token for every /db endpoint', async () => {
    for (const path of ['db/catalog', 'db/tables/Constructs/rows', 'db/stream']) {
      const res = await fetch(`${BASE}/${path}`);
      expect(res.status, path).toBe(401);
      await res.body?.cancel();
    }
  });

  it('lists every persisted table of the model with grouped columns and real row counts', async () => {
    const { status, body } = await get('db/catalog');
    expect(status).toBe(200);
    expect(body.kind).toBe('sqlite');
    const tables = body.tables as Json[];
    const names = tables.map((t) => t.name);
    for (const n of ['Constructs', 'ParticipantSourceRows', 'MarketLocations', 'Relationships', 'LifecyclePeriods', 'AuditEvents', 'ApiCalls', 'HourlyConsumption']) expect(names).toContain(n);
    expect(names.some((n: string) => n.includes('.') || n.startsWith('ProcessApi'))).toBe(false); // no views or service projections
    expect(tables.every((t) => t.group !== 'other')).toBe(true);
    const byName = Object.fromEntries(tables.map((t) => [t.name, t]));
    expect(byName.ParticipantSourceRows.rows).toBe(17);
    expect(byName.Constructs.rows).toBe(((await get('Constructs')).body as unknown as Json[]).length);
    expect(byName.Constructs.columns.find((c: Json) => c.name === 'constructId')).toMatchObject({ key: true, type: 'String(40)' });
    // shared business keys, and the reverse reference to ProcessRequests
    expect(byName.Constructs.links.find((l: Json) => l.column === 'constructId').tables).toContain('ValidationIssues');
    expect(byName.ProcessRequests.links.find((l: Json) => l.column === 'ID').tables).toEqual(expect.arrayContaining(['AuditEvents', 'PrerequisiteChecks']));
  });

  it('pages, searches and sorts rows; checks table and column names', async () => {
    const page = (await get('db/tables/ParticipantSourceRows/rows?top=5&skip=0&orderBy=maloId&desc=1')).body;
    expect(page.total).toBe(17);
    expect(page.rows).toHaveLength(5);
    const ids = page.rows.map((r: Json) => r.maloId as string);
    expect([...ids].sort().reverse()).toEqual(ids);
    const mul = (await get('db/tables/ParticipantSourceRows/rows?search=B-MUL-01&top=50')).body;
    expect(mul.total).toBe(((await get("Participants?$filter=buildingId%20eq%20'B-MUL-01'")).body as unknown as Json[]).length);
    expect(mul.rows.every((r: Json) => r.buildingId === 'B-MUL-01')).toBe(true);
    expect((await get('db/tables/HourlyConsumption/rows?top=5000')).body.top).toBe(200);
    expect((await get('db/tables/Nope/rows')).status).toBe(404);
    const bad = await get("db/tables/Constructs/rows?orderBy=city;DROP TABLE x");
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('COLUMN_UNKNOWN');
  });

  it('never returns secrets or personal data', async () => {
    expect((await post('createApiKey', { name: 'explorer-test', role: 'VIEWER' })).status).toBe(200);
    const keys = (await get('db/tables/ApiKeys/rows')).body;
    expect(keys.rows.length).toBeGreaterThan(0);
    expect(keys.redacted).toEqual(['hash']);
    expect(keys.rows.every((r: Json) => r.hash === null)).toBe(true);
    for (const table of ['ProducerOnboarding', 'ProducerRegistrationRequests']) {
      const p = (await get(`db/tables/${table}/rows`)).body;
      expect(p.redacted).toEqual(expect.arrayContaining(['firstName', 'lastName', 'email']));
      expect(p.rows.every((r: Json) => r.firstName === null && r.lastName === null && r.email === null)).toBe(true);
    }
    // personal fields are not searchable either
    const anyEmail = (await get('db/tables/ProducerOnboarding/rows?search=%40')).body;
    expect(anyEmail.total).toBe(0);
  });

  it('is read-only: reading the catalog and rows changes no table', async () => {
    const before = await counts();
    await get('db/tables/AuditEvents/rows');
    await get('db/tables/HourlyConsumption/rows?top=200&skip=1000');
    expect(await counts()).toEqual(before);
  });
});

describe('database explorer — live monitor stream', () => {
  it('reports each request with the tables it really read and wrote', async () => {
    const ac = new AbortController();
    const res = await fetch(`${BASE}/db/stream`, { headers: { Authorization: `Bearer ${token}` }, signal: ac.signal });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
    const events: Json[] = [];
    const pump = (async () => {
      let buffer = '';
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) return;
          buffer += value;
          let cut;
          while ((cut = buffer.indexOf('\n\n')) >= 0) {
            const line = buffer.slice(0, cut).split('\n').find((l) => l.startsWith('data: '));
            buffer = buffer.slice(cut + 2);
            if (line) events.push(JSON.parse(line.slice(6)) as Json);
          }
        }
      } catch { /* aborted */ }
    })();
    await new Promise((r) => setTimeout(r, 150));

    expect((await post('createApiKey', { name: 'stream-test', role: 'VIEWER' })).status).toBe(200);
    await get('Constructs');
    const deadline = Date.now() + 3000;
    const done = () => events.some((e) => e.type === 'end' && e.path === '/api/v1/Constructs');
    while (!done() && Date.now() < deadline) await new Promise((r) => setTimeout(r, 50));
    ac.abort();
    await pump;

    const write = events.find((e) => e.type === 'end' && e.path === '/api/v1/createApiKey')!;
    expect(write).toMatchObject({ method: 'POST', lane: 'ProcessApi', status: 200, via: 'SESSION' });
    expect(write.ops).toEqual(expect.arrayContaining([expect.objectContaining({ table: 'ApiKeys', op: 'INSERT' }), expect.objectContaining({ table: 'AuditEvents', op: 'INSERT' })]));
    expect(write.commits).toBeGreaterThan(0);
    const start = events.find((e) => e.type === 'start' && e.id === write.id)!;
    expect(start).toMatchObject({ client: 'SESSION', path: '/api/v1/createApiKey' });
    expect(events.indexOf(start)).toBeLessThan(events.indexOf(write));
    const read = events.find((e) => e.type === 'end' && e.path === '/api/v1/Constructs')!;
    expect(read.ops).toEqual([{ table: 'Constructs', op: 'SELECT', n: 1 }]);   // the projection resolves to its table
    expect(JSON.stringify(events)).not.toContain(token);                         // the stream never carries credentials
  });
});
