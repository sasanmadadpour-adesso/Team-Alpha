import cds from '@sap/cds';

type QueryRunner = { run(query: unknown): Promise<unknown> };
type FetchLike = typeof fetch;

interface ParticipantRow {
  sourceId: string;
  constructId?: string;
  buildingId: string;
  role: string;
  participationRaw?: string;
  participates?: boolean;
  meloId?: string;
  maloId?: string;
  generationFeedInMaloId?: string;
  supplyStartUtc?: string;
  contractFromUtc?: string;
  contractToUtc?: string;
  city?: string;
  operator?: string;
  streetAddress?: string;
  maloConflict?: boolean;
  excluded?: boolean;
}

interface ConstructRow {
  constructId: string;
  stage?: string;
  registeredAt?: string;
  stichtag?: string;
}

interface MarketLocationRow {
  maloId: string;
  businessState?: string;
}

export interface OverviewConstruct {
  ID: string;
  primaryMaLo: string;
  importMaLo: string | null;
  exportMaLo: string | null;
  meLo: string | null;
  displayName: string;
  roleCode: string;
  roleLabel: string;
  directionCode: string;
  nodeType: string;
  city: string | null;
  streetAddress: string | null;
  buildingID: string;
  participationCode: string | null;
  participationLabel: string | null;
  participationCriticality: number;
  isEligible: boolean;
  hasDataWarning: boolean;
  warningCode: string | null;
  warningText: string | null;
  warningCriticality: number;
  supplyStart: string | null;
  contractStart: string | null;
  contractEnd: string | null;
  receivedAt: string | null;
  businessState: string;
  constructStage: string | null;
  sourceSystem: 'RUHENDE_MALO';
  simulation: true;
}

const ns = (name: string) => `mk7.controlcenter.${name}`;
const HOUSEHOLD = 'Haushaltsverbrauch';
const RESTSTROM = 'Marktlokation Reststrom';

function overviewID(sourceId: string, primaryMaLo: string) {
  const safeSourceId = Buffer.from(sourceId, 'utf8').toString('base64url');
  return `ruhende-${primaryMaLo}-${safeSourceId}`;
}

function roleFields(role: string) {
  if (role === HOUSEHOLD) return { roleCode: 'HOUSEHOLD', directionCode: 'CONSUMPTION', nodeType: 'HOUSEHOLD' };
  if (role === RESTSTROM) return { roleCode: 'RESIDUAL_SUPPLY', directionCode: 'CONSUMPTION', nodeType: 'COUNTER' };
  return { roleCode: 'GENERATION', directionCode: 'GENERATION', nodeType: 'PRODUCER' };
}

export function toOverviewConstruct(row: ParticipantRow, construct?: ConstructRow, market?: MarketLocationRow): OverviewConstruct | null {
  const { roleCode, directionCode, nodeType } = roleFields(row.role);
  const primaryMaLo = String(nodeType === 'PRODUCER' ? row.generationFeedInMaloId || row.maloId || '' : row.maloId || '').trim();
  if (!primaryMaLo) return null;
  const participates = nodeType === 'HOUSEHOLD' ? Boolean(row.participates && !row.excluded) : true;
  const businessState = market?.businessState || 'UNKNOWN';
  const warning = Boolean(row.maloConflict);
  return {
    // OData batch request lines cannot contain raw spaces from workbook source IDs
    // such as "MK7 Participants:12". Keep the key deterministic and URL-safe.
    ID: overviewID(row.sourceId, primaryMaLo),
    primaryMaLo,
    importMaLo: row.maloId || null,
    exportMaLo: row.generationFeedInMaloId || null,
    meLo: row.meloId || null,
    displayName: `${row.role} · ${row.city || row.buildingId}`,
    roleCode,
    roleLabel: row.role,
    directionCode,
    nodeType,
    city: row.city || null,
    streetAddress: row.streetAddress || null,
    buildingID: row.buildingId,
    participationCode: nodeType === 'HOUSEHOLD' ? (participates ? 'YES' : 'NO') : null,
    participationLabel: nodeType === 'HOUSEHOLD' ? (participates ? 'Ja / Yes' : 'Nein / No') : null,
    participationCriticality: nodeType === 'HOUSEHOLD' ? (participates ? (businessState === 'RUHEND' ? 3 : 2) : 1) : 3,
    isEligible: nodeType === 'HOUSEHOLD' && participates,
    hasDataWarning: warning,
    warningCode: warning ? 'AMBIGUOUS_MALO_ASSIGNMENT' : null,
    warningText: warning ? 'MaLo is assigned to more than one construct.' : null,
    warningCriticality: warning ? 1 : 3,
    supplyStart: row.supplyStartUtc || null,
    contractStart: row.contractFromUtc || null,
    contractEnd: row.contractToUtc || null,
    receivedAt: construct?.registeredAt || null,
    businessState,
    constructStage: construct?.stage || null,
    sourceSystem: 'RUHENDE_MALO',
    simulation: true,
  };
}

