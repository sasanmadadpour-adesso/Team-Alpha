import cds from '@sap/cds';
import { AsyncLocalStorage } from 'node:async_hooks';
import { EventEmitter } from 'node:events';
import { statSync } from 'node:fs';
import path from 'node:path';
import type { NextFunction, Request, Response } from 'express';

/**
 * Database explorer (read-only): the CDS model's tables with columns, row counts and shared keys, paged rows,
 * and a live monitor that reports which tables each HTTP request really read or wrote.
 * Nothing here writes to the database; the monitor lives in memory only.
 */
const NS = 'mk7.controlcenter.';

/** Business domains, used to arrange the tables on screen. A table missing here falls into "other". */
export const TABLE_GROUPS: Record<string, string[]> = {
  process: ['Constructs', 'Buildings', 'ParticipantSourceRows', 'MarketLocations', 'MeteringLocations', 'ValidationIssues', 'VszChecklistItems'],
  switch: ['Relationships', 'LifecyclePeriods', 'ProcessRequests', 'PrerequisiteChecks', 'ProcessRuns', 'OutboxEvents'],
  audit: ['AuditEvents', 'ApiCalls', 'ApiKeys', 'SystemStatuses'],
  workbook: ['ImportRuns', 'ImportedSheets', 'SourceFieldDescriptions', 'FinancialRules'],
  producers: ['ProducerOnboarding', 'ProducerRegistrationRequests'],
  series: ['HourlyConsumption', 'HourlyGeneration', 'EnergyPrices'],
};

/** Secrets and personal data never leave the server (the DataService projection hides the same producer fields). */
export const REDACTED: Record<string, string[]> = {
  ApiKeys: ['hash'],
  ProducerOnboarding: ['firstName', 'lastName', 'email', 'sourceData'],
  ProducerRegistrationRequests: ['firstName', 'lastName', 'email', 'payload'],
};

/** Columns that connect tables. The schema declares no foreign keys; these are shared business keys. */
const SHARED_KEYS = ['constructId', 'buildingId', 'maloId', 'meloId', 'reststromMaloId', 'requestId', 'importChecksum'];
const REFERENCES: Record<string, string> = { requestId: 'ProcessRequests', referenceOperationId: 'ProcessRequests' };

interface CdsElement { type?: string; key?: boolean; length?: number; precision?: number; scale?: number; default?: { val?: unknown }; virtual?: boolean; '@assert.unique'?: boolean }
interface CdsEntity { kind?: string; name: string; elements: Record<string, CdsElement>; query?: unknown; projection?: unknown; '@cds.persistence.skip'?: boolean }

export interface ColumnInfo { name: string; type: string; key: boolean; unique: boolean; defaultValue: string | null; redacted: boolean }
export interface TableLink { column: string; tables: string[] }
export interface TableInfo { name: string; group: string; rows: number; columns: ColumnInfo[]; links: TableLink[] }
export interface ServiceInfo { name: string; path: string; entities: number }
export interface Catalog { kind: string; file: string | null; sizeBytes: number | null; tables: TableInfo[]; services: ServiceInfo[]; generatedAt: string }

export class ExplorerError extends Error { constructor(readonly status: number, readonly code: string, message: string) { super(message); } }

const groupOf = (name: string) => Object.entries(TABLE_GROUPS).find(([, list]) => list.includes(name))?.[0] ?? 'other';
const typeOf = (e: CdsElement) => {
  const base = (e.type ?? '?').replace(/^cds\./, '');
  if (e.length) return `${base}(${e.length})`;
  if (e.precision) return `${base}(${e.precision}${e.scale !== undefined ? `,${e.scale}` : ''})`;
  return base;
};

