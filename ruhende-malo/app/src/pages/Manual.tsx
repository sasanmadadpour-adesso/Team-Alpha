import { confirmDialog } from '../confirm';
import { useEffect, useMemo, useState } from 'react';
import { type Command, type Operation, type OperationResult, type Period, execute, loadPeriods, preview } from '../api';
import { type PageProps, Chip } from '../App';
import { type MaloView, OPERATION, ROLE, STATE_LABEL, fmtDate, fmtTime, maloViews, opLabel, short, statusTone } from '../lib';

type Filter = 'households' | 'all' | 'dormant' | 'findings';
const DEFAULT_DATE: Record<Exclude<Operation, 'SET_DORMANT'>, string> = {
  REACTIVATE: '2026-12-01', REMOVE_FROM_CONSTRUCT: '2026-12-01', CORRECT_TRANSITION: '2026-10-15', REVERSE_TRANSITION: '2026-11-01',
};
const needsReference = (op: Operation) => op === 'CORRECT_TRANSITION' || op === 'REVERSE_TRANSITION';
const needsReason = (op: Operation) => needsReference(op) || op === 'REMOVE_FROM_CONSTRUCT';
const CHECK_ICON: Record<string, string> = { PASSED: '✓', FAILED: '✕' };

export function ManualPage({ data, refresh, notify, focusMalo, go }: PageProps & { focusMalo?: string }) {
  const malos = useMemo(() => maloViews(data), [data]);
  const [selected, setSelected] = useState(focusMalo ?? '50539603921');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('households');
  useEffect(() => { if (focusMalo) setSelected(focusMalo); }, [focusMalo]);

  const list = malos.filter((m) => {
    if (search && !m.maloId.includes(search.trim()) && !m.constructs.some((b) => b.toLowerCase().includes(search.toLowerCase()))) return false;
    if (filter === 'households') return m.role === 'Haushaltsverbrauch';
    if (filter === 'dormant') return m.state === 'RUHEND';
    if (filter === 'findings') return m.openIssues > 0;
    return true;
  });
  const current = malos.find((m) => m.maloId === selected);

  return (
    <div className="split">
      <aside className="panel list">
        <input className="search" placeholder="Search MaLo or construct…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <div className="seg small">
          {(['households', 'all', 'dormant', 'findings'] as Filter[]).map((f) => (
            <button key={f} className={filter === f ? 'on' : ''} onClick={() => setFilter(f)}>{f[0].toUpperCase() + f.slice(1)}</button>
          ))}
        </div>
        <ul>
          {list.map((m) => (
            <li key={m.maloId} className={m.maloId === selected ? 'on' : ''} onClick={() => setSelected(m.maloId)}>
              <div>
                <span className="mono">{m.maloId}</span>
                <small>{m.constructs.join(' + ')} · {ROLE[m.role] ?? m.role}{!m.participates && ' · nein'}</small>
              </div>
              {m.openIssues > 0 ? <Chip tone="amber">Finding</Chip>
                : m.activeConstructs.length === 0 ? <Chip tone="gray">Excluded</Chip>
                  : m.role === 'Haushaltsverbrauch' && m.participates ? <Chip tone={statusTone(m.state)}>{STATE_LABEL[m.state] ?? m.state}</Chip>
                    : <Chip tone="gray">{m.participates ? ROLE[m.role] : 'nein'}</Chip>}
            </li>
          ))}
          {list.length === 0 && <li className="empty">No MaLo matches.</li>}
        </ul>
      </aside>
      {current ? <Detail key={current.maloId} malo={current} data={data} refresh={refresh} notify={notify} go={go} /> : <div className="panel empty">Select a MaLo.</div>}
    </div>
  );
}

