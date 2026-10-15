import {
  AlertTriangle, Building2, CheckCircle2, CircleAlert, Clock, Play,
} from 'lucide-react';
import { PageHeader } from '../components/AppShell';
import { Badge, Button, Callout, Card, EmptyState, StatusBadge, Term } from '../components/primitives';
import { DataTable } from '../components/DataTable';
import type { AppData } from '../lib/useAppData';
import type { BuildingSummary, Metrics } from '../lib/useAppData';
import { GLOSSARY, formatDate, operationCodeLabel, relativeTime, statusMeta } from '../lib/domain';

interface Attention { kind: string; maloId: string; title: string; text: string }

const STEPS = [
  { title: 'Marktlokation auswählen', text: 'Gebäude, MaLo und Vorgang in der Workbench festlegen.' },
  { title: 'Voraussetzungen prüfen', text: 'Teilnahme, Identität, Beziehungen und Zeitscheiben werden geprüft.' },
  { title: 'Änderungen ansehen', text: 'Vorher-/Nachher-Vergleich lesen, bevor etwas geschrieben wird.' },
  { title: 'Vorgang ausführen', text: 'Nach ausdrücklicher Bestätigung schreibt das Backend die Änderung.' },
  { title: 'Ergebnis nachverfolgen', text: 'Jeder Vorgang landet unveränderlich in Historie & Protokoll.' },
];

function Metric({ label, value, hint, tone, onClick }: {
  label: string; value: number | string; hint?: string;
  tone?: 'accent' | 'success' | 'warning' | 'danger'; onClick?: () => void;
}) {
  const className = `metric${tone ? ` metric--${tone}` : ''}`;
  const body = (
    <>
      <span className="metric__label">{label}</span>
      <span className="metric__value">{value}</span>
      {hint ? <span className="metric__hint">{hint}</span> : null}
    </>
  );
  return onClick
    ? <button type="button" className={className} onClick={onClick}>{body}</button>
    : <div className={className}>{body}</div>;
}

