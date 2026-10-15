import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft, ArrowRight, CheckCircle2, ClipboardList, Eye, History, Play, RotateCcw, ShieldCheck,
} from 'lucide-react';
import { PageHeader } from '../components/AppShell';
import {
  Badge, Button, Callout, Card, Checkbox, DefinitionList, EmptyState, Field,
  Input, Select, StatusBadge, Term,
} from '../components/primitives';
import { ConfirmationDialog } from '../components/overlays';
import {
  BeforeAfter, ProcessStepper, RawPayload, ReconciliationList, ResultSummary, ValidationChecklist,
} from '../components/domain';
import {
  type OperationRequest, type TransitionResult, executeOperation, planChecks, planDifferences, previewOperation,
} from '../api/maloApi';
import type { AppData } from '../lib/useAppData';
import {
  GLOSSARY, type OperationKey, OPERATIONS, ROLE_HOUSEHOLD, businessStateMeta,
  formatDate, operationCodeLabel, operationMeta, statusMeta, todayIso,
} from '../lib/domain';

export interface WorkbenchSeed {
  maloId?: string;
  buildingId?: string;
  operation?: OperationKey;
  nonce?: number;
}

const STEPS = [
  { id: 1, name: 'Auswählen', hint: 'MaLo und Vorgang' },
  { id: 2, name: 'Prüfen', hint: 'Voraussetzungen' },
  { id: 3, name: 'Vorschau', hint: 'Vorher / Nachher' },
  { id: 4, name: 'Ausführen', hint: 'Bestätigung' },
  { id: 5, name: 'Ergebnis', hint: 'Nachweis' },
];

