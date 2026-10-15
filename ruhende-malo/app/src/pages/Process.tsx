import { useMemo, useRef, useState } from 'react';
import { type Construct, type Participant, type ProcessResult, type Step, confirmVsz, importWorkbook, processAll, processConstruct } from '../api';
import { type PageProps, Chip } from '../App';
import { confirmDialog } from '../confirm';
import { ROLE, STAGE, fmtDate, fmtTime, opLabel, short, statusTone } from '../lib';

/** Process board columns = the steps every MaLo passes (solution map + PDF §6). */
const COLUMNS: { id: string; label: string; hint: string }[] = [
  { id: 'PRUEFUNG', label: 'Prüfung', hint: 'Prüfung der Daten: Teilnehmerliste, IDs, Teilnahme, Einspeiser' },
  { id: 'VSZ', label: 'vSZ', hint: 'Aufbau vSZ confirmed (PDF steps 1–4.7)' },
  { id: 'PREREQ', label: 'Voraussetzungen', hint: 'iMSys at the MeLo and Abmeldung of the current supplier (generators: MCM)' },
  { id: 'MEMA', label: 'MeMa §6.1', hint: 'MeMa Reststrom-MaLo → Bezugs-MeLo (generators: Einspeise-MeMa §6.3)' },
  { id: 'MAMA', label: 'MaMa §6.2', hint: 'MaMa Bezugs-MaLo → Reststrom-MaLo with Zeitscheibe' },
  { id: 'RUHEND', label: 'Ruhend', hint: 'Business state RUHEND from the Stichtag' },
  { id: 'UEBERGABE', label: 'Übergabe', hint: 'Handover event (Schlussrechnung INVOIC)' },
];
const ICON: Record<string, string> = { OK: '✓', DONE: '✓', TODO: '○', FAIL: '✕', WAIT: '!', SKIP: '·', NA: '–' };
const STATE_TITLE: Record<string, string> = { OK: 'Passed', DONE: 'Done', TODO: 'Planned', FAIL: 'Failed — manual correction needed', WAIT: 'Waiting — manual decision or status needed', SKIP: 'Not reached', NA: 'Not applicable' };
type DetailTab = 'relationships' | 'vsz' | 'requests';
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function ProcessPage({ data, refresh, notify, openMalo, go }: PageProps) {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<ProcessResult>();
  const [runKey, setRunKey] = useState(0);
  const [detail, setDetail] = useState<{ id: string; tab: DetailTab }>();
  const file = useRef<HTMLInputElement>(null);

  // Latest step trace per participant row (construct|MaLo) from the persisted process requests.
  const traces = useMemo(() => {
    const map = new Map<string, Step[]>();
    for (const r of data.requests) {
      if (!['SET_DORMANT', 'MAINTAIN_EINSPEISE_MEMA'].includes(r.operation) || !r.trace) continue;
      const key = `${r.buildingId}|${r.maloId}`;
      if (!map.has(key)) map.set(key, JSON.parse(r.trace) as Step[]);
    }
    return map;
  }, [data.requests]);

  const totals = useMemo(() => {
    const open = data.issues.filter((i) => i.status === 'OPEN' && i.affects !== '[]');
    return {
      dormant: data.constructs.reduce((s, c) => s + c.dormantCount, 0), eligible: data.constructs.reduce((s, c) => s + c.eligibleCount, 0),
      open: open.length, relationships: data.relationships.filter((r) => !r.validToExclusive).length, handover: data.outbox.length,
      processed: traces.size > 0,
    };
  }, [data, traces]);

  const runAll = async () => {
    setRunning(true); setResult(undefined);
    try {
      const [r] = await Promise.all([processAll(), wait(300)]);
      await refresh(); setResult(r); setRunKey((k) => k + 1);
    } catch (e) { notify(e instanceof Error ? e.message : String(e)); }
    setRunning(false);
  };
  const runOne = async (id: string) => {
    try { const r = await processConstruct(id); await refresh(); setRunKey((k) => k + 1); notify(`${id}: ${r.dormantCount}/${r.eligibleCount} ruhend`); }
    catch (e) { notify(e instanceof Error ? e.message : String(e)); }
  };
  const onFile = async (f?: File) => {
    if (!f) return;
    if (!(await confirmDialog(`Import ${f.name}?\n\nThis replaces all constructs and their process state. SAP status is UNKNOWN for uploaded files until it is provided through the API.`))) return;
    try {
      const bytes = new Uint8Array(await f.arrayBuffer());
      let bin = ''; bytes.forEach((b) => { bin += String.fromCharCode(b); });
      const r = await importWorkbook(f.name, btoa(bin));
      notify(`Imported ${r.rows} rows into ${r.constructIds.length} constructs`); setResult(undefined); await refresh();
    } catch (e) { notify(e instanceof Error ? e.message : String(e)); }
    if (file.current) file.current.value = '';
  };

  return (
    <>
      <section className="hero">
        <div>
          <h1>Umstellung auf ruhende MaLo</h1>
          <p>One run processes every participant through all steps. Clean MaLos become ruhend with MeMa and MaMa; a problem stops only that MaLo and goes to Korrektur.</p>
        </div>
        <div className="controls">
          <input ref={file} type="file" accept=".xlsx" hidden onChange={(e) => onFile(e.target.files?.[0])} />
          <button className="secondary" onClick={() => file.current?.click()} disabled={running}>Import workbook</button>
          <button className="primary" onClick={runAll} disabled={running}>
            {running ? <span className="spinner" /> : <span className="play">▶</span>}{running ? 'Running…' : totals.processed ? 'Run again' : 'Run automatic process'}
          </button>
        </div>
        <div className="kpis">
          <div className="kpi green"><b>{totals.dormant}<small>/{totals.eligible}</small></b><span>ruhend</span></div>
          <button className={`kpi ${totals.open ? 'amber' : 'gray'}`} onClick={() => go('korrektur')}><b>{totals.open}</b><span>findings in Korrektur →</span></button>
          <div className="kpi blue"><b>{totals.relationships}</b><span>MeMa / MaMa open</span></div>
          <div className="kpi violet"><b>{totals.handover}</b><span>handover events</span></div>
        </div>
      </section>

      {result && (
        <div className={`banner ${result.review + result.blocked + result.error ? 'warn' : 'ok'}`}>
          <b>Run finished.</b>&nbsp;{result.success} newly ruhend/maintained · {result.alreadyDone} already done · {result.review + result.blocked} waiting for Korrektur
          {result.review + result.blocked > 0 && <button className="link" onClick={() => go('korrektur')}>Open Korrektur →</button>}
        </div>
      )}

      <section className="panel board-panel">
        <table className="board" key={runKey}>
          <thead>
            <tr>
              <th className="who">Participant</th>
              {COLUMNS.map((c) => <th key={c.id} title={c.hint}>{c.label}</th>)}
              <th className="res">Result</th>
            </tr>
          </thead>
          <tbody>
            {data.constructs.map((c) => (
              <ConstructRows key={c.constructId} c={c} data={data} traces={traces} animate={runKey > 0}
                onRun={() => runOne(c.constructId)} onDetail={(tab) => setDetail(detail?.id === c.constructId && detail.tab === tab ? undefined : { id: c.constructId, tab })}
                openMalo={openMalo} go={go} />
            ))}
          </tbody>
        </table>
        <div className="legend">
          {Object.entries(STATE_TITLE).filter(([k]) => k !== 'DONE').map(([k, v]) => <span key={k}><i className={`cell-icon s-${k}`}>{ICON[k]}</i>{v}</span>)}
        </div>
      </section>

      {detail && <ConstructDetail c={data.constructs.find((x) => x.constructId === detail.id)!} tab={detail.tab} setTab={(tab) => setDetail({ id: detail.id, tab })} data={data} refresh={refresh} notify={notify} openMalo={openMalo} />}

      {data.outbox.length > 0 && (
        <section className="panel">
          <h3>Handover to the next processes (solution map)</h3>
          <div className="handover">
            {Object.entries(data.outbox.reduce<Record<string, number>>((acc, e) => ({ ...acc, [e.targetProcess]: (acc[e.targetProcess] ?? 0) + 1 }), {})).map(([target, n]) => (
              <div key={target}><b>{n}×</b> {target} <Chip tone="gray">recorded · NOT_IMPLEMENTED</Chip></div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}

function ConstructRows({ c, data, traces, animate, onRun, onDetail, openMalo, go }: {
  c: Construct; data: PageProps['data']; traces: Map<string, Step[]>; animate: boolean;
  onRun: () => void; onDetail: (tab: DetailTab) => void; openMalo: (id: string) => void; go: PageProps['go'];
}) {
  const stage = STAGE[c.stage] ?? { label: c.stage, tone: 'gray' };
  const rows = data.participants.filter((p) => p.constructId === c.constructId && p.role !== 'Marktlokation Reststrom');
  const vszDone = c.vszConfirmed === c.vszTotal;
  return (
    <>
      <tr className="group">
        <td colSpan={COLUMNS.length + 2}>
          <div className="group-head">
            <div>
              <b>{c.city}</b> <span className="muted">{c.constructId} · Reststrom-MaLo <span className="mono">{c.reststromMaloId}</span> · Stichtag {fmtDate(c.stichtag)}</span>
            </div>
            <div className="group-actions">
              <Chip tone={stage.tone}>{stage.label}</Chip>
              <span className="progress"><span className="bar"><span style={{ width: `${c.eligibleCount ? (c.dormantCount / c.eligibleCount) * 100 : 0}%` }} /></span><b>{c.dormantCount}/{c.eligibleCount}</b></span>
              <button className="link" onClick={() => onDetail('relationships')}>MeMa/MaMa</button>
              <button className={`link ${vszDone ? '' : 'warn-link'}`} onClick={() => onDetail('vsz')}>vSZ {c.vszConfirmed}/{c.vszTotal}</button>
              <button className="link" onClick={() => onDetail('requests')}>Log</button>
              <button className="dark small" onClick={onRun}>Run</button>
            </div>
          </div>
        </td>
      </tr>
      {rows.map((p) => <ParticipantRow key={p.sourceId} p={p} steps={traces.get(`${c.constructId}|${p.maloId}`)} state={data.locations.find((l) => l.maloId === p.maloId)?.businessState} animate={animate} openMalo={openMalo} go={go} />)}
    </>
  );
}

function ParticipantRow({ p, steps, state, animate, openMalo, go }: { p: Participant; steps?: Step[]; state?: string; animate: boolean; openMalo: (id: string) => void; go: PageProps['go'] }) {
  const household = p.role === 'Haushaltsverbrauch';
  const blocked = steps?.find((s) => s.state === 'FAIL' || s.state === 'WAIT');
  const result = p.excluded ? { tone: 'gray', label: 'Excluded' }
    : !p.participates ? { tone: 'gray', label: 'Teilnahme nein' }
      : blocked ? { tone: blocked.state === 'FAIL' ? 'red' : 'amber', label: 'Korrektur' }
        : household && state === 'RUHEND' ? { tone: 'green', label: 'Ruhend' }
          : !household && steps?.find((s) => s.id === 'MEMA')?.state === 'DONE' ? { tone: 'green', label: 'MeMa done' }
            : steps ? { tone: 'blue', label: household ? 'Active' : 'Waiting' } : { tone: 'gray', label: 'Not run' };
  return (
    <tr className={`prow ${p.excluded ? 'excluded' : ''}`}>
      <td className="who" onClick={() => openMalo(p.maloId)} title="Open in MaLo view">
        <span className="mono">{p.maloId}</span>
        <small>{ROLE[p.role] ?? p.role} · MeLo {short(p.meloId, 10)}</small>
      </td>
      {COLUMNS.map((col, i) => {
        if (p.excluded) return <td key={col.id} className="cell"><i className="cell-icon s-NA">–</i></td>;
        const s = steps?.find((x) => x.id === col.id);
        const st = s?.state ?? 'SKIP';
        const clickable = st === 'FAIL' || st === 'WAIT';
        return (
          <td key={col.id} className={`cell ${clickable ? 'clickable' : ''}`} title={`${col.label}: ${STATE_TITLE[st]}${s?.detail ? ` — ${s.detail}` : ''}`} onClick={clickable ? () => go('korrektur') : undefined}>
            <i className={`cell-icon s-${st} ${animate ? 'anim' : ''}`} style={animate ? { animationDelay: `${i * 90}ms` } : undefined}>{ICON[st]}</i>
          </td>
        );
      })}
      <td className="res">
        <Chip tone={result.tone}>{result.label}</Chip>
        {blocked && <small className="why">{blocked.detail.split(': ')[0]}</small>}
      </td>
    </tr>
  );
}

function ConstructDetail({ c, tab, setTab, data, refresh, notify, openMalo }: { c: Construct; tab: DetailTab; setTab: (t: DetailTab) => void } & Pick<PageProps, 'data' | 'refresh' | 'notify' | 'openMalo'>) {
  const [evidence, setEvidence] = useState('');
  const rels = data.relationships.filter((r) => r.buildingId === c.constructId);
  const vsz = data.vsz.filter((v) => v.constructId === c.constructId);
  const requests = data.requests.filter((r) => r.buildingId === c.constructId).slice(0, 40);

  const confirm = async () => {
    try { await confirmVsz(c.constructId, evidence.trim()); notify(`Aufbau vSZ confirmed for ${c.constructId}`); setEvidence(''); await refresh(); }
    catch (e) { notify(e instanceof Error ? e.message : String(e)); }
  };
  const csv = () => {
    const header = 'constructId;kind;context;from;to;validFrom;validTo;provenance';
    const lines = rels.map((r) => [r.buildingId, r.kind, r.context, r.fromLocationId, r.toLocationId, r.validFrom, r.validToExclusive ?? '9999-12-31', r.provenance].join(';'));
    const url = URL.createObjectURL(new Blob([[header, ...lines].join('\n')], { type: 'text/csv' }));
    const a = document.createElement('a'); a.href = url; a.download = `beziehungen_${c.constructId}.csv`; a.click(); URL.revokeObjectURL(url);
  };
  const group = (context: string, title: string, ref: string) => {
    const list = rels.filter((r) => r.context === context);
    return (
      <div className="rel-group">
        <h4>{title} <span className="muted">{ref} · {list.length}</span></h4>
        {list.length === 0 ? <p className="muted">None yet.</p> : (
          <ul className="rels">
            {list.map((r) => (
              <li key={r.ID}>
                <span className="mono">{r.fromLocationId}</span><span className="arrow">→</span><span className="mono" title={r.toLocationId}>{short(r.toLocationId, 12)}</span>
                <span className="muted">{fmtDate(r.validFrom)} – {r.validToExclusive ? fmtDate(r.validToExclusive) : '31.12.9999'}</span>
                {r.validToExclusive && <Chip tone="gray">closed</Chip>}
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  };

  return (
    <section className="panel detail-panel">
      <div className="head">
        <div><span className="eyebrow">{c.constructId}</span><h2>{c.city}</h2></div>
        <div className="seg">
          {(['relationships', 'vsz', 'requests'] as DetailTab[]).map((t) => (
            <button key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>
              {{ relationships: `MeMa / MaMa (${rels.length})`, vsz: `Aufbau vSZ ${c.vszConfirmed}/${c.vszTotal}`, requests: 'Process log' }[t]}
            </button>
          ))}
        </div>
      </div>

      {tab === 'relationships' && (
        <>
          <div className="rel-head"><p className="muted">Maintained by the Umstellung (simulated). Zeitscheibe [from, to); open end = 31.12.9999.</p><button className="secondary small" onClick={csv} disabled={!rels.length}>Download §5 list (CSV)</button></div>
          {group('HOUSEHOLD_MEMA', 'MeMa — Reststrom-MaLo → Bezugs-MeLo', '§6.1')}
          {group('MAMA', 'MaMa — Bezugs-MaLo → Reststrom-MaLo', '§6.2')}
          {group('EINSPEISE_MEMA', 'Einspeise-MeMa — Einspeise-MaLo → Bezugs-MeLo (no MaMa)', '§6.3')}
        </>
      )}

      {tab === 'vsz' && (
        <>
          <p className="muted">Aufbau vSZ (PDF steps 1–4.7) is the upstream prerequisite. Status is read from the simulated SAP state or confirmed by a person with evidence.</p>
          <ul className="vsz">
            {vsz.map((v) => (
              <li key={v.ID}>
                <span className="step">{v.step}</span>
                <div><b>{v.label}</b><small>PDF p. {v.pdfPage}{v.note ? ` · ${v.note}` : ''}{v.confirmedBy ? ` · ${v.confirmedBy}` : ''}</small></div>
                <Chip tone={statusTone(v.status)}>{v.status}</Chip>
              </li>
            ))}
          </ul>
          {c.vszConfirmed < c.vszTotal && (
            <div className="form inline-form">
              <label className="field grow">Evidence (required)<input value={evidence} onChange={(e) => setEvidence(e.target.value)} placeholder="e.g. Checked in SAP by A. Muster on 14.10.2026" /></label>
              <button className="primary" disabled={!evidence.trim()} onClick={confirm}>Confirm open items</button>
            </div>
          )}
        </>
      )}

      {tab === 'requests' && (
        <table className="table">
          <thead><tr><th>Operation</th><th>MaLo</th><th>Status</th><th>Message</th><th>By</th><th>When</th></tr></thead>
          <tbody>
            {requests.map((r) => (
              <tr key={r.ID} onClick={() => openMalo(r.maloId)}>
                <td>{opLabel(r.operation)}</td><td className="mono">{r.maloId}</td><td><Chip tone={statusTone(r.status)}>{r.status}</Chip></td>
                <td className="msg">{r.resultMessage}</td><td>{r.mode === 'AUTO' ? 'pipeline' : r.actor}</td><td className="muted">{r.executionTime ? fmtTime(r.executionTime) : ''}</td>
              </tr>
            ))}
            {requests.length === 0 && <tr><td colSpan={6} className="muted">No requests yet. Run the process.</td></tr>}
          </tbody>
        </table>
      )}
    </section>
  );
}