export function OverviewPage({ data, metrics, buildings, attention, onOpenBuilding, onStartProcess, onOpenMalo, onOpenHistory }: {
  data: AppData;
  metrics: Metrics;
  buildings: BuildingSummary[];
  attention: Attention[];
  onOpenBuilding: (buildingId: string) => void;
  onStartProcess: () => void;
  onOpenMalo: (maloId: string) => void;
  onOpenHistory: () => void;
}) {
  const latestImport = data.imports[0];
  const recent = data.history.slice(0, 6);

  return (
    <div className="stack">
      <PageHeader
        title="Übersicht"
        description={
          <>
            Das MK7 Control Center verwaltet die simulierte Ruhendstellung und Wiederaktivierung von{' '}
            <Term term="MaLo" definition={GLOSSARY.MaLo}>Marktlokationen</Term> innerhalb eines{' '}
            <Term term="vSZ" definition={GLOSSARY.vSZ}>vSZ</Term>-Konstrukts. Alle Zahlen stammen direkt aus der
            lokalen CAP-/SQLite-Datenbank.
          </>
        }
        actions={<Button variant="primary" icon={<Play size={15} />} onClick={onStartProcess}>Ruhendstellung starten</Button>}
      />

      <section className="grid-metrics" aria-label="Kennzahlen">
        <Metric
          label="Eindeutige MaLos"
          value={metrics.uniqueMalos}
          hint={`aus ${metrics.sourceAssignments} Quellzuordnungen`}
        />
        <Metric
          label="Teilnehmende Haushalte"
          value={metrics.participatingHouseholds}
          hint={`von ${metrics.households} Haushaltszeilen`}
          tone="accent"
        />
        <Metric label="Aktiv" value={metrics.activeParticipating} hint="teilnehmende MaLos im Status ACTIVE" tone="success" />
        <Metric label="Ruhend" value={metrics.dormantParticipating} hint="teilnehmende MaLos im Status RUHEND" tone="warning" />
        <Metric
          label="Konflikte"
          value={metrics.conflicting}
          hint="mehrdeutige Identität — Prüfung nötig"
          tone={metrics.conflicting > 0 ? 'danger' : undefined}
          onClick={metrics.conflicting > 0 ? () => onOpenMalo('') : undefined}
        />
        <Metric label="Erfolgreiche Vorgänge" value={metrics.recentSuccess} hint="simuliert und persistiert" />
      </section>

      <div className="split">
        <div className="stack">
          <Card
            title="Gebäude im MK7-Konstrukt"
            subtitle="Ein Gebäude je Reststrom-MaLo. Auswählen, um die zugehörigen Marktlokationen zu filtern."
            flush
          >
            <DataTable
              rows={buildings}
              rowKey={(row) => row.buildingId}
              onRowClick={(row) => onOpenBuilding(row.buildingId)}
              caption="Gebäude des MK7-Konstrukts"
              columns={[
                {
                  key: 'building',
                  header: 'Gebäude',
                  sortValue: (row) => row.buildingId,
                  render: (row) => (
                    <span className="row" style={{ gap: 'var(--s-2)', flexWrap: 'nowrap' }}>
                      <Building2 size={15} className="subtle" aria-hidden style={{ flexShrink: 0 }} />
                      <span>
                        <span className="mono strong">{row.buildingId}</span>
                        <span className="tiny subtle" style={{ display: 'block' }}>{row.city ?? '—'}</span>
                      </span>
                    </span>
                  ),
                },
                {
                  key: 'reststrom',
                  header: 'Reststrom-MaLo',
                  sortValue: (row) => row.reststromMaloId,
                  render: (row) => <span className="mono">{row.reststromMaloId}</span>,
                },
                { key: 'participating', header: 'Teiln.', numeric: true, sortValue: (row) => row.participating, render: (row) => <span className="num">{row.participating} / {row.households}</span> },
                { key: 'active', header: 'Aktiv', numeric: true, sortValue: (row) => row.active, render: (row) => <span className="num">{row.active}</span> },
                { key: 'dormant', header: 'Ruhend', numeric: true, sortValue: (row) => row.dormant, render: (row) => <span className="num">{row.dormant}</span> },
                {
                  key: 'issues',
                  header: 'Offen',
                  sortValue: (row) => row.issues,
                  render: (row) => row.issues > 0
                    ? <StatusBadge tone="warning" label={String(row.issues)} title={`${row.issues} Konflikt${row.issues === 1 ? '' : 'e'}`} />
                    : <StatusBadge tone="success" label="0" title="Keine offenen Punkte" />,
                },
              ]}
              empty={<EmptyState title="Keine Gebäude importiert" text="Führen Sie npm run import:data aus, um die Arbeitsmappe zu laden." />}
            />
          </Card>

          <Card
            title="Letzte Vorgänge"
            subtitle="Direkt aus den persistierten CAP-Prozessanfragen."
            actions={<Button variant="ghost" size="sm" onClick={onOpenHistory}>Alle anzeigen</Button>}
            flush
          >
            {recent.length === 0 ? (
              <EmptyState
                icon={<Clock size={20} />}
                title="Noch keine Vorgänge ausgeführt"
                text="Starten Sie eine Ruhendstellung in der Prozess-Workbench, um die Historie zu füllen."
                action={<Button variant="secondary" onClick={onStartProcess}>Zur Workbench</Button>}
              />
            ) : (
              <DataTable
                rows={recent}
                rowKey={(row) => row.ID}
                onRowClick={(row) => onOpenMalo(row.maloId)}
                caption="Zuletzt ausgeführte Vorgänge"
                columns={[
                  { key: 'operation', header: 'Vorgang', render: (row) => <span className="strong small">{operationCodeLabel(row.operation)}</span> },
                  { key: 'malo', header: 'MaLo', render: (row) => <span className="mono">{row.maloId}</span> },
                  {
                    key: 'status',
                    header: 'Ergebnis',
                    render: (row) => {
                      const meta = statusMeta(row.status);
                      return <StatusBadge tone={meta.tone} label={meta.label} title={meta.explain} />;
                    },
                  },
                  { key: 'mode', header: 'Modus', render: (row) => <Badge>{row.mode === 'BATCH' ? 'Automatisch' : 'Manuell'}</Badge> },
                  { key: 'when', header: 'Zeitpunkt', render: (row) => <span className="small subtle">{relativeTime(row.createdAt)}</span> },
                ]}
              />
            )}
          </Card>
        </div>

        <div className="stack">
          <Card title="So funktioniert der Prozess" subtitle="Fünf Schritte vom Auswählen bis zum Nachweis.">
            <ol style={{ margin: 0, paddingLeft: 0, listStyle: 'none', display: 'grid', gap: 'var(--s-3)' }}>
              {STEPS.map((step, index) => (
                <li key={step.title} className="row" style={{ gap: 'var(--s-3)', alignItems: 'flex-start', flexWrap: 'nowrap' }}>
                  <span className="step__marker" aria-hidden style={{ color: 'var(--c-accent)' }}>{index + 1}</span>
                  <span>
                    <span className="strong small" style={{ display: 'block' }}>{step.title}</span>
                    <span className="tiny muted">{step.text}</span>
                  </span>
                </li>
              ))}
            </ol>
          </Card>

          <Card
            title="Aufmerksamkeit erforderlich"
            subtitle="Konflikte und nicht ausgeführte Vorgänge."
          >
            {attention.length === 0 ? (
              <Callout tone="success" title="Keine offenen Punkte">
                Es liegen keine mehrdeutigen Identitäten oder blockierten Vorgänge vor.
              </Callout>
            ) : (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 'var(--s-2)' }}>
                {attention.slice(0, 6).map((item, index) => (
                  <li key={`${item.maloId}-${index}`} className="check-row" data-tone={item.kind === 'CONFLICT' || item.kind === 'REVIEW' ? 'warning' : 'danger'}>
                    {item.kind === 'ERROR'
                      ? <CircleAlert size={16} className="check-row__icon" aria-hidden />
                      : <AlertTriangle size={16} className="check-row__icon" aria-hidden />}
                    <div className="check-row__body">
                      <div className="check-row__title">{item.title}</div>
                      <p className="check-row__text">{item.text}</p>
                      {item.maloId ? (
                        <Button variant="ghost" size="sm" onClick={() => onOpenMalo(item.maloId)} style={{ marginTop: 4, paddingLeft: 0 }}>
                          MaLo {item.maloId} ansehen
                        </Button>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Datenherkunft" subtitle="Grundlage aller angezeigten Zahlen.">
            <div className="stack--sm">
              {latestImport ? (
                <>
                  <div className="kv-inline"><span className="kv-inline__k">Quelldatei</span><span className="mono tiny">{latestImport.sourceFile}</span></div>
                  <div className="kv-inline"><span className="kv-inline__k">Zeilen</span><span className="num">{latestImport.totalRows}</span></div>
                  <div className="kv-inline"><span className="kv-inline__k">Gebäude</span><span className="num">{latestImport.buildingCount}</span></div>
                  <div className="kv-inline"><span className="kv-inline__k">Importiert</span><span>{formatDate(latestImport.completedAt)}</span></div>
                  <div className="kv-inline"><span className="kv-inline__k">Prüfsumme</span><span className="mono tiny" style={{ overflowWrap: 'anywhere' }}>{latestImport.sourceChecksum.slice(0, 24)}…</span></div>
                </>
              ) : <p className="muted small">Kein Importlauf erfasst.</p>}
              <Callout tone="warning" title="Keine SAP-Verifikation">
                Lieferanten-, Markt- und vSZ-Status liegen nicht als geprüfte SAP-Daten vor. Sie gelten als
                <strong> UNBEKANNT</strong>, sofern nicht ausdrücklich eine Demo-Annahme gewählt wird.
              </Callout>
              <div className="row" style={{ gap: 'var(--s-2)' }}>
                <CheckCircle2 size={13} className="text-success" aria-hidden />
                <span className="tiny muted">SQLite ist die maßgebliche Quelle — Änderungen überstehen ein Neuladen.</span>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