export function WorkbenchPage({ data, seed, onReload, onOpenHistory, onOpenMalo, onToast }: {
  data: AppData;
  seed: WorkbenchSeed;
  onReload: () => Promise<void> | void;
  onOpenHistory: (maloId?: string) => void;
  onOpenMalo: (maloId: string) => void;
  onToast: (tone: 'success' | 'danger' | 'info' | 'warning', title: string, text?: string) => void;
}) {
  const [buildingId, setBuildingId] = useState(seed.buildingId ?? '');
  const [maloId, setMaloId] = useState(seed.maloId ?? '');
  const [operation, setOperation] = useState<OperationKey>(seed.operation ?? 'setDormant');
  const [effectiveDate, setEffectiveDate] = useState('2026-10-01');
  const [assumed, setAssumed] = useState(false);
  const [reason, setReason] = useState('');
  const [referenceOperationId, setReferenceOperationId] = useState('');

  const [step, setStep] = useState(1);
  const [furthest, setFurthest] = useState(1);
  const [preview, setPreview] = useState<TransitionResult>();
  const [result, setResult] = useState<TransitionResult>();
  const [checking, setChecking] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [failure, setFailure] = useState<string>();

  const meta = operationMeta(operation);

  /* Default building once data arrives. */
  useEffect(() => {
    if (!buildingId && data.buildings.length > 0) setBuildingId(data.buildings[0].buildingId);
  }, [data.buildings, buildingId]);

  /* Apply a seed coming from Explorer/Overview deep links. */
  useEffect(() => {
    if (!seed.nonce) return;
    if (seed.buildingId) setBuildingId(seed.buildingId);
    if (seed.maloId) setMaloId(seed.maloId);
    if (seed.operation) setOperation(seed.operation);
    setStep(1); setFurthest(1); setPreview(undefined); setResult(undefined); setFailure(undefined);
  }, [seed.nonce, seed.buildingId, seed.maloId, seed.operation]);

  const candidates = useMemo(() => {
    const rows = data.sourceRows.filter((row) => row.buildingId === buildingId && row.role === ROLE_HOUSEHOLD);
    const seen = new Set<string>();
    return rows.filter((row) => (seen.has(row.maloId) ? false : seen.add(row.maloId)));
  }, [data.sourceRows, buildingId]);

  /* Keep the selected MaLo consistent with the chosen building. */
  useEffect(() => {
    if (candidates.length === 0) return;
    if (!candidates.some((row) => row.maloId === maloId)) setMaloId(candidates[0].maloId);
  }, [candidates, maloId]);

  const location = data.locations.find((item) => item.maloId === maloId);
  const sourceRow = candidates.find((row) => row.maloId === maloId);
  const references = useMemo(
    () => data.history.filter((item) => item.maloId === maloId && item.status === 'SUCCESS'),
    [data.history, maloId],
  );

  const reset = () => {
    setPreview(undefined); setResult(undefined); setFailure(undefined); setStep(1); setFurthest(1);
  };

  const request = (): OperationRequest => ({
    maloId, buildingId, effectiveDate,
    prerequisiteProfile: assumed ? 'ASSUMED_DEMO' : 'STRICT',
    reason: reason.trim() || undefined,
    referenceOperationId: referenceOperationId || undefined,
  });

  const missingInput =
    !maloId || !buildingId || !effectiveDate
    || (meta.requiresReference && !referenceOperationId)
    || (meta.requiresReason && !reason.trim());

  const runCheck = async () => {
    setChecking(true); setFailure(undefined); setResult(undefined);
    try {
      const value = await previewOperation(operation, request());
      setPreview(value);
      setStep(2); setFurthest((current) => Math.max(current, value.canExecute ? 3 : 2));
    } catch (error) {
      setFailure(error instanceof Error ? error.message : 'Die Prüfung ist fehlgeschlagen.');
      onToast('danger', 'Prüfung fehlgeschlagen', error instanceof Error ? error.message : undefined);
    } finally {
      setChecking(false);
    }
  };

  const runExecute = async () => {
    setExecuting(true); setFailure(undefined);
    try {
      const value = await executeOperation(operation, { ...request(), confirmed: true });
      setResult(value);
      setConfirmOpen(false);
      setStep(5); setFurthest(5);
      await onReload();
      const status = statusMeta(value.status);
      onToast(value.status === 'SUCCESS' ? 'success' : status.tone === 'danger' ? 'danger' : 'warning',
        `${meta.label}: ${status.label}`, value.message);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Die Ausführung ist fehlgeschlagen.';
      setFailure(message);
      setConfirmOpen(false);
      onToast('danger', 'Ausführung fehlgeschlagen', message);
    } finally {
      setExecuting(false);
    }
  };

  const checks = planChecks(preview);
  const differences = planDifferences(preview);
  const blockers = checks.filter((item) => item.result === 'FAILED');
  const assumptions = checks.filter((item) => item.result === 'ASSUMED' || item.result === 'UNKNOWN');
  const canExecute = preview?.canExecute === true;

  return (
    <div className="stack">
      <PageHeader
        title="Prozess-Workbench"
        description="Ein geführter Ablauf vom Auswählen bis zum Nachweis. Geprüft und ausgeführt wird ausschließlich im CAP-Backend."
        actions={
          <>
            <Button variant="ghost" icon={<RotateCcw size={14} />} onClick={reset}>Zurücksetzen</Button>
            <Button variant="secondary" icon={<History size={14} />} onClick={() => onOpenHistory(maloId)}>Historie</Button>
          </>
        }
      />

      <Card flush>
        <ProcessStepper steps={STEPS} current={step} furthest={furthest} onSelect={setStep} />

        <div className="card__body">
          {failure ? <Callout tone="danger" title="Backend-Fehler">{failure}</Callout> : null}

          {step === 1 ? (
            <SelectStep
              data={data}
              buildingId={buildingId} setBuildingId={(value) => { setBuildingId(value); reset(); }}
              maloId={maloId} setMaloId={(value) => { setMaloId(value); reset(); }}
              operation={operation} setOperation={(value) => { setOperation(value); reset(); }}
              effectiveDate={effectiveDate} setEffectiveDate={(value) => { setEffectiveDate(value); reset(); }}
              reason={reason} setReason={setReason}
              referenceOperationId={referenceOperationId} setReferenceOperationId={setReferenceOperationId}
              assumed={assumed} setAssumed={(value) => { setAssumed(value); setPreview(undefined); }}
              candidates={candidates}
              references={references}
              location={location}
              sourceRow={sourceRow}
            />
          ) : null}

          {step === 2 ? (
            preview ? (
              <div className="stack--md">
                <Callout tone={statusMeta(preview.status).tone} title={`Prüfergebnis: ${statusMeta(preview.status).label}`}>
                  <p>{preview.message}</p>
                </Callout>
                {blockers.length > 0 ? (
                  <Callout tone="danger" title={`${blockers.length} blockierende Prüfung(en)`}>
                    Die Ausführung bleibt gesperrt, solange diese Punkte bestehen. Es wurde nichts geändert.
                  </Callout>
                ) : null}
                <ValidationChecklist checks={checks} />
                {differences.length > 0 ? (
                  <section>
                    <h3 className="card__title" style={{ marginBottom: 'var(--s-3)' }}>
                      <Term term="MeMa" definition={GLOSSARY.MeMa} />-/<Term term="MaMa" definition={GLOSSARY.MaMa} />-Abgleich
                    </h3>
                    <ReconciliationList differences={differences} />
                  </section>
                ) : null}
              </div>
            ) : <EmptyState icon={<ClipboardList size={20} />} title="Noch nicht geprüft" text="Gehen Sie zurück zu Schritt 1 und starten Sie die Prüfung." />
          ) : null}

          {step === 3 ? (
            preview ? (
              <div className="stack--md">
                <BeforeAfter
                  before={preview.beforeState || location?.businessState || '—'}
                  after={preview.afterState}
                  effectiveDate={preview.effectiveDate || effectiveDate}
                  unchangedNote="Dieser Vorgang ändert den Geschäftsstatus nicht, sondern nur die Beziehungen."
                />
                <Callout tone="info" title="Diese Vorschau ist schreibgeschützt">
                  Es wurde nichts in der Datenbank verändert. Erst Schritt 4 löst eine Änderung aus.
                </Callout>
                <DefinitionList
                  items={[
                    { term: 'Vorgang', value: meta.label },
                    { term: 'Absicht', value: <span className="small">{meta.intent}</span> },
                    { term: 'Marktlokation', value: <span className="mono">{preview.maloId || maloId}</span> },
                    { term: 'Gebäude', value: <span className="mono">{preview.buildingId || buildingId}</span> },
                    { term: 'Reststrom-MaLo', value: preview.reststromMaloId ? <span className="mono">{preview.reststromMaloId}</span> : '—' },
                    { term: 'Stichtag', value: <span className="num">{formatDate(preview.effectiveDate || effectiveDate)}</span> },
                    { term: 'Neue Zeitscheibe', value: <span className="num small">ab {formatDate(preview.effectiveDate || effectiveDate)} (offen)</span> },
                    { term: 'Voraussetzungen', value: assumptions.length > 0 ? <Badge tone="warning">{assumptions.length} Annahme(n) / unbekannt</Badge> : <Badge tone="success">alle simuliert geprüft</Badge> },
                    { term: 'Erwarteter Audit-Eintrag', value: <span className="small">{operationCodeLabel(meta.key === 'setDormant' ? 'SET_DORMANT' : meta.key)} durch DEMO_USER, Nachweis <strong>SIMULIERT</strong></span> },
                  ]}
                />
                {assumptions.length > 0 ? (
                  <Callout tone="warning" title="Diese Ausführung stützt sich auf Demo-Annahmen">
                    <ul style={{ margin: '4px 0 0', paddingLeft: '1.1rem' }}>
                      {assumptions.map((item) => <li key={item.code} className="tiny">{item.message}</li>)}
                    </ul>
                  </Callout>
                ) : null}
              </div>
            ) : <EmptyState title="Keine Vorschau vorhanden" text="Führen Sie zuerst die Prüfung in Schritt 2 aus." />
          ) : null}

          {step === 4 ? (
            <div className="stack--md">
              {canExecute ? (
                <>
                  <Callout tone="warning" title="Diese Aktion verändert den simulierten Zustand">
                    Nach der Bestätigung schreibt das CAP-Backend die Änderung in SQLite und legt einen
                    unveränderlichen Audit-Eintrag an. Eine SAP-Verbindung besteht nicht.
                  </Callout>
                  <DefinitionList
                    items={[
                      { term: 'Vorgang', value: <strong>{meta.label}</strong> },
                      { term: 'Marktlokation', value: <span className="mono">{maloId}</span> },
                      { term: 'Stichtag', value: <span className="num">{formatDate(effectiveDate)}</span> },
                      { term: 'Ausführender', value: <Badge>DEMO_USER</Badge> },
                    ]}
                  />
                  <Button
                    variant="primary"
                    size="lg"
                    icon={<Play size={16} />}
                    busy={executing}
                    disabled={executing}
                    onClick={() => setConfirmOpen(true)}
                  >
                    {meta.verb}
                  </Button>
                </>
              ) : (
                <Callout tone="danger" title="Ausführung ist gesperrt">
                  Die Prüfung hat den Vorgang nicht freigegeben ({preview ? statusMeta(preview.status).label : 'noch nicht geprüft'}).
                  Lösen Sie die blockierenden Punkte in Schritt 2 oder wählen Sie eine andere Marktlokation.
                </Callout>
              )}
            </div>
          ) : null}

          {step === 5 ? (
            result ? (
              <ResultSummary
                result={result}
                actions={
                  <>
                    <Button variant="secondary" icon={<History size={14} />} onClick={() => onOpenHistory(result.maloId)}>Historie öffnen</Button>
                    <Button variant="secondary" icon={<Eye size={14} />} onClick={() => onOpenMalo(result.maloId)}>MaLo ansehen</Button>
                    <Button variant="primary" icon={<Play size={14} />} onClick={reset}>Weiteren Vorgang starten</Button>
                  </>
                }
              />
            ) : <EmptyState title="Noch kein Ergebnis" text="Das Ergebnis erscheint, sobald das Backend den Vorgang bestätigt hat." />
          ) : null}
        </div>

        <footer className="card__footer">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <Button
              variant="ghost"
              icon={<ArrowLeft size={14} />}
              disabled={step === 1}
              onClick={() => setStep((current) => Math.max(1, current - 1))}
            >
              Zurück
            </Button>
            <div className="row" style={{ gap: 'var(--s-2)' }}>
              {step === 1 ? (
                <Button
                  variant="primary"
                  icon={<ShieldCheck size={15} />}
                  busy={checking}
                  disabled={missingInput || checking}
                  onClick={runCheck}
                >
                  Voraussetzungen prüfen
                </Button>
              ) : null}
              {step === 2 ? (
                <>
                  <Button variant="secondary" busy={checking} onClick={runCheck}>Erneut prüfen</Button>
                  <Button
                    variant="primary"
                    icon={<ArrowRight size={14} />}
                    disabled={!preview}
                    onClick={() => { setStep(3); setFurthest((current) => Math.max(current, 3)); }}
                  >
                    Zur Vorschau
                  </Button>
                </>
              ) : null}
              {step === 3 ? (
                <Button
                  variant="primary"
                  icon={<ArrowRight size={14} />}
                  disabled={!canExecute}
                  title={!canExecute ? 'Die Prüfung hat den Vorgang nicht freigegeben.' : undefined}
                  onClick={() => { setStep(4); setFurthest((current) => Math.max(current, 4)); }}
                >
                  Weiter zur Ausführung
                </Button>
              ) : null}
            </div>
          </div>
        </footer>
      </Card>

      {preview ? (
        <RawPayload summary="Technische Backend-Antwort anzeigen" value={{
          ...preview, checksJson: undefined, reconciliationJson: undefined, checks, reconciliation: differences,
        }} />
      ) : null}

      <ConfirmationDialog
        open={confirmOpen}
        title={`${meta.label} ausführen?`}
        confirmLabel={meta.verb}
        tone="info"
        busy={executing}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={runExecute}
      >
        <p className="small">
          Für <strong className="mono">{maloId}</strong> wird zum Stichtag{' '}
          <strong className="num">{formatDate(effectiveDate)}</strong> eine simulierte Änderung
          geschrieben und anschließend zurückgelesen.
        </p>
        {assumed ? (
          <Callout tone="warning" title="ASSUMED_DEMO aktiv">
            vSZ-Bereitschaft, Stammdaten und Lieferanten-/Marktstatus gelten als angenommen. Das ist
            <strong> keine</strong> SAP-Verifikation.
          </Callout>
        ) : null}
        <Callout tone="info" title="Simulation">
          Es erfolgt keine Änderung in einem SAP-System. Das Ergebnis wird ausschließlich in SQLite gespeichert.
        </Callout>
      </ConfirmationDialog>
    </div>
  );
}

