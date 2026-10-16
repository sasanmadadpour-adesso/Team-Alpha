/** Typed client for the public REST API (/api/v1). The UI uses exactly the contract other services use. */
import { SIGNED_OUT, getToken, setToken, type Persona } from './session';

const BASE = '/api/v1';

export class ApiError extends Error { constructor(readonly status: number, message: string, readonly code = 'ERROR', readonly params: Record<string, string> = {}) { super(message); } }

async function http<T>(path: string, body?: object): Promise<T> {
  let response: Response;
  try {
    const auth: Record<string, string> = getToken() ? { Authorization: `Bearer ${getToken()}` } : {};
    response = await fetch(`${BASE}/${path}`, body ? { method: 'POST', headers: { 'Content-Type': 'application/json', ...auth }, body: JSON.stringify(body) } : { headers: auth });
  } catch {
    throw new ApiError(0, 'NETWORK', 'NETWORK');
  }
  const text = await response.text();
  let payload: unknown;
  try { payload = text ? JSON.parse(text) : undefined; } catch { payload = text; }
  if (!response.ok) {
    const e = (payload as { error?: { message?: string; code?: string; args?: string[] } } | undefined)?.error;
    let params: Record<string, string> = {};
    try { params = JSON.parse(e?.args?.[0] ?? '{}') as Record<string, string>; } catch { /* no params */ }
    const code = e?.code && /^[A-Z_]+$/.test(e.code) ? e.code : 'ERROR';
    if (response.status === 401 && getToken()) { setToken(null); window.dispatchEvent(new Event(SIGNED_OUT)); }   // expired or revoked session
    throw new ApiError(response.status, e?.message ?? `HTTP ${response.status}`, code, params);
  }
  return payload as T;
}
const q = (s: string) => encodeURIComponent(s);

export type Operation = 'SET_DORMANT' | 'REACTIVATE' | 'REMOVE_FROM_CONSTRUCT' | 'CORRECT_TRANSITION' | 'REVERSE_TRANSITION';
export type Resolution = 'CHOOSE_BUILDING' | 'EXCLUDE_PARTICIPANT' | 'FIX_VALUE' | 'CONFIRM_ASSUMPTION';
export type CaseStatus = 'NEW' | 'DONE' | 'READY' | 'WAITING' | 'DECISION' | 'CORRECTION' | 'EXCLUDED' | 'NOT_PARTICIPATING' | 'REACTIVATED';
export type StepState = 'OK' | 'DONE' | 'TODO' | 'FAIL' | 'WAIT' | 'SKIP' | 'NA';

export interface Construct {
  constructId: string; city: string; streetAddress: string | null; operator: string | null; reststromMaloId: string; stichtag: string | null; stage: string;
  validatedAt: string | null; switchedAt: string | null; householdCount: number; eligibleCount: number; dormantCount: number; excludedCount: number;
  openIssueCount: number; blockingIssueCount: number; vszConfirmed: number; vszTotal: number;
}
export interface Step { id: string; state: StepState; detail: string }
export interface CaseIssue { ID: string; ruleId: string; severity: string; checkGroup: string; message: string; allowedResolutions: string; field: string | null; constructIds: string; createdAt: string }
export interface Case {
  caseId: string; constructId: string; city: string | null; maloId: string; meloId: string; role: string; kind: 'HOUSEHOLD' | 'GENERATOR';
  status: CaseStatus; category: 'STATUS' | 'VSZ' | 'DECISION' | 'CORRECTION' | null; code: string; message: string; businessState: string | null;
  steps: Step[]; issues: CaseIssue[]; since: string | null; feedInMaloId: string | null; reststromMaloId: string | null; exclusionReason: string | null;
}
export interface VszItem { ID: string; constructId: string; itemCode: string; step: string; label: string; pdfPage: string; note: string | null; status: string; confirmedBy: string | null; confirmedAt: string | null; evidence: string | null }
export interface Relationship { ID: string; kind: string; context: string; buildingId: string; fromLocationId: string; toLocationId: string; validFrom: string; validToExclusive: string | null; provenance: string }
export interface ProcessRequest { ID: string; operation: string; maloId: string; buildingId: string; effectiveDate: string; status: string; resultMessage: string | null; actor: string; mode: string; executionTime: string | null }
export interface AuditEvent { ID: string; operation: string; maloId: string | null; actor: string; eventTime: string; effectiveDate: string | null; afterValue: string | null; reason: string | null }
export interface OutboxEvent { ID: string; constructId: string; eventType: string; targetProcess: string; objectId: string; status: string; createdAt: string }
export interface Period { ID: string; businessState: string; validFrom: string | null; validToExclusive: string | null; provenance: string }
export interface OperationResult { operation: Operation; status: string; code: string; message: string; beforeState: string | null; afterState: string | null; canExecute: boolean; requestId: string | null }
export interface ProcessResult { runId: string; success: number; alreadyDone: number; skipped: number; blocked: number; review: number; error: number }