/** Persisted tables of our namespace (no views, no projections). */
function modelTables(): CdsEntity[] {
  const defs = (cds.model?.definitions ?? {}) as Record<string, CdsEntity>;
  return Object.values(defs)
    .filter((d) => d.kind === 'entity' && d.name.startsWith(NS) && !d.query && !d.projection && !d['@cds.persistence.skip'] && !d.name.slice(NS.length).includes('.'))
    .sort((a, b) => a.name.localeCompare(b.name));
}
const shortName = (d: CdsEntity) => d.name.slice(NS.length);
const columnsOf = (d: CdsEntity) => Object.entries(d.elements).filter(([, e]) => !e.virtual && e.type !== 'cds.Association' && e.type !== 'cds.Composition');

function tableByName(name: string): CdsEntity {
  const table = modelTables().find((d) => shortName(d) === name);
  if (!table) throw new ExplorerError(404, 'TABLE_NOT_FOUND', `Table ${name} does not exist.`);
  return table;
}

function dbFile(): { file: string | null; sizeBytes: number | null } {
  const url = (cds.env.requires as { db?: { credentials?: { url?: string } } }).db?.credentials?.url;
  if (!url || url === ':memory:') return { file: url ?? null, sizeBytes: null };
  try { return { file: path.basename(url), sizeBytes: statSync(path.resolve(url)).size }; } catch { return { file: path.basename(url), sizeBytes: null }; }
}

export async function catalog(): Promise<Catalog> {
  const tables = modelTables();
  const names = tables.map(shortName);
  const columnSets = new Map(tables.map((d) => [shortName(d), new Set(columnsOf(d).map(([c]) => c))]));
  const counts = await Promise.all(tables.map(async (d) => Number(((await cds.db.run(SELECT.one.from(d.name).columns('count(1) as n'))) as { n?: number } | undefined)?.n ?? 0)));
  const services = Object.values(cds.services as Record<string, { name: string; path?: string; entities?: Record<string, unknown> }>)
    .filter((s) => s.path && s.name !== 'db')
    .map((s) => ({ name: s.name, path: s.path!, entities: Object.keys(s.entities ?? {}).length }));
  return {
    kind: String((cds.env.requires as { db?: { kind?: string } }).db?.kind ?? 'sqlite'),
    ...dbFile(),
    services,
    generatedAt: new Date().toISOString(),
    tables: tables.map((d, i) => {
      const name = names[i];
      const hidden = REDACTED[name] ?? [];
      const columns = columnsOf(d).map(([c, e]) => ({
        name: c, type: typeOf(e), key: !!e.key, unique: !!e['@assert.unique'],
        defaultValue: e.default?.val === undefined || e.default.val === null ? null : String(e.default.val), redacted: hidden.includes(c),
      }));
      const referencedBy = names.filter((other) => other !== name && Object.entries(REFERENCES).some(([col, target]) => target === name && columnSets.get(other)?.has(col)));
      const links = columns.flatMap(({ name: col }) => {
        const ref = REFERENCES[col];
        const shared = SHARED_KEYS.includes(col) ? names.filter((other) => other !== name && columnSets.get(other)?.has(col)) : [];
        const back = col === 'ID' ? referencedBy : [];
        const tablesLinked = [...new Set([...(ref && ref !== name ? [ref] : []), ...shared, ...back])];
        return tablesLinked.length ? [{ column: col, tables: tablesLinked }] : [];
      });
      return { name, group: groupOf(name), rows: counts[i], columns, links };
    }),
  };
}

export interface RowQuery { top?: number; skip?: number; search?: string; orderBy?: string; desc?: boolean }
export interface RowPage { table: string; total: number; top: number; skip: number; rows: Record<string, unknown>[]; redacted: string[] }

