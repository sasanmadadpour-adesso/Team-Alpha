import { type ReactNode, useMemo } from 'react';
import {
  AlertTriangle, ArrowRight, CheckCircle2, CircleHelp, Link2, Link2Off, XCircle,
} from 'lucide-react';
import type { PlanCheck, PlanDifference, Relationship, TransitionResult } from '../api/maloApi';
import {
  type Tone, businessStateMeta, checkLabel, checkResultMeta, confidenceMeta,
  formatDate, formatInterval, statusMeta,
} from '../lib/domain';
import { Badge, Callout, DefinitionList, Disclosure, StatusBadge } from './primitives';

/* ------------------------------- Stepper ---------------------------------- */

export interface StepDefinition { id: number; name: string; hint: string }

export function ProcessStepper({ steps, current, furthest, onSelect }: {
  steps: StepDefinition[]; current: number; furthest: number; onSelect: (id: number) => void;
}) {
  return (
    <nav className="stepper" aria-label="Prozessschritte">
      {steps.map((step) => {
        const state = step.id === current ? 'current' : step.id < furthest ? 'done' : 'todo';
        const reachable = step.id <= furthest;
        return (
          <button
            key={step.id}
            type="button"
            className="step"
            data-state={state}
            disabled={!reachable}
            aria-current={step.id === current ? 'step' : undefined}
            onClick={() => onSelect(step.id)}
          >
            <span className="step__marker" aria-hidden>
              {state === 'done' ? <CheckCircle2 size={13} /> : step.id}
            </span>
            <span className="step__label">
              <span className="step__name">{step.name}</span>
              <span className="step__hint">{step.hint}</span>
            </span>
          </button>
        );
      })}
    </nav>
  );
}

/* --------------------------- Validation checklist ------------------------- */

const toneOf = (check: PlanCheck): Tone => {
  if (check.result === 'PASSED') return 'success';
  if (check.result === 'FAILED') return 'danger';
  return 'warning';
};

function CheckRow({ check }: { check: PlanCheck }) {
  const tone = toneOf(check);
  const result = checkResultMeta(check.result);
  const confidence = confidenceMeta(check.confidence);
  const Icon = tone === 'success' ? CheckCircle2 : tone === 'danger' ? XCircle : AlertTriangle;
  return (
    <li className="check-row" data-tone={tone}>
      <Icon size={16} className="check-row__icon" aria-hidden />
      <div className="check-row__body">
        <div className="check-row__title">
          {checkLabel(check.code)}
          <Badge tone={tone}>{result.label}</Badge>
          <Badge tone={confidence.tone} title={confidence.explain}>{confidence.label}</Badge>
        </div>
        <p className="check-row__text">{check.message}</p>
      </div>
    </li>
  );
}

export function ValidationChecklist({ checks }: { checks: PlanCheck[] }) {
  const groups = useMemo(() => ({
    passed: checks.filter((item) => item.result === 'PASSED'),
    notes: checks.filter((item) => item.result === 'ASSUMED' || item.result === 'UNKNOWN'),
    blocking: checks.filter((item) => item.result === 'FAILED'),
  }), [checks]);

  if (checks.length === 0) {
    return <p className="muted small">Es liegen noch keine Prüfergebnisse vor.</p>;
  }

  const section = (title: string, icon: ReactNode, items: PlanCheck[]) => items.length === 0 ? null : (
    <div>
      <h3 className="checklist__group-title">{icon}{title} <span className="subtle">({items.length})</span></h3>
      <ul className="checklist" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {items.map((item) => <CheckRow key={`${item.code}-${item.message}`} check={item} />)}
      </ul>
    </div>
  );

  return (
    <div className="stack--md">
      {section('Blockierende Probleme', <XCircle size={14} className="text-danger" aria-hidden />, groups.blocking)}
      {section('Hinweise und Annahmen', <AlertTriangle size={14} className="text-warning" aria-hidden />, groups.notes)}
      {section('Erfolgreiche Prüfungen', <CheckCircle2 size={14} className="text-success" aria-hidden />, groups.passed)}
    </div>
  );
}

