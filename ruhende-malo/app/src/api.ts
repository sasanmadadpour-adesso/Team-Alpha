/** Typed client for the public REST API (/api/v1). The UI uses exactly the contract other services use. */
const BASE = '/api/v1';
export const ACTOR = 'DEMO_USER';

async function http<T>(path: string, body?: object): Promise<T> {
  const response = await fetch(`${BASE}/${path}`, body
    ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
    : undefined);
  const text = await response.text();
  let payload: unknown;
  try { payload = text ? JSON.parse(text) : undefined; } catch { payload = text; }
  if (!response.ok) throw new Error((payload as { error?: { message?: string } })?.error?.message ?? `Request failed (${response.status})`);
  return payload as T;
}
const q = (s: string) => encodeURIComponent(s);

export type Operation = 'SET_DORMANT' | 'REACTIVATE' | 'REMOVE_FROM_CONSTRUCT' | 'CORRECT_TRANSITION' | 'REVERSE_TRANSITION';
export type Resolution = 'CHOOSE_BUILDING' | 'EXCLUDE_PARTICIPANT' | 'FIX_VALUE' | 'CONFIRM_ASSUMPTION';

export interface Construct {
  constructId: string; city: string; streetAddress: string | null; reststromMaloId: string; stichtag: string | null; stage: string;
  validatedAt: string | null; householdCount: number; eligibleCount: number; dormantCount: number; excludedCount: number;
  openIssueCount: number; blockingIssueCount: number; vszConfirmed: number; vszTotal: number;
}
export interface Participant {
  sourceId: string; constructId: string; role: string; participates: boolean; participationRaw: string; maloId: string; meloId: string;
  generationFeedInMaloId: string | null; reststromMaloId: string | null; excluded: boolean; exclusionReason: string | null;
  imsysStatus: string; deregistrationStatus: string; mcmStatus: string; supplyStartUtc: string | null;
}
export interface Location { maloId: string; businessState: string }
export interface Issue {
  ID: string; ruleId: string; checkGroup: string; severity: string; status: string; constructIds: string; objectType: string; objectId: string; sourceId: string | null;
  field: string | null; message: string; allowedResolutions: string; affects: string; resolution: string | null; resolutionValue: string | null;
  reason: string | null; resolvedBy: string | null; resolvedAt: string | null;
}
export interface VszItem { ID: string; constructId: string; itemCode: string; step: string; label: string; pdfPage: string; note: string | null; status: string; confirmedBy: string | null; confirmedAt: string | null; evidence: string | null }
export interface Relationship { ID: string; kind: string; context: string; buildingId: string; fromLocationId: string; toLocationId: string; validFrom: string; validToExclusive: string | null; provenance: string }
export interface Step { id: string; state: string; detail: string }
export interface ProcessRequest { trace: string | null; ID: string; operation: string; maloId: string; buildingId: string; effectiveDate: string; status: string; resultCode: string | null; resultMessage: string | null; actor: string; mode: string; reason: string | null; executionTime: string | null; createdAt: string }
export interface AuditEvent { ID: string; operation: string; maloId: string | null; actor: string; eventTime: string; effectiveDate: string | null; afterValue: string | null; reason: string | null }
export interface OutboxEvent { ID: string; constructId: string; eventType: string; targetProcess: string; objectId: string; status: string; createdAt: string }
export interface Period { ID: string; businessState: string; validFrom: string | null; validToExclusive: string | null; provenance: string }
export interface Check { code: string; result: string; confidence: string; message: string }
export interface RelDiff { kind: string; status: string; code: string; message: string; fromId: string | null; toId: string | null }
export interface OperationResult { operation: Operation; status: string; code: string; message: string; maloId: string; buildingId: string; reststromMaloId: string | null; effectiveDate: string; beforeState: string | null; afterState: string | null; canExecute: boolean; requestId: string | null; checks: Check[]; relationships: RelDiff[] }
export interface RunItem { itemKey: string; maloId: string; meloId: string; role: string; status: string; code: string; message: string; steps: Step[] }
export interface ConstructRun { constructId: string; stoppedAt: string; message: string; stage: string; dormantCount: number; eligibleCount: number; openIssueCount: number; items: RunItem[] }
export interface ProcessResult { runId: string; success: number; alreadyDone: number; skipped: number; blocked: number; review: number; error: number; constructs: ConstructRun[] }
export interface Command { operation: Operation; maloId: string; buildingId: string; effectiveDate?: string; reason?: string; referenceOperationId?: string }

export interface Snapshot {
  constructs: Construct[]; participants: Participant[]; locations: Location[]; issues: Issue[]; vsz: VszItem[];
  relationships: Relationship[]; requests: ProcessRequest[]; events: AuditEvent[]; outbox: OutboxEvent[];
}

export async function loadSnapshot(): Promise<Snapshot> {
  const [constructs, participants, locations, issues, vsz, relationships, requests, events, outbox] = await Promise.all([
    http<Construct[]>('Constructs?$orderby=constructId'),
    http<Participant[]>('Participants?$orderby=sourceRowNumber'),
    http<Location[]>('MarketLocations?$select=maloId,businessState'),
    http<Issue[]>('Issues?$orderby=ruleId,objectId'),
    http<VszItem[]>('VszChecklist?$orderby=constructId,step'),
    http<Relationship[]>(`Relationships?$filter=${q("source eq 'SIMULATED'")}&$orderby=buildingId,kind,fromLocationId`),
    http<ProcessRequest[]>('ProcessRequests?$orderby=executionTime desc&$top=500'),
    http<AuditEvent[]>('AuditEvents?$orderby=eventTime desc&$top=300'),
    http<OutboxEvent[]>('Outbox?$orderby=createdAt desc'),
  ]);
  return { constructs, participants, locations, issues, vsz, relationships, requests, events, outbox };
}

export const loadPeriods = (maloId: string) => http<Period[]>(`LifecyclePeriods?$filter=${q(`maloId eq '${maloId}'`)}&$orderby=validFrom`);

export const processAll = () => http<ProcessResult>('processAll', { actor: ACTOR });
export const processConstruct = (id: string) => http<ConstructRun>(`Constructs/${id}/process`, { actor: ACTOR });
export const confirmVsz = (id: string, evidence: string, itemCodes?: string[]) => http<VszItem[]>(`Constructs/${id}/confirmVsz`, { evidence, itemCodes, actor: ACTOR });
export const resolveIssue = (id: string, resolution: Resolution, reason: string, value?: string) => http<unknown>(`Issues/${id}/resolve`, { resolution, value, reason, actor: ACTOR });
export const resolveIssues = (ids: string[], resolution: Resolution, reason: string) => http<unknown>('resolveIssues', { ids, resolution, reason, actor: ACTOR });
export const updateSapState = (attribute: 'imsys' | 'abmeldung' | 'mcm', objectId: string, value: string) => http<unknown>('updateSapState', { attribute, objectId, value, actor: ACTOR });
export const importWorkbook = (fileName: string, contentBase64: string) => http<{ constructIds: string[]; rows: number }>('importWorkbook', { fileName, contentBase64, actor: ACTOR });
export const preview = (command: Command) => http<OperationResult>('preview', { command });
export const execute = (command: Command) => http<OperationResult>('execute', { command, actor: ACTOR });
export const resetDemo = () => http<string>('resetDemo', { confirm: true });
export const runSelfCheck = () => http<{ passed: number; failed: number; results: string }>('runSelfCheck', {});