/** One page of a table. Sort and search columns are checked against the model; values are bound, never concatenated. */
export async function tableRows(name: string, q: RowQuery): Promise<RowPage> {
  const table = tableByName(name);
  const cols = columnsOf(table);
  const hidden = REDACTED[name] ?? [];
  const top = Math.min(Math.max(Math.trunc(q.top ?? 50) || 50, 1), 200);
  const skip = Math.max(Math.trunc(q.skip ?? 0) || 0, 0);
  if (q.orderBy && !cols.some(([c]) => c === q.orderBy)) throw new ExplorerError(400, 'COLUMN_UNKNOWN', `Column ${q.orderBy} does not exist in ${name}.`);
  const term = q.search?.trim();
  const searchable = cols.filter(([c, e]) => !hidden.includes(c) && /String|UUID/.test(e.type ?? '')).map(([c]) => c);
  const where = term && searchable.length
    ? searchable.flatMap((c, i) => [...(i ? ['or'] : []), { ref: [c] }, 'like', { val: `%${term}%` }])
    : undefined;

  const select = SELECT.from(table.name).columns(cols.filter(([c]) => !hidden.includes(c)).map(([c]) => c)).limit(top, skip);
  if (q.orderBy) select.orderBy(`${q.orderBy} ${q.desc ? 'desc' : 'asc'}`);
  const count = SELECT.one.from(table.name).columns('count(1) as n');
  if (where) {
    (select.SELECT as { where?: unknown }).where = where;
    (count.SELECT as { where?: unknown }).where = where;
  }
  const [rows, total] = await Promise.all([cds.db.run(select) as Promise<Record<string, unknown>[]>, cds.db.run(count) as Promise<{ n?: number } | undefined>]);
  return { table: name, total: Number(total?.n ?? 0), top, skip, rows: rows.map((r) => ({ ...r, ...Object.fromEntries(hidden.map((c) => [c, null])) })), redacted: hidden };
}

/* ------------------------------------------------------------------ live request monitor */

export type DbOp = 'SELECT' | 'INSERT' | 'UPSERT' | 'UPDATE' | 'DELETE';
export interface OpCount { table: string; op: DbOp; n: number }
export type Lane = 'ProcessApi' | 'OData' | 'Custom';
/** SESSION | KEY from the token's prefix only (verified later by the access layer; the end event carries the verified value). */
export type Client = 'SESSION' | 'KEY' | '-';
const clientOf = (authorization: string | undefined): Client => { const token = /^Bearer\s+(\S+)$/i.exec(authorization ?? '')?.[1]; return !token ? '-' : token.startsWith('rk_') ? 'KEY' : 'SESSION'; };
export type MonitorEvent =
  | { type: 'start'; id: string; method: string; path: string; lane: Lane; client: Client; at: string }
  | { type: 'end'; id: string; method: string; path: string; lane: Lane; status: number; ms: number; via: string; actor: string; ops: OpCount[]; commits: number; rollbacks: number; at: string }
  | { type: 'db'; id: string | null; ops: OpCount[]; at: string };

interface Flight { id: string; ops: Map<string, OpCount>; commits: number; rollbacks: number; ended: boolean }
const flights = new AsyncLocalStorage<Flight>();
const bus = new EventEmitter();
bus.setMaxListeners(200);
const STREAM_PATH = '/api/v1/db/stream';
/** Express routes registered in server.ts ahead of the CAP REST adapter. */
const CUSTOM_ROUTES = ['/api/v1/db/', '/api/v1/house-member-portal', '/api/v1/validate-house-member', '/api/v1/producer-onboardings'];

export const laneOf = (urlPath: string): Lane => (urlPath.startsWith('/odata/') ? 'OData' : CUSTOM_ROUTES.some((p) => urlPath.startsWith(p)) ? 'Custom' : 'ProcessApi');
const emit = (e: MonitorEvent) => { if (bus.listenerCount('event')) bus.emit('event', e); };
const opList = (m: Map<string, OpCount>) => [...m.values()];
const add = (m: Map<string, OpCount>, table: string, op: DbOp) => {
  const k = `${table}|${op}`;
  const hit = m.get(k);
  if (hit) hit.n++; else m.set(k, { table, op, n: 1 });
};

