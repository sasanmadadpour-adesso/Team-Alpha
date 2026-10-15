import { useEffect, useState } from 'react';
import { MessageStrip, ShellBar, Title } from '@ui5/webcomponents-react';
import { getSourceRows, getSystemStatus, previewTransition, setDormant, type SourceRow, type SystemStatus, type TransitionResult } from './api/maloApi';
import './styles/app.css';

export default function App() {
  const [status, setStatus] = useState<SystemStatus>();
  const [error, setError] = useState<string>();
  const [rows, setRows] = useState<SourceRow[]>([]);
  const [maloId,setMaloId]=useState('50539603921'); const [buildingId,setBuildingId]=useState('B-MUL-01'); const [effectiveDate,setEffectiveDate]=useState('2026-10-01'); const [assumed,setAssumed]=useState(false); const [confirmed,setConfirmed]=useState(false); const [result,setResult]=useState<TransitionResult>();
  const payload={maloId,buildingId,effectiveDate,prerequisiteProfile:assumed?'ASSUMED_DEMO':'STRICT'};
  const refresh=()=>getSourceRows().then(setRows);

  useEffect(() => {
    getSystemStatus().then(setStatus).catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : 'Unknown API error');
    });
    getSourceRows().then(setRows).catch((reason: unknown)=>setError(reason instanceof Error?reason.message:'Unknown API error'));
  }, []);

  return (
    <>
      <ShellBar primaryTitle="MK7 Control Center" secondaryTitle="Simulation" />
      <MessageStrip design="Negative" hideCloseButton className="simulation-warning">
        <strong>SIMULATION — NO SAP CONNECTION</strong>
      </MessageStrip>
      <main>
        <Title level="H1">Technical system status</Title>
        <section className="status-card" aria-live="polite">
          {error && <p className="error">{error}</p>}
          {!error && !status && <p>Checking the CAP API…</p>}
          {status && (
            <>
              <p><strong>CAP API:</strong> available</p>
              <p><strong>SQLite:</strong> {status.label}</p>
              <p><strong>Mode:</strong> {status.environment}</p>
              <p><strong>SAP connected:</strong> {status.sapConnected ? 'Yes' : 'No'}</p>
            </>
          )}
        </section>
        <Title level="H2">Process Workbench — Ruhendstellung</Title>
        <section className="status-card workbench">
          <label>Building <select value={buildingId} onChange={e=>{setBuildingId(e.target.value);setResult(undefined);}}><option>B-MUL-01</option><option>B-FRA-01</option><option>B-CGN-01</option></select></label>
          <label>MaLo <select value={maloId} onChange={e=>{setMaloId(e.target.value);setResult(undefined);}}>{rows.filter(r=>r.role==='Haushaltsverbrauch').map(r=><option key={r.sourceId} value={r.maloId}>{r.maloId} — {r.buildingId}{r.maloConflict?' — REVIEW':''}</option>)}</select></label>
          <label>Effective date <input type="date" value={effectiveDate} onChange={e=>{setEffectiveDate(e.target.value);setResult(undefined);}} /></label>
          <label className="check"><input type="checkbox" checked={assumed} onChange={e=>{setAssumed(e.target.checked);setResult(undefined);}} /> Use explicit ASSUMED_DEMO prerequisites (not SAP-verified)</label>
          <button onClick={()=>previewTransition(payload).then(setResult).catch(e=>setError(String(e)))}>Check</button>
          <label className="check"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)} /> I explicitly confirm this simulated execution</label>
          <button disabled={!result?.canExecute||!confirmed} onClick={()=>setDormant({...payload,confirmed}).then(value=>{setResult(value);refresh();}).catch(e=>setError(String(e)))}>Execute</button>
          {result&&<div className="result"><p><strong>{result.status}</strong> — {result.message}</p><p>{result.beforeState} → {result.afterState}; residual-supply MaLo: {result.reststromMaloId}</p><p>SIMULATED: {String(result.simulated)}</p><h3>Validation checklist</h3><ul>{JSON.parse(result.checksJson).map((c:{code:string;confidence:string;message:string})=><li key={c.code}><strong>{c.code}</strong> [{c.confidence}] {c.message}</li>)}</ul><h3>Relationship reconciliation</h3><ul>{JSON.parse(result.reconciliationJson).map((d:{kind:string;status:string;code:string;message:string;blocking:boolean},i:number)=><li key={`${d.code}-${i}`}><strong>{d.kind} {d.status}</strong> [{d.code}] {d.message} {d.blocking?'— BLOCKING':''}</li>)}</ul></div>}
        </section>
        <Title level="H2">Imported MK7 participants ({rows.length})</Title>
        <div className="table-wrap"><table><thead><tr><th>Row</th><th>Building</th><th>Role</th><th>Participation</th><th>MaLo</th><th>MeLo</th><th>Residual-supply MaLo</th><th>Conflict</th></tr></thead><tbody>{rows.map(row=><tr key={row.sourceId}><td>{row.sourceRowNumber}</td><td>{row.buildingId}</td><td>{row.role}</td><td>{row.participationRaw}</td><td>{row.maloId}</td><td>{row.meloId}</td><td>{row.reststromMaloId}</td><td>{row.maloConflict?'REVIEW':'—'}</td></tr>)}</tbody></table></div>
      </main>
    </>
  );
}
