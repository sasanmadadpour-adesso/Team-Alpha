import { useMemo, useState } from 'react';
import { History, Layers, Play, RotateCcw } from 'lucide-react';
import { PageHeader } from '../components/AppShell';
import {
  Badge, Button, Callout, Card, Checkbox, EmptyState, Field, Input, Select, StatusBadge,
} from '../components/primitives';
import { DataTable } from '../components/DataTable';
import { ConfirmationDialog } from '../components/overlays';
import { RawPayload } from '../components/domain';
import { type BatchResult, executeBatch, parseJson, resetDemo } from '../api/maloApi';
import type { AppData } from '../lib/useAppData';
import { ROLE_HOUSEHOLD, formatDate, statusMeta } from '../lib/domain';

interface BatchItem {
  maloId: string; status: string; code: string; message: string;
  beforeState?: string; afterState?: string; requestId?: string;
}

/** Mirrors the backend eligibility rules for display only — the engine decides. */
type Expectation = 'SUCCESS' | 'SKIPPED' | 'REVIEW' | 'ALREADY_DONE' | 'BLOCKED';

export function AutomationPage({ data, onReload, onOpenHistory, onToast }: {
  data: AppData;
  onReload: () => Promise<void> | void;
  onOpenHistory: (maloId?: string) => void;
  onToast: (tone: 'success' | 'danger' | 'info' | 'warning', title: string, text?: string) => void;
}) {
  const [buildingId, setBuildingId] = useState(data.buildings[0]?.buildingId ?? 'B-MUL-01');
  const [effectiveDate, setEffectiveDate] = useState('2026-10-01');
  const [assumed, setAssumed] = useState(false);
  const [running, setRunning] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [resetConfirm, setResetConfirm] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [batch, setBatch] = useState<BatchResult>();
  const [failure, setFailure] = useState<string>();

  const candidates = useMemo(() => {
    const rows = data.sourceRows.filter((row) => row.buildingId === buildingId && row.role === ROLE_HOUSEHOLD);
    const seen = new Set<string>();
    return rows
      .filter((row) => (seen.has(row.maloId) ? false : seen.add(row.maloId)))
      .map((row) => {
        const location = data.locations.find((item) => item.maloId === row.maloId);
        const done = data.history.some((item) =>
          item.maloId === row.maloId && item.operation === 'SET_DORMANT'
          && item.buildingId === buildingId && item.effectiveDate === effectiveDate && item.status === 'SUCCESS');
        const expectation: Expectation =
          location?.conflictingAssignment ? 'REVIEW'
            : !row.participates ? 'SKIPPED'
              : done ? 'ALREADY_DONE'
                : location?.businessState === 'RUHEND' ? 'BLOCKED'
                  : !assumed ? 'BLOCKED' : 'SUCCESS';
        return { ...row, state: location?.businessState ?? 'ACTIVE', conflicting: location?.conflictingAssignment ?? false, expectation };
      });
  }, [data.sourceRows, data.locations, data.history, buildingId, effectiveDate, assumed]);

  const forecast = useMemo(() => ({
    total: candidates.length,
    eligible: candidates.filter((row) => row.expectation === 'SUCCESS').length,
    skipped: candidates.filter((row) => row.expectation === 'SKIPPED').length,
    review: candidates.filter((row) => row.expectation === 'REVIEW').length,
    blocked: candidates.filter((row) => row.expectation === 'BLOCKED').length,
    alreadyDone: candidates.filter((row) => row.expectation === 'ALREADY_DONE').length,
  }), [candidates]);

  const items = parseJson<BatchItem[]>(batch?.resultsJson, []);

  const run = async () => {
    setRunning(true); setFailure(undefined);
    try {
      const value = await executeBatch({
        buildingId, effectiveDate,
        prerequisiteProfile: assumed ? 'ASSUMED_DEMO' : 'STRICT',
        confirmed: true,
      });
      setBatch(value);
      setConfirm(false);
      await onReload();
      onToast('success', 'Stapel abgeschlossen',
        `${value.success} erfolgreich, ${value.skipped} übersprungen, ${value.blocked + value.review} nicht ausgeführt.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Der Stapellauf ist fehlgeschlagen.';
      setFailure(message); setConfirm(false);
      onToast('danger', 'Stapellauf fehlgeschlagen', message);
    } finally {
      setRunning(false);
    }
  };

  const doReset = async () => {
    setResetting(true);
    try {
      const message = await resetDemo(true);
      setBatch(undefined);
      await onReload();
      setResetConfirm(false);
      onToast('info', 'Demo zurückgesetzt', message);
    } catch (error) {
      onToast('danger', 'Zurücksetzen fehlgeschlagen', error instanceof Error ? error.message : undefined);
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="stack">
      <PageHeader
        title="Automatisierung"
        description="Verarbeitet alle Haushalts-Marktlokationen eines Gebäudes als Stapel — über dieselbe Backend-Engine wie die manuelle Workbench."
        actions={
          <Button variant="danger" icon={<RotateCcw size={14} />} onClick={() => setResetConfirm(true)}>
            Demo zurücksetzen
          </Button>
        }
      />

      <Callout tone="info" title="Kein Hintergrunddienst">
        Der Stapel läuft ausschließlich nach einem Klick und wird sequenziell abgearbeitet. Es gibt keinen
        unbeaufsichtigten Scheduler und keinen Fortschritt in Prozent, weil die Laufzeit nicht gemessen werden kann.
      </Callout>

      <div className="split">
        <div className="stack">
          <Card title="1 · Auswahl" subtitle="Umfang und Stichtag des Stapellaufs festlegen.">
            <div className="stack--md">
              <div className="grid-2">
                <Field label="Gebäude" htmlFor="a-building">
                  <Select id="a-building" value={buildingId} onChange={(event) => { setBuildingId(event.target.value); setBatch(undefined); }}>
                    {data.buildings.map((building) => (
                      <option key={building.buildingId} value={building.buildingId}>
                        {building.buildingId} — {building.city}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Stichtag" htmlFor="a-date">
                  <Input id="a-date" type="date" value={effectiveDate} onChange={(event) => { setEffectiveDate(event.target.value); setBatch(undefined); }} />
                </Field>
              </div>
              <Field label="Vorgang" htmlFor="a-op" hint="Der Stapelbetrieb unterstützt aktuell nur die Ruhendstellung.">
                <Select id="a-op" value="setDormant" disabled>
                  <option value="setDormant">Ruhendstellung</option>
                </Select>
              </Field>
              <Checkbox
                checked={assumed}
                tone="warning"
                onChange={(value) => { setAssumed(value); setBatch(undefined); }}
                title="Demo-Annahmen verwenden (ASSUMED_DEMO)"
                note="Ohne diese Auswahl blockiert das Backend jede Position, weil vSZ- und Marktstatus unbekannt sind."
              />
            </div>
          </Card>

          <Card
            title="2 · Vorschau"
            subtitle="Erwartete Einstufung auf Basis der aktuellen Datenbank. Verbindlich ist allein das Backend-Ergebnis."
            flush
          >
            <DataTable
              rows={candidates}
              rowKey={(row) => row.maloId}
              caption="Kandidaten des Stapellaufs"
              footer={`${forecast.total} Kandidaten · ${forecast.eligible} ausführbar · ${forecast.skipped} übersprungen · ${forecast.review + forecast.blocked} nicht ausführbar · ${forecast.alreadyDone} bereits erledigt`}
              columns={[
                { key: 'malo', header: 'MaLo', sortValue: (row) => row.maloId, render: (row) => <span className="mono">{row.maloId}</span> },
                { key: 'participation', header: 'Teilnahme', render: (row) => row.participates ? <StatusBadge tone="success" label="Ja" /> : <Badge>Nein</Badge> },
                { key: 'state', header: 'Status', render: (row) => <Badge tone={row.state === 'RUHEND' ? 'warning' : 'success'}>{row.state}</Badge> },
                {
                  key: 'expect',
                  header: 'Erwartung',
                  sortValue: (row) => row.expectation,
                  render: (row) => {
                    const meta = statusMeta(row.expectation);
                    return <StatusBadge tone={meta.tone} label={meta.label} title={meta.explain} />;
                  },
                },
              ]}
              empty={<EmptyState title="Keine Kandidaten" text="In diesem Gebäude gibt es keine Haushalts-Marktlokationen." />}
            />
          </Card>

          {batch ? (
            <Card
              title="4 · Ergebnisse"
              subtitle={`Stapel ${batch.batchId.slice(0, 8)} · ${batch.total} Positionen · simuliert`}
              flush
              actions={<Button variant="ghost" size="sm" icon={<History size={14} />} onClick={() => onOpenHistory()}>Protokoll</Button>}
            >
              <div className="card__body" style={{ paddingBottom: 0 }}>
                <div className="grid-metrics">
                  {([
                    ['Erfolgreich', batch.success, 'success'],
                    ['Übersprungen', batch.skipped, undefined],
                    ['Bereits erledigt', batch.alreadyDone, undefined],
                    ['Blockiert', batch.blocked, 'danger'],
                    ['Prüfung nötig', batch.review, 'warning'],
                    ['Fehler', batch.error, 'danger'],
                  ] as const).map(([label, value, tone]) => (
                    <div key={label} className={`metric${tone && value > 0 ? ` metric--${tone}` : ''}`}>
                      <span className="metric__label">{label}</span>
                      <span className="metric__value">{value}</span>
                    </div>
                  ))}
                </div>
              </div>
              <DataTable
                rows={items}
                rowKey={(row, ) => `${row.maloId}-${row.code}`}
                caption="Ergebnisse je Marktlokation"
                columns={[
                  { key: 'malo', header: 'MaLo', sortValue: (row) => row.maloId, render: (row) => <span className="mono">{row.maloId}</span> },
                  {
                    key: 'status',
                    header: 'Ergebnis',
                    sortValue: (row) => row.status,
                    render: (row) => {
                      const meta = statusMeta(row.status);
                      return <StatusBadge tone={meta.tone} label={meta.label} title={meta.explain} />;
                    },
                  },
                  { key: 'code', header: 'Code', render: (row) => <span className="mono tiny">{row.code}</span> },
                  { key: 'change', header: 'Änderung', render: (row) => <span className="small">{row.beforeState ?? '—'} → {row.afterState ?? row.beforeState ?? '—'}</span> },
                  { key: 'message', header: 'Erläuterung', render: (row) => <span className="small muted" style={{ whiteSpace: 'normal' }}>{row.message}</span> },
                  {
                    key: 'go',
                    header: '',
                    render: (row) => (
                      <Button variant="ghost" size="sm" onClick={() => onOpenHistory(row.maloId)}>Historie</Button>
                    ),
                  },
                ]}
                empty={<EmptyState title="Keine Positionen" />}
              />
            </Card>
          ) : null}

          {batch ? <RawPayload summary="Technische Stapel-Antwort anzeigen" value={{ ...batch, resultsJson: undefined, results: items }} /> : null}
        </div>

        <Card title="3 · Ausführung" subtitle="Startet die Verarbeitung im CAP-Backend.">
          <div className="stack--md">
            {failure ? <Callout tone="danger" title="Fehler">{failure}</Callout> : null}
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 'var(--s-2)' }}>
              <li className="kv-inline"><span className="kv-inline__k">Gebäude</span><span className="mono">{buildingId}</span></li>
              <li className="kv-inline"><span className="kv-inline__k">Stichtag</span><span className="num">{formatDate(effectiveDate)}</span></li>
              <li className="kv-inline"><span className="kv-inline__k">Kandidaten</span><span className="num">{forecast.total}</span></li>
              <li className="kv-inline"><span className="kv-inline__k">Voraussetzungen</span>{assumed ? <Badge tone="warning">ASSUMED_DEMO</Badge> : <Badge>STRICT</Badge>}</li>
              <li className="kv-inline"><span className="kv-inline__k">Ausführender</span><Badge>DEMO_BATCH</Badge></li>
            </ul>
            {!assumed ? (
              <Callout tone="warning" title="Alle Positionen werden blockiert">
                Im Profil STRICT fehlen belastbare Nachweise für vSZ- und Marktstatus. Aktivieren Sie die
                Demo-Annahmen, um den Ablauf vorzuführen.
              </Callout>
            ) : null}
            {forecast.review > 0 ? (
              <Callout tone="warning" title={`${forecast.review} mehrdeutige MaLo im Umfang`}>
                Konfliktbehaftete Marktlokationen werden vom Backend mit REVIEW beendet und nicht verändert.
              </Callout>
            ) : null}
            <Button
              variant="primary"
              size="lg"
              block
              icon={<Play size={16} />}
              busy={running}
              disabled={running || forecast.total === 0}
              onClick={() => setConfirm(true)}
            >
              Stapel starten
            </Button>
            {running ? (
              <div className="row" style={{ gap: 'var(--s-2)' }}>
                <Layers size={14} className="subtle" aria-hidden />
                <span className="tiny subtle">Positionen werden nacheinander verarbeitet…</span>
              </div>
            ) : null}
          </div>
        </Card>
      </div>

      <ConfirmationDialog
        open={confirm}
        title="Stapellauf starten?"
        confirmLabel="Stapel ausführen"
        busy={running}
        onCancel={() => setConfirm(false)}
        onConfirm={run}
      >
        <p className="small">
          {forecast.total} Marktlokationen in <strong className="mono">{buildingId}</strong> werden zum Stichtag{' '}
          <strong className="num">{formatDate(effectiveDate)}</strong> verarbeitet. Jede Position wird einzeln
          geprüft; Fehler einer Position beenden den Lauf nicht.
        </p>
        <Callout tone="info" title="Simulation">Alle Änderungen erfolgen ausschließlich in SQLite.</Callout>
      </ConfirmationDialog>

      <ConfirmationDialog
        open={resetConfirm}
        title="Demo zurücksetzen?"
        confirmLabel="Zurücksetzen"
        tone="danger"
        busy={resetting}
        onCancel={() => setResetConfirm(false)}
        onConfirm={doReset}
      >
        <p className="small">
          Alle simulierten Statusänderungen, Zeitscheiben, Prozessanfragen und Audit-Einträge werden gelöscht
          und auf den importierten Ausgangsstand zurückgesetzt.
        </p>
        <Callout tone="warning" title="Die Arbeitsmappe bleibt unverändert">
          Nur der Inhalt der SQLite-Datenbank wird zurückgesetzt. <code>Datensatz_Deutsch.xlsx</code> wird nicht angefasst.
        </Callout>
      </ConfirmationDialog>
    </div>
  );
}