/* ------------------------- Reconciliation differences --------------------- */

const DIFF_LABEL: Record<string, { label: string; tone: Tone }> = {
  MATCH: { label: 'Übereinstimmung', tone: 'success' },
  MISSING: { label: 'Fehlt', tone: 'danger' },
  EXTRA: { label: 'Zusätzlich', tone: 'danger' },
  CONFLICT: { label: 'Konflikt', tone: 'danger' },
};

export function ReconciliationList({ differences }: { differences: PlanDifference[] }) {
  if (differences.length === 0) {
    return <p className="muted small">Für diesen Stichtag wurden keine Beziehungsunterschiede berechnet.</p>;
  }
  const blocking = differences.filter((item) => item.blocking);
  return (
    <div className="stack--sm">
      {blocking.length > 0 ? (
        <Callout tone="danger" title={`${blocking.length} blockierende Abweichung(en)`}>
          Der Vorgang kann erst ausgeführt werden, wenn erwartete und beobachtete Beziehungen übereinstimmen.
        </Callout>
      ) : (
        <Callout tone="success" title="Alle Beziehungen stimmen überein">
          Erwartete und simuliert beobachtete MeMa-/MaMa-Beziehungen passen zum Stichtag zusammen.
        </Callout>
      )}
      <ul className="checklist" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {differences.map((difference, index) => {
          const meta = DIFF_LABEL[difference.status] ?? { label: difference.status, tone: 'neutral' as Tone };
          const record = (difference.expected ?? difference.observed) as
            { fromLocationId?: string; toLocationId?: string; validFrom?: string; validToExclusive?: string } | undefined;
          return (
            <li key={`${difference.code}-${index}`} className="check-row" data-tone={difference.blocking ? 'danger' : 'success'}>
              {difference.blocking
                ? <Link2Off size={16} className="check-row__icon" aria-hidden />
                : <Link2 size={16} className="check-row__icon" aria-hidden />}
              <div className="check-row__body">
                <div className="check-row__title">
                  {difference.kind}
                  <Badge tone={meta.tone}>{meta.label}</Badge>
                  {difference.blocking ? <Badge tone="danger">BLOCKIEREND</Badge> : null}
                </div>
                <p className="check-row__text">{difference.message}</p>
                {record?.fromLocationId ? (
                  <p className="check-row__text mono tiny">
                    {record.fromLocationId} → {record.toLocationId} · {formatInterval(record.validFrom, record.validToExclusive)}
                  </p>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* ------------------------------ Before / after ---------------------------- */

export function BeforeAfter({ before, after, effectiveDate, unchangedNote }: {
  before: string; after: string; effectiveDate: string; unchangedNote?: string;
}) {
  const b = businessStateMeta(before);
  const a = businessStateMeta(after);
  return (
    <div className="stack--sm">
      <div className="diff">
        <div className="diff__panel">
          <div className="diff__label">Aktuell</div>
          <div className="diff__value">{b.label}</div>
        </div>
        <ArrowRight size={18} className="diff__arrow" aria-hidden />
        <div className="diff__panel diff__panel--after">
          <div className="diff__label">Nach Ausführung</div>
          <div className="diff__value">{a.label}</div>
        </div>
      </div>
      <p className="small muted">
        Gültig ab <strong className="num">{formatDate(effectiveDate)}</strong> (halboffene Zeitscheibe).
        {before === after && unchangedNote ? ` ${unchangedNote}` : ''}
      </p>
    </div>
  );
}

/* --------------------------- Operation result card ------------------------ */

export function ResultSummary({ result, actions }: { result: TransitionResult; actions?: ReactNode }) {
  const meta = statusMeta(result.status);
  return (
    <div className="stack--md">
      <Callout tone={meta.tone} title={meta.label}>
        <p>{result.message}</p>
        {meta.explain ? <p className="tiny" style={{ marginTop: 4, opacity: 0.85 }}>{meta.explain}</p> : null}
      </Callout>
      <DefinitionList
        items={[
          { term: 'Marktlokation', value: <span className="mono">{result.maloId}</span> },
          { term: 'Gebäude', value: <span className="mono">{result.buildingId}</span> },
          { term: 'Stichtag', value: <span className="num">{formatDate(result.effectiveDate)}</span> },
          {
            term: 'Statusänderung',
            value: (
              <span className="row" style={{ gap: 'var(--s-2)' }}>
                <StatusBadge {...businessStateMeta(result.beforeState)} tone={businessStateMeta(result.beforeState).tone} />
                <ArrowRight size={12} aria-hidden />
                <StatusBadge {...businessStateMeta(result.afterState)} tone={businessStateMeta(result.afterState).tone} />
              </span>
            ),
          },
          { term: 'Reststrom-MaLo', value: result.reststromMaloId ? <span className="mono">{result.reststromMaloId}</span> : '—' },
          { term: 'Ergebniscode', value: <span className="mono">{result.code}</span> },
          { term: 'Vorgangs-ID', value: result.requestId ? <span className="mono tiny">{result.requestId}</span> : '—' },
          { term: 'Nachweis', value: <Badge tone="warning">SIMULIERT — keine SAP-Verifikation</Badge> },
        ]}
      />
      {actions ? <div className="row">{actions}</div> : null}
    </div>
  );
}

/* --------------------------- Relationship viewer -------------------------- */

export function RelationshipViewer({ relationships, maloId, meloIds }: {
  relationships: Relationship[]; maloId: string; meloIds: string[];
}) {
  const relevant = relationships.filter((item) =>
    item.fromLocationId === maloId || item.toLocationId === maloId || meloIds.includes(item.toLocationId));

  if (relevant.length === 0) {
    return <p className="muted small">Für diese Marktlokation sind keine Beziehungen hinterlegt.</p>;
  }

  const render = (source: Relationship['source'], title: string, note: string) => {
    const items = relevant.filter((item) => item.source === source);
    return (
      <div className="stack--sm">
        <div className="row" style={{ gap: 'var(--s-2)' }}>
          <span className="strong small">{title}</span>
          <Badge tone={source === 'EXPECTED' ? 'info' : 'warning'}>{items.length}</Badge>
        </div>
        <p className="tiny subtle">{note}</p>
        {items.length === 0 ? <p className="muted small">Keine Einträge.</p> : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 'var(--s-2)' }}>
            {items.map((item) => (
              <li key={item.ID} className="callout" style={{ background: 'var(--c-surface-sunken)' }}>
                <Link2 size={14} aria-hidden />
                <div style={{ minWidth: 0 }}>
                  <div className="small"><Badge>{item.kind}</Badge> <span className="mono">{item.fromLocationId}</span> → <span className="mono">{item.toLocationId}</span></div>
                  <div className="tiny subtle">{formatInterval(item.validFrom, item.validToExclusive)}</div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  };

  return (
    <div className="stack--md">
      {render('EXPECTED', 'Erwartet (aus Arbeitsmappe abgeleitet)', 'Aus den importierten Quelldaten berechnet — kein SAP-Nachweis.')}
      {render('MOCK_OBSERVED', 'Simuliert beobachtet (lokale Demo-Fixture)', 'Lokale Fixture, die eine SAP-Beobachtung nachstellt. Keine echten SAP-Daten.')}
    </div>
  );
}

/* --------------------------- Raw payload disclosure ----------------------- */

export function RawPayload({ summary, value }: { summary: string; value: unknown }) {
  return (
    <Disclosure summary={summary}>
      <pre className="pre">{JSON.stringify(value, null, 2)}</pre>
    </Disclosure>
  );
}

export function UnknownHint({ children }: { children: ReactNode }) {
  return (
    <span className="row" style={{ gap: 'var(--s-1)' }}>
      <CircleHelp size={13} className="subtle" aria-hidden />
      <span className="tiny subtle">{children}</span>
    </span>
  );
}