export interface ApiCall { ID: string; at: string; actor: string; via: string; method: string; path: string; status: number; durationMs: number }
export interface ApiKey { ID: string; name: string; role: string; prefix: string; createdBy: string; createdAt: string; lastUsedAt: string | null; revokedAt: string | null }
export interface Snapshot {
  constructs: Construct[]; cases: Case[]; vsz: VszItem[]; relationships: Relationship[];
  requests: ProcessRequest[]; events: AuditEvent[]; outbox: OutboxEvent[]; calls: ApiCall[]; loadedAt: number;
}

export async function loadSnapshot(): Promise<Snapshot> {
  const [constructs, cases, vsz, relationships, requests, events, outbox, calls] = await Promise.all([
    http<Construct[]>('Constructs?$orderby=constructId'),
    http<Case[]>('cases()'),
    http<VszItem[]>('VszChecklist?$orderby=constructId,step'),
    http<Relationship[]>(`Relationships?$filter=${q("source eq 'SIMULATED'")}&$orderby=buildingId,kind,fromLocationId`),
    http<ProcessRequest[]>('ProcessRequests?$orderby=executionTime desc&$top=500'),
    http<AuditEvent[]>('AuditEvents?$orderby=eventTime desc&$top=200'),
    http<OutboxEvent[]>('Outbox?$orderby=createdAt desc'),
    http<ApiCall[]>('ApiCalls?$orderby=at desc&$top=100'),
  ]);
  return { constructs, cases, vsz, relationships, requests, events, outbox, calls, loadedAt: Date.now() };
}

export const loadPeriods = (maloId: string) => http<Period[]>(`LifecyclePeriods?$filter=${q(`maloId eq '${maloId}'`)}&$orderby=validFrom`);
export const processAll = () => http<ProcessResult>('processAll', {});
export const processConstruct = (id: string) => http<unknown>(`Constructs/${id}/process`, {});
export const confirmVsz = (id: string, evidence: string) => http<unknown>(`Constructs/${id}/confirmVsz`, { evidence });
export const resolveIssue = (id: string, resolution: Resolution, reason: string, value?: string) => http<unknown>(`Issues/${id}/resolve`, { resolution, value, reason });
export const updateSapState = (attribute: 'imsys' | 'abmeldung' | 'mcm', objectId: string, value: string) => http<unknown>('updateSapState', { attribute, objectId, value });
export const importWorkbook = (fileName: string, contentBase64: string) => http<{ constructIds: string[]; rows: number }>('importWorkbook', { fileName, contentBase64 });
export const preview = (command: object) => http<OperationResult>('preview', { command });
export const execute = (command: object) => http<OperationResult>('execute', { command });
export const resetDemo = () => http<string>('resetDemo', { confirm: true });
export const runSelfCheck = () => http<{ passed: number; failed: number; results: string }>('runSelfCheck', {});

