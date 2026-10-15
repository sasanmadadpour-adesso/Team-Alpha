import { useMemo, useState } from 'react';
import { Filter, Pause, Play, Scissors, SearchX, Table2 } from 'lucide-react';
import { PageHeader } from '../components/AppShell';
import {
  Badge, Button, Callout, Card, CopyValue, DefinitionList, EmptyState, Field,
  SearchInput, Select, StatusBadge, Term,
} from '../components/primitives';
import { DataTable } from '../components/DataTable';
import { Drawer } from '../components/overlays';
import { RelationshipViewer } from '../components/domain';
import type { AppData } from '../lib/useAppData';
import type { OperationKey } from '../lib/domain';
import {
  GLOSSARY, ROLE_HOUSEHOLD, businessStateMeta, formatDate, formatInterval,
  operationCodeLabel, relativeTime, roleTone, statusMeta,
} from '../lib/domain';

export interface ExplorerFilters {
  search: string;
  building: string;
  participation: string;
  state: string;
  conflicts: string;
}

export const EMPTY_FILTERS: ExplorerFilters = {
  search: '', building: 'ALL', participation: 'ALL', state: 'ALL', conflicts: 'ALL',
};

/** A MaLo row enriched with the source assignments that produced it. */
interface MaloRow {
  maloId: string;
  role: string;
  participates: boolean;
  businessState: 'ACTIVE' | 'RUHEND';
  conflicting: boolean;
  buildings: string[];
  reststromTargets: string[];
  meloIds: string[];
  assignmentCount: number;
}