export async function overviewConstructSnapshot(db: QueryRunner = cds.db): Promise<OverviewConstruct[]> {
  const [participants, constructs, markets] = await Promise.all([
    db.run(SELECT.from(ns('ParticipantSourceRows')).columns(
      'sourceId', 'constructId', 'buildingId', 'role', 'participationRaw', 'participates', 'meloId', 'maloId',
      'generationFeedInMaloId', 'supplyStartUtc', 'contractFromUtc', 'contractToUtc', 'city', 'operator',
      'streetAddress', 'maloConflict', 'excluded',
    )) as Promise<ParticipantRow[]>,
    db.run(SELECT.from(ns('Constructs')).columns('constructId', 'stage', 'registeredAt', 'stichtag')) as Promise<ConstructRow[]>,
    db.run(SELECT.from(ns('MarketLocations')).columns('maloId', 'businessState')) as Promise<MarketLocationRow[]>,
  ]);
  const constructById = new Map(constructs.map((row) => [row.constructId, row]));
  const marketByMaLo = new Map(markets.map((row) => [row.maloId, row]));
  return participants
    .map((row) => toOverviewConstruct(row, constructById.get(row.constructId || row.buildingId), marketByMaLo.get(row.maloId || '')))
    .filter((row): row is OverviewConstruct => row !== null)
    .sort((a, b) => a.buildingID.localeCompare(b.buildingID) || a.roleLabel.localeCompare(b.roleLabel) || a.primaryMaLo.localeCompare(b.primaryMaLo));
}

export function overviewApiAuthorized(headers: Record<string, string | string[] | undefined>, expected = process.env.OVERVIEW_API_KEY || '') {
  if (!expected) return true;
  const bearer = String(headers.authorization || '').replace(/^Bearer\s+/i, '');
  return headers['x-api-key'] === expected || bearer === expected;
}

export async function pushOverviewSnapshot({
  url = process.env.OVERVIEW_WEBHOOK_URL || '',
  apiKey = process.env.OVERVIEW_WEBHOOK_API_KEY || '',
  snapshot,
  fetchImpl = globalThis.fetch,
}: { url?: string; apiKey?: string; snapshot?: OverviewConstruct[]; fetchImpl?: FetchLike } = {}) {
  if (!url) return { skipped: true, itemCount: 0 };
  const rows = snapshot || await overviewConstructSnapshot();
  const response = await fetchImpl(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(apiKey ? { 'x-api-key': apiKey, authorization: `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify({ value: rows }),
    signal: AbortSignal.timeout(Number(process.env.OVERVIEW_SYNC_TIMEOUT_MS || 10000)),
  });
  if (!response.ok) throw new Error(`Overview webhook returned HTTP ${response.status}`);
  return { skipped: false, itemCount: rows.length };
}

let timer: NodeJS.Timeout | undefined;
export function scheduleOverviewSnapshot() {
  if (!process.env.OVERVIEW_WEBHOOK_URL) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = undefined;
    void pushOverviewSnapshot().catch((error) => console.warn(`[overview-sync] ${error instanceof Error ? error.message : String(error)}`));
  }, 100);
  timer.unref?.();
}