/** Every /api and /odata request runs inside its own flight, so the DB hook can attribute each query to it. */
export function monitorRequests(req: Request, res: Response, next: NextFunction) {
  const urlPath = req.originalUrl.split('?')[0].slice(0, 200);
  if (urlPath === STREAM_PATH) return next();
  const flight: Flight = { id: cds.utils.uuid(), ops: new Map(), commits: 0, rollbacks: 0, ended: false };
  const started = Date.now();
  const lane = laneOf(urlPath);
  emit({ type: 'start', id: flight.id, method: req.method, path: urlPath, lane, client: clientOf(req.headers.authorization), at: new Date(started).toISOString() });
  const finish = () => {
    if (flight.ended) return;
    flight.ended = true;
    const h = req.headers as Record<string, string | undefined>;
    emit({
      type: 'end', id: flight.id, method: req.method, path: urlPath, lane, status: res.statusCode, ms: Date.now() - started,
      via: h['x-ruhend-via'] ?? '-', actor: h['x-ruhend-actor'] ?? 'anonymous', ops: opList(flight.ops), commits: flight.commits, rollbacks: flight.rollbacks, at: new Date().toISOString(),
    });
    flight.ops.clear();
  };
  res.on('finish', finish);
  res.on('close', finish);   // the client went away before the response was complete
  flights.run(flight, () => next());
}

/** Queries outside a request, or after its response (e.g. the ApiCalls log row), are reported in small batches. */
let late = new Map<string, Map<string, OpCount>>();
let lateTimer: NodeJS.Timeout | undefined;
const flushLate = () => {
  lateTimer = undefined;
  const batch = late;
  late = new Map();
  for (const [id, ops] of batch) emit({ type: 'db', id: id || null, ops: opList(ops), at: new Date().toISOString() });
};

const tableCache = new Map<string, string | null>();
/** Service projections (ProcessApi.Constructs …) resolve to the table they read from. */
function physicalTable(name: string | undefined): string | null {
  if (!name) return null;
  if (tableCache.has(name)) return tableCache.get(name)!;
  let current = name;
  for (let depth = 0; depth < 6 && !current.startsWith(NS); depth++) {
    const def = (cds.model?.definitions as Record<string, { query?: { SELECT?: { from?: { ref?: string[] } } }; projection?: { from?: { ref?: string[] } } }> | undefined)?.[current];
    const from = def?.query?.SELECT?.from?.ref?.[0] ?? def?.projection?.from?.ref?.[0];
    if (!from) break;
    current = from;
  }
  const result = current.startsWith(NS) && !current.slice(NS.length).includes('.') ? current.slice(NS.length) : null;
  tableCache.set(name, result);
  return result;
}

let probeInstalled = false;
/** Observes every query on the database service (before handler only: it never changes a query or its result). */
export function installDbProbe() {
  if (probeInstalled || !cds.db) return;
  probeInstalled = true;
  cds.db.before('*', (req: cds.Request) => {
    if (!bus.listenerCount('event')) return;
    const flight = flights.getStore();
    if (req.event === 'COMMIT' || req.event === 'ROLLBACK') {
      if (flight && !flight.ended) flight[req.event === 'COMMIT' ? 'commits' : 'rollbacks']++;
      return;
    }
    const query = req.query as unknown;
    if (!query || typeof query !== 'object') return;
    const op = Object.keys(query)[0] as DbOp;
    if (!['SELECT', 'INSERT', 'UPSERT', 'UPDATE', 'DELETE'].includes(op)) return;
    const table = physicalTable((req.target as { name?: string } | undefined)?.name);
    if (!table) return;
    if (flight && !flight.ended) { add(flight.ops, table, op); return; }
    const key = flight?.id ?? '';
    if (!late.has(key)) late.set(key, new Map());
    add(late.get(key)!, table, op);
    lateTimer ??= setTimeout(flushLate, 250);
  });
}

/** Server-Sent Events: one JSON message per monitor event, plus a heartbeat so proxies keep the stream open. */
export function streamEvents(req: Request, res: Response) {
  res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.write(`retry: 3000\n\n`);
  const send = (e: MonitorEvent) => res.write(`data: ${JSON.stringify(e)}\n\n`);
  const beat = setInterval(() => res.write(': ping\n\n'), 20_000);
  bus.on('event', send);
  req.on('close', () => { clearInterval(beat); bus.off('event', send); });
}
