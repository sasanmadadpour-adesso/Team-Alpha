/** Typed client for the public REST API (/api/v1). The UI uses exactly the contract other services use. */
const BASE = '/api/v1';
export const ACTOR = 'DEMO_USER';

export class ApiError extends Error { constructor(readonly status: number, message: string, readonly code = 'ERROR', readonly params: Record<string, string> = {}) { super(message); } }

async function http<T>(path: string, body?: object): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${BASE}/${path}`, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : undefined);
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
    throw new ApiError(response.status, e?.message ?? `HTTP ${response.status}`, e?.code && /^[A-Z_]+$/.test(e.code) ? e.code : 'ERROR', params);
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

export interface Snapshot {
  constructs: Construct[]; cases: Case[]; vsz: VszItem[]; relationships: Relationship[];
  requests: ProcessRequest[]; events: AuditEvent[]; outbox: OutboxEvent[]; loadedAt: number;
}

export async function loadSnapshot(): Promise<Snapshot> {
  const [constructs, cases, vsz, relationships, requests, events, outbox] = await Promise.all([
    http<Construct[]>('Constructs?$orderby=constructId'),
    http<Case[]>('cases()'),
    http<VszItem[]>('VszChecklist?$orderby=constructId,step'),
    http<Relationship[]>(`Relationships?$filter=${q("source eq 'SIMULATED'")}&$orderby=buildingId,kind,fromLocationId`),
    http<ProcessRequest[]>('ProcessRequests?$orderby=executionTime desc&$top=500'),
    http<AuditEvent[]>('AuditEvents?$orderby=eventTime desc&$top=200'),
    http<OutboxEvent[]>('Outbox?$orderby=createdAt desc'),
  ]);
  return { constructs, cases, vsz, relationships, requests, events, outbox, loadedAt: Date.now() };
}

export const loadPeriods = (maloId: string) => http<Period[]>(`LifecyclePeriods?$filter=${q(`maloId eq '${maloId}'`)}&$orderby=validFrom`);
export const processAll = () => http<ProcessResult>('processAll', { actor: ACTOR });
export const processConstruct = (id: string) => http<unknown>(`Constructs/${id}/process`, { actor: ACTOR });
export const confirmVsz = (id: string, evidence: string) => http<unknown>(`Constructs/${id}/confirmVsz`, { evidence, actor: ACTOR });
export const resolveIssue = (id: string, resolution: Resolution, reason: string, value?: string) => http<unknown>(`Issues/${id}/resolve`, { resolution, value, reason, actor: ACTOR });
export const updateSapState = (attribute: 'imsys' | 'abmeldung' | 'mcm', objectId: string, value: string) => http<unknown>('updateSapState', { attribute, objectId, value, actor: ACTOR });
export const importWorkbook = (fileName: string, contentBase64: string) => http<{ constructIds: string[]; rows: number }>('importWorkbook', { fileName, contentBase64, actor: ACTOR });
export const preview = (command: object) => http<OperationResult>('preview', { command });
export const execute = (command: object) => http<OperationResult>('execute', { command, actor: ACTOR });
export const resetDemo = () => http<string>('resetDemo', { confirm: true });
export const runSelfCheck = () => http<{ passed: number; failed: number; results: string }>('runSelfCheck', {});