export function ExplorerPage({ data, filters, onFilters, selectedMalo, onSelectMalo, onStartOperation, onCopied }: {
  data: AppData;
  filters: ExplorerFilters;
  onFilters: (filters: ExplorerFilters) => void;
  selectedMalo?: string;
  onSelectMalo: (maloId: string | undefined) => void;
  onStartOperation: (maloId: string, buildingId: string, operation: OperationKey) => void;
  onCopied: (value: string) => void;
}) {
  const [showSource, setShowSource] = useState(false);

  const rows = useMemo<MaloRow[]>(() => data.locations.map((location) => {
    const assignments = data.sourceRows.filter((row) => row.maloId === location.maloId);
    return {
      maloId: location.maloId,
      role: location.primaryRole,
      participates: location.participates,
      businessState: location.businessState,
      conflicting: location.conflictingAssignment,
      buildings: [...new Set(assignments.map((row) => row.buildingId))],
      reststromTargets: [...new Set(assignments.map((row) => row.reststromMaloId))],
      meloIds: [...new Set(assignments.map((row) => row.meloId))],
      assignmentCount: assignments.length,
    };
  }), [data.locations, data.sourceRows]);

  const filtered = useMemo(() => {
    const needle = filters.search.trim().toLowerCase();
    return rows.filter((row) => {
      if (needle && ![row.maloId, row.role, ...row.buildings, ...row.meloIds, ...row.reststromTargets]
        .some((value) => value.toLowerCase().includes(needle))) return false;
      if (filters.building !== 'ALL' && !row.buildings.includes(filters.building)) return false;
      if (filters.participation === 'JA' && !row.participates) return false;
      if (filters.participation === 'NEIN' && row.participates) return false;
      if (filters.state !== 'ALL' && row.businessState !== filters.state) return false;
      if (filters.conflicts === 'ONLY' && !row.conflicting) return false;
      if (filters.conflicts === 'NONE' && row.conflicting) return false;
      return true;
    });
  }, [rows, filters]);

  const active = rows.find((row) => row.maloId === selectedMalo);
  const dirty = JSON.stringify(filters) !== JSON.stringify(EMPTY_FILTERS);
  const set = (patch: Partial<ExplorerFilters>) => onFilters({ ...filters, ...patch });

  return (
    <div className="stack">
      <PageHeader
        title="MaLo Explorer"
        description={
          <>
            Alle eindeutigen <Term term="MaLo" definition={GLOSSARY.MaLo}>Marktlokationen</Term> aus der importierten
            Arbeitsmappe. Eine Zeile entspricht einer Identität — nicht einer Quellzeile.
          </>
        }
        actions={
          <Button
            variant={showSource ? 'primary' : 'secondary'}
            icon={<Table2 size={15} />}
            onClick={() => setShowSource((value) => !value)}
            aria-pressed={showSource}
          >
            Quellzuordnungen
          </Button>
        }
      />

      <Card flush>
        <div className="filterbar">
          <SearchInput
            label="Marktlokationen durchsuchen"
            placeholder="MaLo, MeLo, Gebäude oder Rolle…"
            value={filters.search}
            onChange={(value) => set({ search: value })}
          />
          <Field label="Gebäude" htmlFor="f-building">
            <Select id="f-building" value={filters.building} onChange={(event) => set({ building: event.target.value })}>
              <option value="ALL">Alle Gebäude</option>
              {data.buildings.map((building) => (
                <option key={building.buildingId} value={building.buildingId}>{building.buildingId}</option>
              ))}
            </Select>
          </Field>
          <Field label="Teilnahme MK7" htmlFor="f-part">
            <Select id="f-part" value={filters.participation} onChange={(event) => set({ participation: event.target.value })}>
              <option value="ALL">Alle</option>
              <option value="JA">Ja</option>
              <option value="NEIN">Nein</option>
            </Select>
          </Field>
          <Field label="Status" htmlFor="f-state">
            <Select id="f-state" value={filters.state} onChange={(event) => set({ state: event.target.value })}>
              <option value="ALL">Alle</option>
              <option value="ACTIVE">ACTIVE</option>
              <option value="RUHEND">RUHEND</option>
            </Select>
          </Field>
          <Field label="Konflikte" htmlFor="f-conflict">
            <Select id="f-conflict" value={filters.conflicts} onChange={(event) => set({ conflicts: event.target.value })}>
              <option value="ALL">Alle</option>
              <option value="ONLY">Nur Konflikte</option>
              <option value="NONE">Ohne Konflikte</option>
            </Select>
          </Field>
          {dirty ? (
            <Button variant="ghost" icon={<Filter size={14} />} onClick={() => onFilters(EMPTY_FILTERS)}>
              Filter zurücksetzen
            </Button>
          ) : null}
        </div>

        <DataTable
          rows={filtered}
          rowKey={(row) => row.maloId}
          selectedKey={selectedMalo}
          onRowClick={(row) => onSelectMalo(row.maloId)}
          initialSort={{ key: 'malo', direction: 'asc' }}
          caption="Marktlokationen"
          footer={`${filtered.length} von ${rows.length} Marktlokationen`}
          columns={[
            {
              key: 'malo',
              header: 'MaLo-ID',
              sortValue: (row) => row.maloId,
              render: (row) => <CopyValue value={row.maloId} onCopied={onCopied} />,
            },
            {
              key: 'role',
              header: 'Rolle',
              sortValue: (row) => row.role,
              render: (row) => <Badge tone={roleTone(row.role)}>{row.role}</Badge>,
            },
            {
              key: 'building',
              header: 'Gebäude',
              sortValue: (row) => row.buildings.join(','),
              render: (row) => <span className="mono small">{row.buildings.join(', ')}</span>,
            },
            {
              key: 'participation',
              header: 'Teilnahme',
              sortValue: (row) => (row.participates ? 1 : 0),
              render: (row) => row.participates
                ? <StatusBadge tone="success" label="Ja" />
                : <Badge>Nein</Badge>,
            },
            {
              key: 'state',
              header: 'Status',
              sortValue: (row) => row.businessState,
              render: (row) => {
                const meta = businessStateMeta(row.businessState);
                return <StatusBadge tone={meta.tone} label={meta.label} />;
              },
            },
            {
              key: 'reststrom',
              header: 'Reststrom-MaLo',
              sortValue: (row) => row.reststromTargets.join(','),
              render: (row) => row.reststromTargets.length > 1
                ? <span className="mono small text-danger">{row.reststromTargets.join(' / ')}</span>
                : <span className="mono small">{row.reststromTargets[0] ?? '—'}</span>,
            },
            {
              key: 'validation',
              header: 'Validierung',
              sortValue: (row) => (row.conflicting ? 0 : 1),
              render: (row) => row.conflicting
                ? <StatusBadge tone="warning" label="REVIEW" title="Mehrdeutige Identität über mehrere Gebäude" />
                : <StatusBadge tone="success" label="OK" />,
            },
          ]}
          empty={
            <EmptyState
              icon={<SearchX size={20} />}
              title="Keine Marktlokation gefunden"
              text="Keine Zeile entspricht den gewählten Filtern. Setzen Sie die Filter zurück, um alle Einträge zu sehen."
              action={dirty ? <Button variant="secondary" onClick={() => onFilters(EMPTY_FILTERS)}>Filter zurücksetzen</Button> : undefined}
            />
          }
        />
      </Card>

      {showSource ? (
        <Card
          title="Quellzuordnungen"
          subtitle={`${data.sourceRows.length} Zeilen des Arbeitsblatts „MK7 Teilnehmer“ — unverändert übernommen.`}
          flush
        >
          <DataTable
            rows={data.sourceRows}
            rowKey={(row) => row.sourceId}
            onRowClick={(row) => onSelectMalo(row.maloId)}
            caption="Quellzeilen aus der Arbeitsmappe"
            columns={[
              { key: 'row', header: 'Zeile', numeric: true, sortValue: (row) => row.sourceRowNumber, render: (row) => <span className="num subtle">{row.sourceRowNumber}</span> },
              { key: 'building', header: 'Gebäude', sortValue: (row) => row.buildingId, render: (row) => <span className="mono">{row.buildingId}</span> },
              { key: 'role', header: 'mk7_rolle', sortValue: (row) => row.role, render: (row) => <Badge tone={roleTone(row.role)}>{row.role}</Badge> },
              { key: 'participation', header: 'Teilnahme MK7', sortValue: (row) => row.participationRaw, render: (row) => <span className="small">{row.participationRaw}</span> },
              { key: 'malo', header: 'Bezugs-MaLo', sortValue: (row) => row.maloId, render: (row) => <span className="mono">{row.maloId}</span> },
              { key: 'melo', header: 'MeLo', sortValue: (row) => row.meloId, render: (row) => <span className="mono tiny">{row.meloId}</span> },
              { key: 'target', header: 'Reststrom-MaLo', sortValue: (row) => row.reststromMaloId, render: (row) => <span className="mono">{row.reststromMaloId}</span> },
              { key: 'start', header: 'Versorgungsbeginn', sortValue: (row) => row.supplyStartUtc ?? '', render: (row) => <span className="num small">{formatDate(row.supplyStartUtc)}</span> },
              { key: 'conflict', header: 'Konflikt', sortValue: (row) => (row.maloConflict ? 0 : 1), render: (row) => row.maloConflict ? <StatusBadge tone="warning" label="REVIEW" /> : <span className="subtle">—</span> },
            ]}
          />
        </Card>
      ) : null}

      <MaloDrawer
        data={data}
        row={active}
        onClose={() => onSelectMalo(undefined)}
        onStartOperation={onStartOperation}
      />
    </div>
  );
}

