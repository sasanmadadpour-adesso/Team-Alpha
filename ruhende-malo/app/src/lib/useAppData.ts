import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  type Building, type LifecyclePeriod, type MarketLocation, type ProcessRequest,
  type Relationship, type SourceRow, type SystemStatus, type AuditEvent, type ImportRun,
  type PrerequisiteCheck,
  getAuditEvents, getBuildings, getHistory, getImportRuns, getLifecyclePeriods,
  getLocations, getPrerequisiteChecks, getRelationships, getSourceRows, getSystemStatus,
} from '../api/maloApi';
import { ROLE_HOUSEHOLD } from './domain';

export interface AppData {
  status?: SystemStatus;
  buildings: Building[];
  locations: MarketLocation[];
  sourceRows: SourceRow[];
  relationships: Relationship[];
  periods: LifecyclePeriod[];
  history: ProcessRequest[];
  audit: AuditEvent[];
  imports: ImportRun[];
  checks: PrerequisiteCheck[];
}

const EMPTY: AppData = {
  buildings: [], locations: [], sourceRows: [], relationships: [],
  periods: [], history: [], audit: [], imports: [], checks: [],
};

/**
 * Loads all backend collections the UI needs. Everything is derived from CAP;
 * nothing is cached across reloads, so persisted state is always truthful.
 */
export function useAppData() {
  const [data, setData] = useState<AppData>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const mounted = useRef(true);

  // Re-arm on mount so React StrictMode's double-invoke does not leave the flag false.
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [status, buildings, locations, sourceRows, relationships, periods, history, audit, imports, checks] =
        await Promise.all([
          getSystemStatus(), getBuildings(), getLocations(), getSourceRows(),
          getRelationships(), getLifecyclePeriods(), getHistory(), getAuditEvents(), getImportRuns(),
          getPrerequisiteChecks(),
        ]);
      if (!mounted.current) return;
      setData({ status, buildings, locations, sourceRows, relationships, periods, history, audit, imports, checks });
      setError(undefined);
    } catch (reason) {
      if (!mounted.current) return;
      setError(reason instanceof Error ? reason.message : 'Unbekannter API-Fehler');
    } finally {
      if (mounted.current && !silent) setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return { data, loading, error, reload: load };
}

/* ------------------------------- Derivations ------------------------------ */

export interface BuildingSummary {
  buildingId: string;
  city?: string;
  operator?: string;
  reststromMaloId: string;
  households: number;
  participating: number;
  dormant: number;
  active: number;
  issues: number;
}

export interface Metrics {
  uniqueMalos: number;
  sourceAssignments: number;
  households: number;
  participatingHouseholds: number;
  activeParticipating: number;
  dormantParticipating: number;
  conflicting: number;
  recentSuccess: number;
}

/** All figures are computed from the current backend payload, never hardcoded. */
export function useDerived(data: AppData) {
  return useMemo(() => {
    const stateOf = new Map(data.locations.map((item) => [item.maloId, item.businessState]));
    const conflictOf = new Map(data.locations.map((item) => [item.maloId, item.conflictingAssignment]));

    const householdRows = data.sourceRows.filter((row) => row.role === ROLE_HOUSEHOLD);
    const participatingRows = householdRows.filter((row) => row.participates);
    const participatingMalos = [...new Set(participatingRows.map((row) => row.maloId))];

    const metrics: Metrics = {
      uniqueMalos: data.locations.length,
      sourceAssignments: data.sourceRows.length,
      households: householdRows.length,
      participatingHouseholds: participatingMalos.length,
      activeParticipating: participatingMalos.filter((id) => stateOf.get(id) === 'ACTIVE').length,
      dormantParticipating: participatingMalos.filter((id) => stateOf.get(id) === 'RUHEND').length,
      conflicting: data.locations.filter((item) => item.conflictingAssignment).length,
      recentSuccess: data.history.filter((item) => item.status === 'SUCCESS').length,
    };

    const buildings: BuildingSummary[] = data.buildings.map((building) => {
      const rows = householdRows.filter((row) => row.buildingId === building.buildingId);
      const participating = rows.filter((row) => row.participates);
      const ids = [...new Set(participating.map((row) => row.maloId))];
      return {
        buildingId: building.buildingId,
        city: building.city,
        operator: building.operator,
        reststromMaloId: building.reststromMaloId,
        households: rows.length,
        participating: ids.length,
        dormant: ids.filter((id) => stateOf.get(id) === 'RUHEND').length,
        active: ids.filter((id) => stateOf.get(id) === 'ACTIVE').length,
        issues: ids.filter((id) => conflictOf.get(id)).length,
      };
    });

    const attention = [
      ...data.locations
        .filter((item) => item.conflictingAssignment)
        .map((item) => ({
          kind: 'CONFLICT' as const,
          maloId: item.maloId,
          title: 'Mehrdeutige MaLo-Identität',
          text: `${item.maloId} ist mehreren Gebäuden bzw. Reststrom-Zielen zugeordnet und muss manuell geklärt werden.`,
        })),
      ...data.history
        .filter((item) => ['BLOCKED', 'REVIEW', 'ERROR'].includes(item.status))
        .slice(0, 8)
        .map((item) => ({
          kind: item.status as 'BLOCKED' | 'REVIEW' | 'ERROR',
          maloId: item.maloId,
          title: `${item.status}: ${item.resultCode ?? item.operation}`,
          text: item.resultMessage ?? 'Kein Ergebnistext vorhanden.',
        })),
    ];

    return { metrics, buildings, attention, stateOf };
  }, [data]);
}
