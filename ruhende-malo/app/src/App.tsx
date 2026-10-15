import { useEffect, useState } from 'react';
import { MessageStrip, ShellBar, Title } from '@ui5/webcomponents-react';
import { getSourceRows, getSystemStatus, type SourceRow, type SystemStatus } from './api/maloApi';
import './styles/app.css';

export default function App() {
  const [status, setStatus] = useState<SystemStatus>();
  const [error, setError] = useState<string>();
  const [rows, setRows] = useState<SourceRow[]>([]);

  useEffect(() => {
    getSystemStatus().then(setStatus).catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : 'Unbekannter API-Fehler');
    });
    getSourceRows().then(setRows).catch((reason: unknown)=>setError(reason instanceof Error?reason.message:'Unbekannter API-Fehler'));
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
        <Title level="H2">Imported MK7 participants ({rows.length})</Title>
        <div className="table-wrap"><table><thead><tr><th>Row</th><th>Building</th><th>Role</th><th>Participation</th><th>MaLo</th><th>MeLo</th><th>Residual-supply MaLo</th><th>Conflict</th></tr></thead><tbody>{rows.map(row=><tr key={row.sourceId}><td>{row.sourceRowNumber}</td><td>{row.buildingId}</td><td>{row.role}</td><td>{row.participationRaw}</td><td>{row.maloId}</td><td>{row.meloId}</td><td>{row.reststromMaloId}</td><td>{row.maloConflict?'REVIEW':'—'}</td></tr>)}</tbody></table></div>
      </main>
    </>
  );
}