/* ------------------------------ Detail drawer ----------------------------- */

function MaloDrawer({ data, row, onClose, onStartOperation }: {
  data: AppData;
  row?: MaloRow;
  onClose: () => void;
  onStartOperation: (maloId: string, buildingId: string, operation: OperationKey) => void;
}) {
  if (!row) return null;

  const assignments = data.sourceRows.filter((item) => item.maloId === row.maloId);
  const periods = data.periods
    .filter((item) => item.maloId === row.maloId)
    .sort((a, b) => (a.validFrom ?? '').localeCompare(b.validFrom ?? ''));
  const requests = data.history.filter((item) => item.maloId === row.maloId).slice(0, 8);
  const state = businessStateMeta(row.businessState);
  const eligible = row.role === ROLE_HOUSEHOLD && row.participates && !row.conflicting && row.buildings.length === 1;
  const building = row.buildings[0] ?? '';

  return (
    <Drawer
      open
      onClose={onClose}
      title={<span className="mono">{row.maloId}</span>}
      subtitle={`${row.role} · ${row.buildings.join(', ') || 'kein Gebäude'}`}
      footer={
        <>
          <Button
            variant="primary"
            icon={<Pause size={14} />}
            disabled={!eligible || row.businessState !== 'ACTIVE'}
            title={!eligible ? 'Nur für eindeutige, teilnehmende Haushalts-MaLos verfügbar' : undefined}
            onClick={() => onStartOperation(row.maloId, building, 'setDormant')}
          >
            Ruhendstellung
          </Button>
          <Button
            variant="secondary"
            icon={<Play size={14} />}
            disabled={!eligible || row.businessState !== 'RUHEND'}
            title={row.businessState !== 'RUHEND' ? 'Nur für ruhende Marktlokationen verfügbar' : undefined}
            onClick={() => onStartOperation(row.maloId, building, 'reactivate')}
          >
            Wiederaktivierung
          </Button>
          <Button
            variant="secondary"
            icon={<Scissors size={14} />}
            disabled={!eligible}
            onClick={() => onStartOperation(row.maloId, building, 'removeFromConstruct')}
          >
            Herauslösung
          </Button>
        </>
      }
    >
      {row.conflicting ? (
        <Callout tone="warning" title="Mehrdeutige Identität — keine Ausführung möglich">
          Diese MaLo ist in {row.buildings.length} Gebäuden mit unterschiedlichen MeLos bzw. Reststrom-Zielen
          erfasst. Das Backend liefert hier <strong>REVIEW</strong> und ändert nichts, bis die Identität geklärt ist.
        </Callout>
      ) : null}

      <section>
        <h3 className="card__title" style={{ marginBottom: 'var(--s-3)' }}>Identität</h3>
        <DefinitionList
          items={[
            { term: 'MaLo-ID', value: <CopyValue value={row.maloId} /> },
            { term: 'Rolle', value: <Badge tone={roleTone(row.role)}>{row.role}</Badge> },
            { term: 'Gebäude', value: <span className="mono">{row.buildings.join(', ') || '—'}</span> },
            { term: 'Teilnahme MK7', value: row.participates ? <StatusBadge tone="success" label="Ja" /> : <Badge>Nein</Badge> },
            { term: 'Aktueller Status', value: <StatusBadge tone={state.tone} label={state.label} /> },
            {
              term: <Term term="Reststrom-MaLo" definition={GLOSSARY['Reststrom-MaLo']} />,
              value: <span className="mono">{row.reststromTargets.join(' / ') || '—'}</span>,
            },
            {
              term: <Term term="MeLo" definition={GLOSSARY.MeLo} />,
              value: <span className="mono tiny" style={{ overflowWrap: 'anywhere' }}>{row.meloIds.join(', ') || '—'}</span>,
            },
            { term: 'Quellzeilen', value: <span className="num">{row.assignmentCount}</span> },
          ]}
        />
      </section>

      <section>
        <h3 className="card__title" style={{ marginBottom: 'var(--s-3)' }}>Quellzuordnungen</h3>
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 'var(--s-2)' }}>
          {assignments.map((item) => (
            <li key={item.sourceId} className="callout" style={{ background: 'var(--c-surface-sunken)', display: 'block' }}>
              <div className="row" style={{ gap: 'var(--s-2)' }}>
                <Badge tone="info">Zeile {item.sourceRowNumber}</Badge>
                <span className="mono small">{item.buildingId}</span>
                <Badge>{item.participationRaw}</Badge>
              </div>
              <div className="tiny subtle" style={{ marginTop: 4, overflowWrap: 'anywhere' }}>
                MeLo {item.meloId} · Reststrom {item.reststromMaloId} · Versorgungsbeginn {formatDate(item.supplyStartUtc)}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h3 className="card__title" style={{ marginBottom: 'var(--s-3)' }}>
          <Term term="Zeitscheibe" definition={GLOSSARY.Zeitscheibe}>Zeitscheiben</Term>
        </h3>
        {periods.length === 0 ? <p className="muted small">Keine Lebenszyklus-Zeitscheiben hinterlegt.</p> : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 'var(--s-2)' }}>
            {periods.map((period) => {
              const meta = businessStateMeta(period.businessState);
              return (
                <li key={period.ID} className="row" style={{ justifyContent: 'space-between' }}>
                  <StatusBadge tone={meta.tone} label={meta.label} />
                  <span className="small num">{formatInterval(period.validFrom, period.validToExclusive)}</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section>
        <h3 className="card__title" style={{ marginBottom: 'var(--s-3)' }}>
          <Term term="MeMa" definition={GLOSSARY.MeMa} /> / <Term term="MaMa" definition={GLOSSARY.MaMa} />
        </h3>
        <RelationshipViewer relationships={data.relationships} maloId={row.maloId} meloIds={row.meloIds} />
      </section>

      <section>
        <h3 className="card__title" style={{ marginBottom: 'var(--s-3)' }}>Letzte Vorgänge</h3>
        {requests.length === 0 ? <p className="muted small">Für diese MaLo wurde noch kein Vorgang ausgeführt.</p> : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 'var(--s-2)' }}>
            {requests.map((request) => {
              const meta = statusMeta(request.status);
              return (
                <li key={request.ID} className="row" style={{ justifyContent: 'space-between', gap: 'var(--s-2)' }}>
                  <span className="small">{operationCodeLabel(request.operation)}</span>
                  <span className="row" style={{ gap: 'var(--s-2)' }}>
                    <StatusBadge tone={meta.tone} label={meta.label} />
                    <span className="tiny subtle">{relativeTime(request.createdAt)}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </Drawer>
  );
}