export interface Session { token: string; expiresAt: string; user: Persona }
export interface Me { authenticated: boolean; name: string | null; role: Persona['role'] | 'NONE'; via: string | null }
export interface NewApiKey { ID: string; name: string; role: string; prefix: string; token: string }
export const loadPersonas = () => http<Persona[]>('personas()');
export const login = (user: string, code?: string) => http<Session>('login', { user, code });
export const loadHealth = () => http<{ status: string; mode: string; accessCode: boolean; publicUrl: string | null }>('health()');
export const whoAmI = () => http<Me>('me()');
export const loadApiKeys = () => http<ApiKey[]>('ApiKeys?$orderby=createdAt desc');
export const createApiKey = (name: string, role: string) => http<NewApiKey>('createApiKey', { name, role });
export const revokeApiKey = (id: string) => http<boolean>('revokeApiKey', { id });

/* ---------------- Database explorer (read-only) ---------------- */
export interface DbColumn { name: string; type: string; key: boolean; unique: boolean; defaultValue: string | null; redacted: boolean }
export interface DbTable { name: string; group: string; rows: number; columns: DbColumn[]; links: { column: string; tables: string[] }[] }
export interface DbCatalog { kind: string; file: string | null; sizeBytes: number | null; tables: DbTable[]; services: { name: string; path: string; entities: number }[]; generatedAt: string }
export interface DbRowPage { table: string; total: number; top: number; skip: number; rows: Record<string, unknown>[]; redacted: string[] }
export type DbOp = 'SELECT' | 'INSERT' | 'UPSERT' | 'UPDATE' | 'DELETE';
export interface DbOpCount { table: string; op: DbOp; n: number }
export type DbLane = 'ProcessApi' | 'OData' | 'Custom';
export type DbClient = 'SESSION' | 'KEY' | '-';
export type DbEvent =
  | { type: 'start'; id: string; method: string; path: string; lane: DbLane; client: DbClient; at: string }
  | { type: 'end'; id: string; method: string; path: string; lane: DbLane; status: number; ms: number; via: DbClient; actor: string; ops: DbOpCount[]; commits: number; rollbacks: number; at: string }
  | { type: 'db'; id: string | null; ops: DbOpCount[]; at: string };

export const loadDbCatalog = () => http<DbCatalog>('db/catalog');
export function loadDbRows(table: string, o: { top: number; skip: number; search?: string; orderBy?: string; desc?: boolean }) {
  const p = new URLSearchParams({ top: String(o.top), skip: String(o.skip) });
  if (o.search) p.set('search', o.search);
  if (o.orderBy) { p.set('orderBy', o.orderBy); if (o.desc) p.set('desc', '1'); }
  return http<DbRowPage>(`db/tables/${q(table)}/rows?${p.toString()}`);
}

/**
 * Live monitor stream (Server-Sent Events read with fetch, so the Bearer token can be sent).
 * Reconnects with backoff until the signal aborts; a 401 ends the session like any other call.
 */
export function openDbStream(onEvent: (e: DbEvent) => void, onState: (s: 'connecting' | 'live' | 'offline') => void, signal: AbortSignal) {
  let wait = 1000;
  const run = async () => {
    while (!signal.aborted) {
      onState('connecting');
      try {
        const res = await fetch(`${BASE}/db/stream`, { headers: getToken() ? { Authorization: `Bearer ${getToken()}` } : {}, signal });
        if (res.status === 401) { if (getToken()) { setToken(null); window.dispatchEvent(new Event(SIGNED_OUT)); } return; }
        if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
        onState('live'); wait = 1000;
        const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
        let buffer = '';
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += value;
          let cut;
          while ((cut = buffer.indexOf('\n\n')) >= 0) {
            const chunk = buffer.slice(0, cut); buffer = buffer.slice(cut + 2);
            const data = chunk.split('\n').filter((l) => l.startsWith('data: ')).map((l) => l.slice(6)).join('\n');
            if (data) { try { onEvent(JSON.parse(data) as DbEvent); } catch { /* malformed message: skip */ } }
          }
        }
      } catch { if (signal.aborted) return; }
      onState('offline');
      await new Promise((r) => setTimeout(r, wait));
      wait = Math.min(wait * 2, 10_000);
    }
  };
  void run();
}
