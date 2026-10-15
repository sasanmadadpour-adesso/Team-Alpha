import { useEffect, useState } from 'react';
import { MessageStrip, ShellBar, Title } from '@ui5/webcomponents-react';
import { executeBatch, executeLifecycle, getHistory, getLocations, getSourceRows, getSystemStatus, previewTransition, resetDemo, runScenarioTests, setDormant, type BatchResult, type RequestHistory, type ScenarioResult, type SourceRow, type SystemStatus, type TransitionResult } from './api/maloApi';
import './styles/app.css';

export default function App() {
  const [status, setStatus] = useState<SystemStatus>();
  const [error, setError] = useState<string>();
  const [rows, setRows] = useState<SourceRow[]>([]);
  const [maloId,setMaloId]=useState('50539603921'); const [buildingId,setBuildingId]=useState('B-MUL-01'); const [effectiveDate,setEffectiveDate]=useState('2026-10-01'); const [assumed,setAssumed]=useState(false); const [confirmed,setConfirmed]=useState(false); const [result,setResult]=useState<TransitionResult>();
  const [operation,setOperation]=useState<'setDormant'|'reactivate'|'removeFromConstruct'|'correctTransition'|'reverseTransition'>('setDormant'); const [reason,setReason]=useState(''); const [referenceOperationId,setReferenceOperationId]=useState('');
  const [page,setPage]=useState<'explorer'|'workbench'|'automation'|'history'|'tests'>('workbench'); const [history,setHistory]=useState<RequestHistory[]>([]); const [locations,setLocations]=useState<Awaited<ReturnType<typeof getLocations>>>([]); const [batch,setBatch]=useState<BatchResult>(); const [scenario,setScenario]=useState<ScenarioResult>();
  const payload={maloId,buildingId,effectiveDate,prerequisiteProfile:assumed?'ASSUMED_DEMO':'STRICT'};
  const refresh=()=>Promise.all([getSourceRows().then(setRows),getLocations().then(setLocations),getHistory().then(setHistory)]);

  useEffect(() => {
    getSystemStatus().then(setStatus).catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : 'Unknown API error');
    });
    getSourceRows().then(setRows).catch((reason: unknown)=>setError(reason instanceof Error?reason.message:'Unknown API error'));
    getLocations().then(setLocations);getHistory().then(setHistory);
  }, []);

  return (
    <>
      <ShellBar primaryTitle="MK7 Control Center" secondaryTitle="Simulation" />
      <MessageStrip design="Negative" hideCloseButton className="simulation-warning">
        <strong>SIMULATION — NO SAP CONNECTION</strong>
      </MessageStrip>
      <main>
        <nav className="nav">{(['explorer','workbench','automation','history','tests'] as const).map(item=><button key={item} onClick={()=>setPage(item)}>{item==='tests'?'Test Center':item[0].toUpperCase()+item.slice(1)}</button>)}</nav>
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
        {page==='workbench'&&<><Title level="H2">Process Workbench — Lifecycle</Title>
        <section className="status-card workbench">
          <label>Building <select value={buildingId} onChange={e=>{setBuildingId(e.target.value);setResult(undefined);}}><option>B-MUL-01</option><option>B-FRA-01</option><option>B-CGN-01</option></select></label>
          <label>MaLo <select value={maloId} onChange={e=>{setMaloId(e.target.value);setResult(undefined);}}>{rows.filter(r=>r.role==='Haushaltsverbrauch').map(r=><option key={r.sourceId} value={r.maloId}>{r.maloId} — {r.buildingId}{r.maloConflict?' — REVIEW':''}</option>)}</select></label>
          <label>Effective date <input type="date" value={effectiveDate} onChange={e=>{setEffectiveDate(e.target.value);setResult(undefined);}} /></label>
          <label>Operation <select value={operation} onChange={e=>{setOperation(e.target.value as typeof operation);setResult(undefined);}}><option value="setDormant">Ruhendstellung</option><option value="reactivate">Wiederaktivierung</option><option value="removeFromConstruct">Herauslösung</option><option value="correctTransition">Korrektur</option><option value="reverseTransition">Rücknahme</option></select></label>
          {(operation==='correctTransition'||operation==='reverseTransition')&&<label>Reference request ID <input value={referenceOperationId} onChange={e=>setReferenceOperationId(e.target.value)} /></label>}
          {operation!=='setDormant'&&<label>Reason <input value={reason} onChange={e=>setReason(e.target.value)} /></label>}
          <label className="check"><input type="checkbox" checked={assumed} onChange={e=>{setAssumed(e.target.checked);setResult(undefined);}} /> Use explicit ASSUMED_DEMO prerequisites (not SAP-verified)</label>
          {operation==='setDormant'&&<button onClick={()=>previewTransition(payload).then(setResult).catch(e=>setError(String(e)))}>Check</button>}
          <label className="check"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)} /> I explicitly confirm this simulated execution</label>
          <button disabled={!confirmed||(operation==='setDormant'&&!result?.canExecute)} onClick={()=>{const request={...payload,confirmed,reason,referenceOperationId:referenceOperationId||undefined};const run=operation==='setDormant'?setDormant(request):executeLifecycle(operation,request);run.then(value=>{setResult(value);refresh();}).catch(e=>setError(String(e)));}}>Execute</button>
          {result&&<div className="result"><p><strong>{result.status}</strong> — {result.message}</p><p>{result.beforeState} → {result.afterState}; residual-supply MaLo: {result.reststromMaloId}</p><p>SIMULATED: {String(result.simulated)}</p><h3>Validation checklist</h3><ul>{JSON.parse(result.checksJson).map((c:{code:string;confidence:string;message:string})=><li key={c.code}><strong>{c.code}</strong> [{c.confidence}] {c.message}</li>)}</ul><h3>Relationship reconciliation</h3><ul>{JSON.parse(result.reconciliationJson).map((d:{kind:string;status:string;code:string;message:string;blocking:boolean},i:number)=><li key={`${d.code}-${i}`}><strong>{d.kind} {d.status}</strong> [{d.code}] {d.message} {d.blocking?'— BLOCKING':''}</li>)}</ul></div>}
        </section></>}
        {page==='automation'&&<section className="status-card workbench"><Title level="H2">Automation</Title><label>Building <select value={buildingId} onChange={e=>setBuildingId(e.target.value)}><option>B-MUL-01</option><option>B-FRA-01</option><option>B-CGN-01</option></select></label><label>Effective date <input type="date" value={effectiveDate} onChange={e=>setEffectiveDate(e.target.value)} /></label><label className="check"><input type="checkbox" checked={assumed} onChange={e=>setAssumed(e.target.checked)} /> Explicit ASSUMED_DEMO prerequisites</label><label className="check"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)} /> Confirm simulated batch</label><button disabled={!confirmed} onClick={()=>executeBatch({...payload,confirmed}).then(value=>{setBatch(value);refresh();}).catch(e=>setError(String(e)))}>Start batch</button>{batch&&<pre>{JSON.stringify({...batch,resultsJson:JSON.parse(batch.resultsJson)},null,2)}</pre>}<button onClick={()=>window.confirm('Reset all simulated state and history?')&&resetDemo(true).then(message=>{setBatch(undefined);setResult(undefined);refresh();alert(message);})}>Reset Demo</button></section>}
        {page==='history'&&<><Title level="H2">History & Logs</Title><div className="table-wrap"><table><thead><tr><th>Time</th><th>Operation</th><th>MaLo</th><th>Mode</th><th>Status</th><th>Code</th><th>State</th><th>Actor</th><th>Provenance</th></tr></thead><tbody>{history.map(item=><tr key={item.ID}><td>{item.executionTime}</td><td>{item.operation}</td><td>{item.maloId}</td><td>{item.mode}</td><td>{item.status}</td><td title={item.resultMessage}>{item.resultCode}</td><td>{item.beforeState} → {item.afterState}</td><td>{item.actor}</td><td>{item.simulated?'SIMULATED':'—'}</td></tr>)}</tbody></table></div></>}
        {page==='tests'&&<section className="status-card"><Title level="H2">Test Center</Title><p>Runs real read-only domain assertions against current backend data.</p><button onClick={()=>runScenarioTests().then(setScenario).catch(e=>setError(String(e)))}>Run scenarios</button>{scenario&&<><p>{scenario.passed} passed, {scenario.failed} failed at {scenario.executedAt}</p><pre>{JSON.stringify(JSON.parse(scenario.resultsJson),null,2)}</pre></>}</section>}
        {page==='explorer'&&<><Title level="H2">MaLo Explorer ({locations.length})</Title><div className="table-wrap"><table><thead><tr><th>MaLo</th><th>Role</th><th>Participation</th><th>State</th><th>Conflict</th></tr></thead><tbody>{locations.map(row=><tr key={row.maloId}><td>{row.maloId}</td><td>{row.primaryRole}</td><td>{row.participates?'Yes':'No'}</td><td>{row.businessState}</td><td>{row.conflictingAssignment?'REVIEW':'—'}</td></tr>)}</tbody></table></div><Title level="H3">Source assignments ({rows.length})</Title>
        <div className="table-wrap"><table><thead><tr><th>Row</th><th>Building</th><th>Role</th><th>Participation</th><th>MaLo</th><th>MeLo</th><th>Residual-supply MaLo</th><th>Conflict</th></tr></thead><tbody>{rows.map(row=><tr key={row.sourceId}><td>{row.sourceRowNumber}</td><td>{row.buildingId}</td><td>{row.role}</td><td>{row.participationRaw}</td><td>{row.maloId}</td><td>{row.meloId}</td><td>{row.reststromMaloId}</td><td>{row.maloConflict?'REVIEW':'—'}</td></tr>)}</tbody></table></div>
        </>}
      </main>
    </>
  );
}
