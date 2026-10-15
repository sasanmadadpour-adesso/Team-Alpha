import { useMemo, useState } from 'react';
import {
  ArrowRight, CheckCircle2, CircleAlert, CircleSlash, FileClock, Scissors, Undo2, XCircle,
} from 'lucide-react';
import { PageHeader } from '../components/AppShell';
import {
  Badge, Button, Callout, Card, CopyValue, DefinitionList, EmptyState, Field,
  SearchInput, Select, StatusBadge,
} from '../components/primitives';
import { Drawer } from '../components/overlays';
import type { AppData } from '../lib/useAppData';
import type { AuditEvent, ProcessRequest } from '../api/maloApi';
import {
  OPERATION_CODE_LABEL, checkLabel, checkResultMeta, confidenceMeta,
  formatDate, formatDateTime, operationCodeLabel, relativeTime, statusMeta,
} from '../lib/domain';

const ICONS: Record<string, typeof CheckCircle2> = {
  SET_DORMANT: CircleSlash,
  REACTIVATE: CheckCircle2,
  REMOVE_FROM_CONSTRUCT: Scissors,
  CORRECT_TRANSITION: FileClock,
  REVERSE_TRANSITION: Undo2,
};

export function HistoryPage({ data, filterMalo, onFilterMalo, onOpenMalo }: {
  data: AppData;
  filterMalo: string;
  onFilterMalo: (value: string) => void;
  onOpenMalo: (maloId: string) => void;
}) {
  const [operation, setOperation] = useState('ALL');
  const [status, setStatus] = useState('ALL');
  const [mode, setMode] = useState('ALL');
  const [selected, setSelected] = useState<ProcessRequest>();

  const auditByRequest = useMemo(() => {
    const map = new Map<string, AuditEvent>();
    for (const event of data.audit) if (event.requestId) map.set(event.requestId, event);
    return map;
  }, [data.audit]);

  const filtered = useMemo(() => {
    const needle = filterMalo.trim().toLowerCase();
    return data.history.filter((item) => {
      if (needle && ![item.maloId, item.buildingId, item.resultCode ?? '', item.ID]
        .some((value) => value.toLowerCase().includes(needle))) return false;
      if (operation !== 'ALL' && item.operation !== operation) return false;
      if (status !== 'ALL' && item.status !== status) return false;
      if (mode !== 'ALL' && item.mode !== mode) return false;
      return true;
    });
  }, [data.history, filterMalo, operation, status, mode]);

  const statuses = useMemo(() => [...new Set(data.history.map((item) => item.status))].sort(), [data.history]);
  const dirty = filterMalo !== '' || operation !== 'ALL' || status !== 'ALL' || mode !== 'ALL';

  return (
    <div className="stack">
      <PageHeader
        title="Historie & Protokoll"
        description="Jeder Vorgang bleibt dauerhaft erhalten — auch übersprungene, blockierte, korrigierte und zurückgenommene. Nichts wird gelöscht oder ausgeblendet."
      />

      <Card flush>
        <div className="filterbar">
          <SearchInput
            label="Historie durchsuchen"
            placeholder="MaLo, Gebäude, Ergebniscode oder Vorgangs-ID…"
            value={filterMalo}
            onChange={onFilterMalo}
          />
          <Field label="Vorgang" htmlFor="h-op">
            <Select id="h-op" value={operation} onChange={(event) => setOperation(event.target.value)}>
              <option value="ALL">Alle Vorgänge</option>
              {Object.entries(OPERATION_CODE_LABEL).map(([code, label]) => (
                <option key={code} value={code}>{label}</option>
              ))}
            </Select>
          </Field>
          <Field label="Ergebnis" htmlFor="h-status">
            <Select id="h-status" value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="ALL">Alle Ergebnisse</option>
              {statuses.map((value) => <option key={value} value={value}>{statusMeta(value).label}</option>)}
            </Select>
          </Field>
          <Field label="Modus" htmlFor="h-mode">
            <Select id="h-mode" value={mode} onChange={(event) => setMode(event.target.value)}>
              <option value="ALL">Alle</option>
              <option value="MANUAL">Manuell</option>
              <option value="BATCH">Automatisch</option>
            </Select>
          </Field>
          {dirty ? (
            <Button variant="ghost" onClick={() => { onFilterMalo(''); setOperation('ALL'); setStatus('ALL'); setMode('ALL'); }}>
              Filter zurücksetzen
            </Button>
          ) : null}
        </div>

        <div className="card__body">
          {filtered.length === 0 ? (
            <EmptyState
              icon={<FileClock size={20} />}
              title={data.history.length === 0 ? 'Noch keine Vorgänge' : 'Keine Treffer'}
              text={data.history.length === 0
                ? 'Sobald Sie in der Workbench oder Automatisierung einen Vorgang ausführen, erscheint er hier.'
                : 'Keine Zeile entspricht den gewählten Filtern.'}
              action={dirty ? <Button variant="secondary" onClick={() => { onFilterMalo(''); setOperation('ALL'); setStatus('ALL'); setMode('ALL'); }}>Filter zurücksetzen</Button> : undefined}
            />
          ) : (
            <ol className="timeline" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {filtered.map((item) => {
                const meta = statusMeta(item.status);
                const Icon = ICONS[item.operation] ?? CircleAlert;
                const reversal = data.history.find((other) =>
                  other.referenceOperationId === item.ID && other.status === 'SUCCESS');
                return (
                  <li key={item.ID} className="tl-item">
                    <div className="tl-item__rail">
                      <span className="tl-item__dot" data-tone={meta.tone}><Icon size={13} aria-hidden /></span>
                    </div>
                    <div className="tl-item__body">
                      <div className="tl-item__head">
                        <span className="tl-item__title">{operationCodeLabel(item.operation)}</span>
                        <StatusBadge tone={meta.tone} label={meta.label} title={meta.explain} />
                        <Badge>{item.mode === 'BATCH' ? 'Automatisch' : 'Manuell'}</Badge>
                        {item.simulated ? <Badge tone="warning">SIMULIERT</Badge> : null}
                        {item.referenceOperationId ? <Badge tone="info">bezieht sich auf {item.referenceOperationId.slice(0, 8)}</Badge> : null}
                        {reversal ? <Badge tone="info">später zurückgenommen</Badge> : null}
                      </div>
                      <div className="tl-item__meta">
                        MaLo <span className="mono">{item.maloId}</span> · {item.buildingId} · Stichtag{' '}
                        <span className="num">{formatDate(item.effectiveDate)}</span> · {item.actor} ·{' '}
                        <time dateTime={item.createdAt} title={formatDateTime(item.createdAt)}>{relativeTime(item.createdAt)}</time>
                      </div>
                      {item.resultMessage ? <p className="small muted" style={{ marginTop: 4 }}>{item.resultMessage}</p> : null}
                      <div className="tl-item__detail row" style={{ gap: 'var(--s-2)' }}>
                        {item.beforeState ? (
                          <span className="row small" style={{ gap: 'var(--s-1)' }}>
                            <Badge>{item.beforeState}</Badge>
                            <ArrowRight size={11} aria-hidden />
                            <Badge tone={item.afterState !== item.beforeState ? 'info' : 'neutral'}>{item.afterState ?? item.beforeState}</Badge>
                          </span>
                        ) : null}
                        <Button variant="ghost" size="sm" onClick={() => setSelected(item)}>Details</Button>
                        <Button variant="ghost" size="sm" onClick={() => onOpenMalo(item.maloId)}>MaLo ansehen</Button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
        {filtered.length > 0 ? (
          <div className="table__meta">{filtered.length} von {data.history.length} Vorgängen</div>
        ) : null}
      </Card>

      <RequestDrawer
        request={selected}
        data={data}
        audit={selected ? auditByRequest.get(selected.ID) : undefined}
        onClose={() => setSelected(undefined)}
        onOpenMalo={onOpenMalo}
      />
    </div>
  );
}

function RequestDrawer({ request, data, audit, onClose, onOpenMalo }: {
  request?: ProcessRequest;
  data: AppData;
  audit?: AuditEvent;
  onClose: () => void;
  onOpenMalo: (maloId: string) => void;
}) {
  if (!request) return null;
  const meta = statusMeta(request.status);

  const parse = (raw?: string) => {
    if (!raw) return undefined;
    try { return JSON.parse(raw) as unknown; } catch { return raw; }
  };

  const reference = request.referenceOperationId
    ? data.history.find((item) => item.ID === request.referenceOperationId)
    : undefined;

  return (
    <Drawer
      open
      onClose={onClose}
      title={operationCodeLabel(request.operation)}
      subtitle={`Vorgang ${request.ID.slice(0, 8)} · ${formatDateTime(request.createdAt)}`}
      footer={
        <>
          <Button variant="secondary" onClick={() => { onOpenMalo(request.maloId); onClose(); }}>MaLo ansehen</Button>
          <Button variant="ghost" onClick={onClose}>Schließen</Button>
        </>
      }
    >
      <Callout tone={meta.tone} title={meta.label}>
        <p>{request.resultMessage ?? 'Kein Ergebnistext hinterlegt.'}</p>
        {meta.explain ? <p className="tiny" style={{ marginTop: 4, opacity: 0.85 }}>{meta.explain}</p> : null}
      </Callout>

      <DefinitionList
        items={[
          { term: 'Marktlokation', value: <CopyValue value={request.maloId} /> },
          { term: 'Gebäude', value: <span className="mono">{request.buildingId}</span> },
          { term: 'Stichtag', value: <span className="num">{formatDate(request.effectiveDate)}</span> },
          { term: 'Ausgeführt am', value: formatDateTime(request.executionTime ?? request.createdAt) },
          { term: 'Modus', value: <Badge>{request.mode === 'BATCH' ? 'Automatisch' : 'Manuell'}</Badge> },
          { term: 'Ausführender', value: <Badge>{request.actor}</Badge> },
          { term: 'Ergebniscode', value: <span className="mono tiny">{request.resultCode ?? '—'}</span> },
          { term: 'Statusänderung', value: <span className="small">{request.beforeState ?? '—'} → {request.afterState ?? request.beforeState ?? '—'}</span> },
          { term: 'Begründung', value: request.reason ? <span className="small">{request.reason}</span> : '—' },
          { term: 'Nachweis', value: <Badge tone="warning">SIMULIERT — keine SAP-Verifikation</Badge> },
          { term: 'Vorgangs-ID', value: <CopyValue value={request.ID} /> },
          ...(request.batchId ? [{ term: 'Stapel-ID', value: <span className="mono tiny">{request.batchId}</span> }] : []),
        ]}
      />

      {reference ? (
        <section>
          <h3 className="card__title" style={{ marginBottom: 'var(--s-3)' }}>Referenzierter Vorgang</h3>
          <Callout tone="info" title={operationCodeLabel(reference.operation)}>
            <p className="small">
              Stichtag {formatDate(reference.effectiveDate)} · Ergebnis {statusMeta(reference.status).label} ·
              ID <span className="mono tiny">{reference.ID.slice(0, 8)}</span>
            </p>
            <p className="tiny" style={{ marginTop: 4 }}>Der ursprüngliche Vorgang bleibt in der Historie bestehen.</p>
          </Callout>
        </section>
      ) : null}

      <RequestChecks requestId={request.ID} data={data} />

      {audit ? (
        <section>
          <h3 className="card__title" style={{ marginBottom: 'var(--s-3)' }}>Audit-Eintrag</h3>
          <DefinitionList
            items={[
              { term: 'Ereigniszeit (UTC)', value: <span className="small mono">{audit.eventTime}</span> },
              { term: 'Grund', value: <span className="small">{audit.reason ?? '—'}</span> },
            ]}
          />
          <div className="grid-2" style={{ marginTop: 'var(--s-3)' }}>
            <div>
              <div className="tiny subtle" style={{ marginBottom: 4 }}>Vorher</div>
              <pre className="pre">{JSON.stringify(parse(audit.beforeValue), null, 2)}</pre>
            </div>
            <div>
              <div className="tiny subtle" style={{ marginBottom: 4 }}>Nachher</div>
              <pre className="pre">{JSON.stringify(parse(audit.afterValue), null, 2)}</pre>
            </div>
          </div>
        </section>
      ) : (
        <Callout tone="neutral" title="Kein Audit-Eintrag">
          Für diesen Vorgang wurde keine Zustandsänderung geschrieben — das ist bei übersprungenen und
          blockierten Vorgängen der korrekte Zustand.
        </Callout>
      )}
    </Drawer>
  );
}

/** Prerequisite checks persisted by the backend for a single request. */
function RequestChecks({ requestId, data }: { requestId: string; data: AppData }) {
  const checks = useMemo(
    () => data.checks.filter((item) => item.requestId === requestId),
    [data.checks, requestId],
  );
  if (checks.length === 0) return null;

  return (
    <section>
      <h3 className="card__title" style={{ marginBottom: 'var(--s-3)' }}>
        Gespeicherte Prüfungen <span className="subtle">({checks.length})</span>
      </h3>
      <ul className="checklist" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {checks.map((check) => {
          const result = checkResultMeta(check.result);
          const confidence = confidenceMeta(check.confidence);
          const tone = check.result === 'PASSED' ? 'success' : check.result === 'FAILED' ? 'danger' : 'warning';
          return (
            <li key={check.ID} className="check-row" data-tone={tone}>
              {tone === 'danger'
                ? <XCircle size={15} className="check-row__icon" aria-hidden />
                : tone === 'success'
                  ? <CheckCircle2 size={15} className="check-row__icon" aria-hidden />
                  : <CircleAlert size={15} className="check-row__icon" aria-hidden />}
              <div className="check-row__body">
                <div className="check-row__title">
                  {checkLabel(check.checkCode)}
                  <Badge tone={tone}>{result.label}</Badge>
                  <Badge tone={confidence.tone} title={confidence.explain}>{confidence.label}</Badge>
                </div>
                {check.notes ? <p className="check-row__text">{check.notes}</p> : null}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