/* -------------------------------- Step 1 ---------------------------------- */

function SelectStep({
  data, buildingId, setBuildingId, maloId, setMaloId, operation, setOperation,
  effectiveDate, setEffectiveDate, reason, setReason, referenceOperationId, setReferenceOperationId,
  assumed, setAssumed, candidates, references, location, sourceRow,
}: {
  data: AppData;
  buildingId: string; setBuildingId: (value: string) => void;
  maloId: string; setMaloId: (value: string) => void;
  operation: OperationKey; setOperation: (value: OperationKey) => void;
  effectiveDate: string; setEffectiveDate: (value: string) => void;
  reason: string; setReason: (value: string) => void;
  referenceOperationId: string; setReferenceOperationId: (value: string) => void;
  assumed: boolean; setAssumed: (value: boolean) => void;
  candidates: AppData['sourceRows'];
  references: AppData['history'];
  location?: AppData['locations'][number];
  sourceRow?: AppData['sourceRows'][number];
}) {
  const meta = operationMeta(operation);
  const state = businessStateMeta(location?.businessState);
  const mismatch = meta.fromState && location && location.businessState !== meta.fromState;

  return (
    <div className="split">
      <div className="stack--md">
        <div className="grid-2">
          <Field label="Gebäude" htmlFor="w-building" hint="Jedes Gebäude hat genau eine Reststrom-MaLo.">
            <Select id="w-building" value={buildingId} onChange={(event) => setBuildingId(event.target.value)}>
              {data.buildings.map((building) => (
                <option key={building.buildingId} value={building.buildingId}>
                  {building.buildingId} — {building.city}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Marktlokation" htmlFor="w-malo" hint={`${candidates.length} Haushalts-MaLos in diesem Gebäude.`}>
            <Select id="w-malo" value={maloId} onChange={(event) => setMaloId(event.target.value)}>
              {candidates.length === 0 ? <option value="">Keine Haushalts-MaLo vorhanden</option> : null}
              {candidates.map((row) => (
                <option key={row.sourceId} value={row.maloId}>
                  {row.maloId}
                  {row.participates ? '' : ' — Teilnahme: nein'}
                  {row.maloConflict ? ' — Konflikt' : ''}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field label="Vorgang" htmlFor="w-operation" hint={meta.intent}>
          <Select id="w-operation" value={operation} onChange={(event) => setOperation(event.target.value as OperationKey)}>
            {OPERATIONS.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
          </Select>
        </Field>

        <div className="grid-2">
          <Field label="Stichtag" htmlFor="w-date" hint="Datum, ab dem die Änderung fachlich gilt.">
            <Input id="w-date" type="date" value={effectiveDate} max="2099-12-31" onChange={(event) => setEffectiveDate(event.target.value)} />
          </Field>
          {meta.requiresReference ? (
            <Field
              label="Referenzvorgang"
              htmlFor="w-ref"
              hint={references.length === 0 ? 'Für diese MaLo existiert kein erfolgreicher Vorgang.' : 'Pflichtangabe für Korrektur und Rücknahme.'}
            >
              <Select id="w-ref" value={referenceOperationId} onChange={(event) => setReferenceOperationId(event.target.value)}>
                <option value="">Bitte auswählen…</option>
                {references.map((item) => (
                  <option key={item.ID} value={item.ID}>
                    {operationCodeLabel(item.operation)} · {formatDate(item.effectiveDate)} · {item.ID.slice(0, 8)}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}
        </div>

        {meta.requiresReason ? (
          <Field label="Begründung" htmlFor="w-reason" hint="Pflichtangabe. Wird unveränderlich im Audit-Protokoll gespeichert.">
            <Input
              id="w-reason"
              value={reason}
              placeholder="z. B. Stichtag laut Netzbetreiber korrigiert"
              onChange={(event) => setReason(event.target.value)}
            />
          </Field>
        ) : null}

        {meta.usesPrerequisiteProfile ? (
          <Checkbox
            checked={assumed}
            tone="warning"
            onChange={setAssumed}
            title="Demo-Annahmen für nicht verifizierbare Voraussetzungen verwenden (ASSUMED_DEMO)"
            note="vSZ-Bereitschaft, Stammdaten sowie Lieferanten-/Marktstatus liegen nicht als SAP-Nachweis vor. Ohne diese Auswahl blockiert das Backend den Vorgang mit UNBEKANNT."
          />
        ) : null}
      </div>

      <Card title="Aktueller Zustand" subtitle="Direkt aus der CAP-Datenbank gelesen.">
        {!location ? (
          <p className="muted small">Wählen Sie eine Marktlokation aus.</p>
        ) : (
          <div className="stack--sm">
            <DefinitionList
              items={[
                { term: 'MaLo', value: <span className="mono">{location.maloId}</span> },
                { term: 'Status', value: <StatusBadge tone={state.tone} label={state.label} /> },
                { term: 'Teilnahme MK7', value: location.participates ? <StatusBadge tone="success" label="Ja" /> : <Badge>Nein</Badge> },
                { term: 'Rolle', value: <span className="small">{location.primaryRole}</span> },
                { term: 'Gebäude', value: <span className="mono">{buildingId}</span> },
                {
                  term: <Term term="Reststrom-MaLo" definition={GLOSSARY['Reststrom-MaLo']} />,
                  value: <span className="mono">{sourceRow?.reststromMaloId ?? '—'}</span>,
                },
                { term: 'MeLo', value: <span className="mono tiny" style={{ overflowWrap: 'anywhere' }}>{sourceRow?.meloId ?? '—'}</span> },
                { term: 'Quellzuordnungen', value: <span className="num">{location.assignmentCount}</span> },
              ]}
            />
            {location.conflictingAssignment ? (
              <Callout tone="warning" title="Mehrdeutige Identität">
                Diese MaLo erscheint in mehreren Gebäuden. Das Backend liefert <strong>REVIEW</strong> und führt nichts aus.
              </Callout>
            ) : null}
            {!location.participates ? (
              <Callout tone="neutral" title="Keine MK7-Teilnahme">
                Laut Arbeitsmappe nimmt diese MaLo nicht teil. Die Ruhendstellung wird <strong>übersprungen</strong>.
              </Callout>
            ) : null}
            {mismatch ? (
              <Callout tone="warning" title={`Status passt nicht zum Vorgang`}>
                {meta.label} setzt den Status <strong>{meta.fromState}</strong> voraus, aktuell ist{' '}
                <strong>{location.businessState}</strong> hinterlegt.
              </Callout>
            ) : null}
            <Callout tone="info" title="Was dieser Vorgang bewirkt">
              {meta.intent}
            </Callout>
            <div className="row" style={{ gap: 'var(--s-2)' }}>
              <CheckCircle2 size={13} className="subtle" aria-hidden />
              <span className="tiny subtle">Die Prüfung in Schritt 2 verändert nichts.</span>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
