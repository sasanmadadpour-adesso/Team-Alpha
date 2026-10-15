/**
 * Typed client for the CAP OData V4 service at /odata/v4/malo.
 * The backend remains the single source of truth; nothing here is mocked.
 */

const BASE = '/odata/v4/malo';

interface ODataCollection<T> { value: T[] }

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return undefined;
  try { return JSON.parse(text) as unknown; } catch { return text; }
}

/** Extracts the human-readable message from a CAP OData error payload. */
function errorMessage(payload: unknown, fallback: string): string {
  if (payload && typeof payload === 'object' && 'error' in payload) {
    const error = (payload as { error?: { message?: string } }).error;
    if (error?.message) return error.message;
  }
  if (typeof payload === 'string' && payload.trim()) return payload.slice(0, 400);
  return fallback;
}

async function get<T>(path: string): Promise<T> {
  const response = await fetch(`${BASE}${path}`, { headers: { Accept: 'application/json' } });
  const payload = await readJson(response);
  if (!response.ok) throw new Error(errorMessage(payload, `Anfrage fehlgeschlagen (${response.status})`));
  return payload as T;
}

async function post<T>(action: string, body: object): Promise<T> {
  const response = await fetch(`${BASE}/${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = await readJson(response);
  if (!response.ok) throw new Error(errorMessage(payload, `${action} fehlgeschlagen (${response.status})`));
  return payload as T;
}

const collection = async <T>(entity: string, query = ''): Promise<T[]> =>
  (await get<ODataCollection<T>>(`/${entity}${query}`)).value;

/* ---------------------------------- Types --------------------------------- */

export interface SystemStatus { ID: string; code: string; label: string; environment: string; sapConnected: boolean }

export interface SourceRow {
  sourceId: string; sourceRowNumber: number; buildingId: string; role: string;
  participationRaw: string; participates: boolean; meloId: string; maloId: string;
  generationFeedInMaloId?: string; reststromMaloId: string; maloConflict: boolean;
  supplyStartUtc?: string; contractFromUtc?: string; contractToUtc?: string;
  city?: string; operator?: string; streetAddress?: string;
}

export interface MarketLocation {
  maloId: string; primaryRole: string; participates: boolean;
  businessState: 'ACTIVE' | 'RUHEND'; assignmentCount: number;
  conflictingAssignment: boolean; assignmentSummary: string;
}

export interface Building {
  buildingId: string; city?: string; operator?: string; streetAddress?: string;
  reststromMaloId: string; sourceRowCount: number;
}

export interface Relationship {
  ID: string; kind: 'MEMA' | 'MAMA'; source: 'EXPECTED' | 'MOCK_OBSERVED';
  buildingId: string; fromLocationId: string; toLocationId: string;
  validFrom?: string; validToExclusive?: string; provenance?: string;
}

export interface LifecyclePeriod {
  ID: string; maloId: string; businessState: 'ACTIVE' | 'RUHEND';
  validFrom?: string; validToExclusive?: string; provenance?: string;
}

export interface ProcessRequest {
  ID: string; createdAt: string; operation: string; maloId: string; buildingId: string;
  effectiveDate: string; mode: string; status: string; resultCode?: string; resultMessage?: string;
  beforeState?: string; afterState?: string; executionTime?: string; batchId?: string;
  referenceOperationId?: string; actor: string; reason?: string; reststromMaloId?: string; simulated: boolean;
}

export interface AuditEvent {
  ID: string; requestId?: string; referenceOperationId?: string; operation: string;
  maloId: string; actor: string; effectiveDate?: string; eventTime: string;
  beforeValue?: string; afterValue?: string; reason?: string; simulated: boolean;
}

export interface PrerequisiteCheck {
  ID: string; requestId: string; checkCode: string; result: string; confidence: string; notes?: string;
}

export interface ImportRun {
  ID: string; sourceFile: string; sourceChecksum: string; completedAt: string;
  status: string; totalRows: number; buildingCount: number; conflictCount: number; message?: string;
}

/** Raw plan check as persisted/returned by the backend transition engine. */
export interface PlanCheck { code: string; result: string; confidence: string; message: string }

export interface PlanDifference {
  kind: string; status: string; code: string; message: string; blocking: boolean;
  expected?: Record<string, unknown>; observed?: Record<string, unknown>;
}

export interface TransitionResult {
  status: string; code: string; message: string;
  maloId: string; buildingId: string; reststromMaloId: string; effectiveDate: string;
  beforeState: string; afterState: string; canExecute: boolean; simulated: boolean;
  prerequisiteProfile: string; checksJson: string; reconciliationJson: string; requestId?: string | null;
}

export interface BatchResult {
  batchId: string; buildingId: string; total: number; success: number; skipped: number;
  alreadyDone: number; blocked: number; review: number; error: number;
  resultsJson: string; simulated: boolean;
}

export interface ScenarioCase { id: string; expected: string; actual: string; passed: boolean }
export interface ScenarioResult { executedAt: string; passed: number; failed: number; resultsJson: string }

export type PrerequisiteProfile = 'STRICT' | 'ASSUMED_DEMO';
export type LifecycleOperationKey =
  | 'setDormant' | 'reactivate' | 'removeFromConstruct' | 'correctTransition' | 'reverseTransition';

export interface OperationRequest {
  maloId: string; buildingId: string; effectiveDate: string;
  prerequisiteProfile?: PrerequisiteProfile; confirmed?: boolean;
  reason?: string; referenceOperationId?: string;
}

/* --------------------------------- Readers -------------------------------- */

export const getSystemStatus = async (): Promise<SystemStatus> => {
  const rows = await collection<SystemStatus>('SystemStatuses');
  const status = rows[0];
  if (!status) throw new Error('Die CAP-API hat keinen Systemstatus geliefert.');
  return status;
};

export const getSourceRows = () => collection<SourceRow>('ParticipantSourceRows', '?$orderby=sourceRowNumber&$top=500');
export const getLocations = () => collection<MarketLocation>('MarketLocations', '?$orderby=maloId&$top=500');
export const getBuildings = () => collection<Building>('Buildings', '?$orderby=buildingId');
export const getRelationships = () => collection<Relationship>('Relationships', '?$top=1000');
export const getLifecyclePeriods = () => collection<LifecyclePeriod>('LifecyclePeriods', '?$top=1000');
export const getHistory = () => collection<ProcessRequest>('ProcessRequests', '?$orderby=createdAt desc&$top=500');
export const getAuditEvents = () => collection<AuditEvent>('AuditEvents', '?$orderby=eventTime desc&$top=500');
export const getPrerequisiteChecks = () => collection<PrerequisiteCheck>('PrerequisiteChecks', '?$top=2000');
export const getImportRuns = () => collection<ImportRun>('ImportRuns', '?$orderby=completedAt desc&$top=20');

/* --------------------------------- Actions -------------------------------- */

const MAP: Record<Exclude<LifecycleOperationKey, 'setDormant'>, string> = {
  reactivate: 'REACTIVATE',
  removeFromConstruct: 'REMOVE_FROM_CONSTRUCT',
  correctTransition: 'CORRECT_TRANSITION',
  reverseTransition: 'REVERSE_TRANSITION',
};

/** Read-only validation for any operation. Never mutates backend state. */
export function previewOperation(operation: LifecycleOperationKey, request: OperationRequest): Promise<TransitionResult> {
  if (operation === 'setDormant') {
    return post<TransitionResult>('previewTransition', {
      maloId: request.maloId,
      buildingId: request.buildingId,
      effectiveDate: request.effectiveDate,
      prerequisiteProfile: request.prerequisiteProfile ?? 'STRICT',
    });
  }
  return post<TransitionResult>('previewLifecycle', {
    operation: MAP[operation],
    maloId: request.maloId,
    buildingId: request.buildingId,
    effectiveDate: request.effectiveDate,
    referenceOperationId: request.referenceOperationId || null,
    reason: request.reason || null,
  });
}

/**
 * State-changing execution. Requires explicit confirmation.
 * Each CAP action declares its own parameters, so only the declared ones are sent.
 */
export function executeOperation(operation: LifecycleOperationKey, request: OperationRequest) {
  const base = {
    maloId: request.maloId,
    buildingId: request.buildingId,
    effectiveDate: request.effectiveDate,
    confirmed: request.confirmed === true,
  };
  const profile = { prerequisiteProfile: request.prerequisiteProfile ?? 'STRICT' };
  const reason = { reason: request.reason || null };
  const reference = { referenceOperationId: request.referenceOperationId || null };

  switch (operation) {
    case 'setDormant':
    case 'reactivate':
      return post<TransitionResult>(operation, { ...base, ...profile });
    case 'removeFromConstruct':
      return post<TransitionResult>(operation, { ...base, ...profile, ...reason });
    case 'correctTransition':
    case 'reverseTransition':
      return post<TransitionResult>(operation, { ...base, ...reason, ...reference });
    default: {
      const exhaustive: never = operation;
      throw new Error(`Unbekannter Vorgang: ${String(exhaustive)}`);
    }
  }
}

export const reconcile = (request: Pick<OperationRequest, 'maloId' | 'buildingId' | 'effectiveDate'>) =>
  post<TransitionResult>('reconcileRelationships', request);

export const executeBatch = (body: {
  buildingId: string; effectiveDate: string; prerequisiteProfile: PrerequisiteProfile; confirmed: boolean;
}) => post<BatchResult>('executeBatch', body);

export const resetDemo = async (confirmed: boolean): Promise<string> =>
  (await post<{ value: string }>('resetDemo', { confirmed })).value;

export const runScenarioTests = () => post<ScenarioResult>('runScenarioTests', {});

/* --------------------------------- Helpers -------------------------------- */

export function parseJson<T>(raw: string | undefined, fallback: T): T {
  if (!raw) return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}

export const planChecks = (result: TransitionResult | undefined) =>
  parseJson<PlanCheck[]>(result?.checksJson, []);
export const planDifferences = (result: TransitionResult | undefined) =>
  parseJson<PlanDifference[]>(result?.reconciliationJson, []);
