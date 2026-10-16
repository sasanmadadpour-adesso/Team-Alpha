import cds from '@sap/cds';
import { listCases } from './cases.js';

const NS = 'mk7.controlcenter';

export interface MaloOverviewRow {
  sourceId: string;
  buildingId: string;
  maloId: string;
  meloId: string;
  role: string;
  participationRaw: string;
  participates: boolean;
  excluded: boolean;
  exclusionReason: string | null;
  city: string | null;
  streetAddress: string | null;
  operator: string | null;
  reststromMaloId: string | null;
  generationFeedInMaloId: string | null;
  supplyStartUtc: string | null;
  contractFromUtc: string | null;
  contractToUtc: string | null;
  businessState: string;
  caseStatus: string | null;
  caseCode: string | null;
  caseMessage: string | null;
  processStatus: string | null;
  latestOperation: string | null;
  relationshipCount: number;
  openRelationshipCount: number;
  conflict: boolean;
  sourceRowNumber: number;
}

type SourceRow = Omit<MaloOverviewRow, 'businessState' | 'caseStatus' | 'caseCode' | 'caseMessage' | 'processStatus' | 'latestOperation' | 'relationshipCount' | 'openRelationshipCount' | 'conflict'> & {
  maloConflict: boolean;
};

export async function listMaloOverview(tx: cds.Service): Promise<MaloOverviewRow[]> {
  const [rows, locations, relationships, requests, cases] = await Promise.all([
    tx.run(SELECT.from(`${NS}.ParticipantSourceRows`).columns(
      'sourceId', 'sourceRowNumber', 'buildingId', 'maloId', 'meloId', 'role',
      'participationRaw', 'participates', 'excluded', 'exclusionReason', 'city',
      'streetAddress', 'operator', 'reststromMaloId', 'generationFeedInMaloId',
      'supplyStartUtc', 'contractFromUtc', 'contractToUtc', 'maloConflict',
    ).orderBy('sourceRowNumber')) as Promise<SourceRow[]> | SourceRow[],
    tx.run(SELECT.from(`${NS}.MarketLocations`).columns('maloId', 'businessState', 'conflictingAssignment')) as Promise<{ maloId: string; businessState: string; conflictingAssignment: boolean }[]> | { maloId: string; businessState: string; conflictingAssignment: boolean }[],
    tx.run(SELECT.from(`${NS}.Relationships`).columns('buildingId', 'fromLocationId', 'toLocationId', 'validToExclusive').where({ source: 'SIMULATED' })) as Promise<{ buildingId: string; fromLocationId: string; toLocationId: string; validToExclusive: string | null }[]> | { buildingId: string; fromLocationId: string; toLocationId: string; validToExclusive: string | null }[],
    tx.run(SELECT.from(`${NS}.ProcessRequests`).columns('maloId', 'buildingId', 'operation', 'status', 'executionTime').orderBy('executionTime desc')) as Promise<{ maloId: string; buildingId: string; operation: string; status: string; executionTime: string | null }[]> | { maloId: string; buildingId: string; operation: string; status: string; executionTime: string | null }[],
    listCases(tx),
  ]);

  const stateByMalo = new Map(locations.map((location) => [location.maloId, location]));
  const caseBySource = new Map(cases.map((item) => [item.caseId, item]));
  const requestByKey = new Map<string, (typeof requests)[number]>();
  for (const request of requests) {
    const key = `${request.buildingId}|${request.maloId}`;
    if (!requestByKey.has(key)) requestByKey.set(key, request);
  }

  return rows.map((row) => {
    const currentCase = caseBySource.get(row.sourceId);
    const location = stateByMalo.get(row.maloId);
    const request = requestByKey.get(`${row.buildingId}|${row.maloId}`);
    const rowRelationships = relationships.filter((relationship) =>
      relationship.buildingId === row.buildingId &&
      (relationship.fromLocationId === row.maloId || relationship.toLocationId === row.maloId || relationship.toLocationId === row.meloId),
    );
    return {
      ...row,
      businessState: location?.businessState ?? currentCase?.businessState ?? 'UNKNOWN',
      caseStatus: currentCase?.status ?? null,
      caseCode: currentCase?.code ?? null,
      caseMessage: currentCase?.message ?? null,
      processStatus: request?.status ?? null,
      latestOperation: request?.operation ?? null,
      relationshipCount: rowRelationships.length,
      openRelationshipCount: rowRelationships.filter((relationship) => !relationship.validToExclusive).length,
      conflict: Boolean(row.maloConflict || location?.conflictingAssignment || currentCase?.status === 'DECISION'),
    };
  });
}