function Detail({ malo, data, refresh, notify, go }: { malo: MaloView } & Pick<PageProps, 'data' | 'refresh' | 'notify' | 'go'>) {
  const [operation, setOperation] = useState<Operation>(malo.state === 'RUHEND' ? 'REACTIVATE' : 'SET_DORMANT');
  const [buildingId, setBuildingId] = useState(malo.activeConstructs[0] ?? malo.constructs[0]);
  const [date, setDate] = useState(DEFAULT_DATE.REACTIVATE);
  const [reason, setReason] = useState('');
  const [reference, setReference] = useState('');
  const [result, setResult] = useState<OperationResult>();
  const [busy, setBusy] = useState<'check' | 'exec'>();
  const [periods, setPeriods] = useState<Period[]>([]);

  const construct = data.constructs.find((c) => c.constructId === buildingId);
  const effectiveDate = operation === 'SET_DORMANT' ? construct?.stichtag ?? '' : date;
  const history = data.requests.filter((r) => r.maloId === malo.maloId);
  const references = history.filter((r) => r.status === 'SUCCESS' && (r.operation === 'SET_DORMANT' || r.operation === 'REACTIVATE'));
  const rows = data.participants.filter((p) => p.maloId === malo.maloId);
  const events = data.events.filter((e) => e.maloId === malo.maloId);
  const issues = data.issues.filter((i) => i.status === 'OPEN' && i.objectId === malo.maloId);
  const rels = data.relationships.filter((r) => r.fromLocationId === malo.maloId || rows.some((p) => p.meloId === r.toLocationId));

  useEffect(() => { void loadPeriods(malo.maloId).then(setPeriods).catch(() => setPeriods([])); }, [malo.maloId, data]);
  useEffect(() => { setResult(undefined); }, [operation, buildingId, date, reason, reference]);
  useEffect(() => { if (needsReference(operation) && !reference && references[0]) setReference(references[0].ID); }, [operation, references, reference]);

  const command: Command = {
    operation, maloId: malo.maloId, buildingId, effectiveDate,
    reason: reason.trim() || undefined, referenceOperationId: needsReference(operation) ? reference || undefined : undefined,
  };
  const missing = (needsReason(operation) && !reason.trim()) || (needsReference(operation) && !reference);

  const check = async () => {
    setBusy('check');
    try { setResult(await preview(command)); } catch (e) { notify(e instanceof Error ? e.message : String(e)); }
    setBusy(undefined);
  };
  const run = async () => {
    if (!(await confirmDialog(`${OPERATION[operation].de} for MaLo ${malo.maloId} effective ${fmtDate(effectiveDate)}?\n\nSimulated change in the local database — no SAP update.`))) return;
    setBusy('exec');
    try {
      const r = await execute(command);
      setResult(r);
      notify(r.status === 'SUCCESS' ? `${OPERATION[operation].de} completed (simulated)` : `${r.status}: ${r.message}`);
      await refresh();
    } catch (e) { notify(e instanceof Error ? e.message : String(e)); }
    setBusy(undefined);
  };
  const pick = (op: Operation) => { setOperation(op); if (op !== 'SET_DORMANT') setDate(DEFAULT_DATE[op]); };

  return (
    <section className="detail">
      <div className="panel">
        <div className="head">
          <div><span className="eyebrow">{ROLE[malo.role] ?? malo.role} MaLo</span><h2 className="mono">{malo.maloId}</h2></div>
          <Chip tone={statusTone(malo.state)}>{STATE_LABEL[malo.state] ?? malo.state}</Chip>
        </div>
        {issues.length > 0 && (
          <div className="note warn">Open finding{issues.length > 1 ? 's' : ''}: {issues.map((i) => `${i.ruleId} — ${i.message}`).join(' ')} <button className="link" onClick={() => go('korrektur')}>Go to Korrektur →</button></div>
        )}
        <dl className="facts">
          {rows.map((r) => (
            <div key={r.sourceId} className={`fact-row ${r.excluded ? 'excluded' : ''}`}>
              <div><dt>Construct</dt><dd>{r.constructId}</dd></div>
              <div><dt>MeLo</dt><dd className="mono">{r.meloId}</dd></div>
              <div><dt>Reststrom-MaLo</dt><dd className="mono">{r.reststromMaloId ?? '—'}</dd></div>
              <div><dt>Teilnahme MK7</dt><dd>{r.participationRaw}</dd></div>
              {r.generationFeedInMaloId && <div><dt>Einspeise-MaLo</dt><dd className="mono">{r.generationFeedInMaloId}</dd></div>}
              {r.excluded && <div className="excl"><dt>Excluded</dt><dd>{r.exclusionReason}</dd></div>}
            </div>
          ))}
        </dl>
        {rels.length > 0 && (
          <ul className="rels small-gap">
            {rels.map((r) => (
              <li key={r.ID}>
                <Chip tone={r.kind === 'MEMA' ? 'violet' : 'blue'}>{r.context === 'EINSPEISE_MEMA' ? 'Einspeise-MeMa' : r.kind === 'MEMA' ? 'MeMa' : 'MaMa'}</Chip>
                <span className="mono">{short(r.fromLocationId, 12)} → {short(r.toLocationId, 12)}</span>
                <span className="muted">{fmtDate(r.validFrom)} – {r.validToExclusive ? fmtDate(r.validToExclusive) : '31.12.9999'}</span>
              </li>
            ))}
          </ul>
        )}
        {malo.role !== 'Haushaltsverbrauch' && (
          <div className="note">{malo.role === 'Marktlokation Reststrom'
            ? 'Reststrom-MaLo: anchor of the construct (MeMa §6.1 starts here). Not a dormancy candidate.'
            : 'Generation: Einspeise-MeMa only, no MaMa (PDF §6.3), maintained by the construct process after MCM.'}</div>
        )}
      </div>

      {malo.role === 'Haushaltsverbrauch' && (
        <div className="panel">
          <h3>Manual operation</h3>
          <div className="seg">
            {(Object.keys(OPERATION) as Operation[]).map((op) => (
              <button key={op} className={operation === op ? 'on' : ''} onClick={() => pick(op)}>{OPERATION[op].label}</button>
            ))}
          </div>
          <p className="muted small-gap">{OPERATION[operation].de} — {describe(operation)}</p>
          <div className="form">
            {malo.constructs.length > 1 && (
              <label className="field">Construct
                <select value={buildingId} onChange={(e) => setBuildingId(e.target.value)}>{malo.constructs.map((b) => <option key={b}>{b}</option>)}</select>
              </label>
            )}
            {operation === 'SET_DORMANT'
              ? <label className="field">Stichtag (construct)<input value={fmtDate(effectiveDate)} disabled /></label>
              : <label className="field">Effective date<input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>}
            {needsReference(operation) && (
              <label className="field grow">Reference operation
                <select value={reference} onChange={(e) => setReference(e.target.value)}>
                  {references.length === 0 && <option value="">No successful operation to reference</option>}
                  {references.map((r) => <option key={r.ID} value={r.ID}>{opLabel(r.operation)} · {fmtDate(r.effectiveDate)} · {r.ID.slice(0, 8)}</option>)}
                </select>
              </label>
            )}
            {needsReason(operation) && <label className="field grow">Reason (required)<input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why is this needed?" /></label>}
          </div>
          <div className="buttons">
            <button className="secondary" onClick={check} disabled={!!busy || missing}>{busy === 'check' ? 'Checking…' : 'Check'}</button>
            <button className="primary" onClick={run} disabled={!!busy || !result?.canExecute}>{busy === 'exec' ? 'Executing…' : OPERATION[operation].label}</button>
            {!result && <span className="muted">{missing ? 'Fill in the required fields.' : 'Check first — it never changes data.'}</span>}
          </div>
          {result && <ResultView result={result} />}
        </div>
      )}

      <div className="panel">
        <h3>History</h3>
        <div className="timeline">
          {periods.map((p) => (
            <div key={p.ID} className={`period ${statusTone(p.businessState)}`}>
              <b>{STATE_LABEL[p.businessState] ?? p.businessState}</b>
              <span>{p.validFrom ? fmtDate(p.validFrom) : 'baseline'} → {p.validToExclusive ? fmtDate(p.validToExclusive) : 'open'}</span>
            </div>
          ))}
          {periods.length === 0 && <span className="muted">No lifecycle periods (not a household MaLo).</span>}
        </div>
        <ul className="hist">
          {events.map((e) => (
            <li key={e.ID}>
              <span>{opLabel(e.operation)}</span>
              <span className="muted">{e.effectiveDate ? `effective ${fmtDate(e.effectiveDate)}` : ''}</span>
              <span className="muted">{e.actor} · {fmtTime(e.eventTime)}</span>
              {e.reason && <small>{e.reason}</small>}
            </li>
          ))}
          {history.filter((r) => r.status !== 'SUCCESS').slice(0, 5).map((r) => (
            <li key={r.ID}>
              <span>{opLabel(r.operation)}</span><Chip tone={statusTone(r.status)}>{r.status}</Chip>
              <span className="muted">{r.mode === 'AUTO' ? 'pipeline' : r.actor}{r.executionTime ? ` · ${fmtTime(r.executionTime)}` : ''}</span>
              {r.resultMessage && <small>{r.resultMessage}</small>}
            </li>
          ))}
          {events.length === 0 && history.length === 0 && <li className="muted">No operations yet.</li>}
        </ul>
      </div>
    </section>
  );
}

function ResultView({ result }: { result: OperationResult }) {
  const label = result.status === 'READY' ? 'Ready to execute' : result.status === 'SUCCESS' ? 'Done (simulated)' : result.status;
  const tone = statusTone(result.status);
  return (
    <div className="result">
      <div className={`banner ${tone === 'green' ? 'ok' : tone === 'red' ? 'error' : 'warn'}`}>
        <b>{label}</b> · {result.message}
        {result.beforeState && result.afterState && <span className="transition">{STATE_LABEL[result.beforeState] ?? result.beforeState} → {STATE_LABEL[result.afterState] ?? result.afterState}</span>}
      </div>
      {result.checks.length > 0 && (
        <ul className="checks">
          {result.checks.map((c, i) => (
            <li key={`${c.code}-${i}`} className={statusTone(c.result)}>
              <span className="icon">{CHECK_ICON[c.result] ?? '•'}</span>
              <span><b>{c.code}</b> {c.message}</span>
            </li>
          ))}
        </ul>
      )}
      {result.relationships.length > 0 && (
        <>
          <h4>Relationships</h4>
          <ul className="rels">
            {result.relationships.map((r, i) => (
              <li key={i}>
                <Chip tone={r.kind === 'MEMA' ? 'violet' : 'blue'}>{r.kind === 'MEMA' ? 'MeMa' : 'MaMa'}</Chip>
                <span className="mono">{short(r.fromId ?? '', 12)} → {short(r.toId ?? '', 12)}</span>
                <Chip tone={statusTone(r.status)}>{r.status.replace('_', ' ').toLowerCase()}</Chip>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function describe(op: Operation) {
  switch (op) {
    case 'SET_DORMANT': return 'same engine as the automatic process, for this MaLo only: checks, MeMa (§6.1) + MaMa (§6.2), then RUHEND from the construct Stichtag.';
    case 'REACTIVATE': return 'RUHEND → ACTIVE; the dormant period is closed and kept in history.';
    case 'REMOVE_FROM_CONSTRUCT': return 'closes MeMa/MaMa as of the date and removes the MaLo from the construct.';
    case 'CORRECT_TRANSITION': return 'moves the date of a previous transition; the original stays in the audit log.';
    case 'REVERSE_TRANSITION': return 'compensates a previous transition with a new one; nothing is deleted.';
  }
}
