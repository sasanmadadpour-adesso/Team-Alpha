import { useEffect, useState } from 'react';
import { MessageStrip, ShellBar, Title } from '@ui5/webcomponents-react';
import { getSystemStatus, type SystemStatus } from './api/maloApi';
import './styles/app.css';

export default function App() {
  const [status, setStatus] = useState<SystemStatus>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    getSystemStatus().then(setStatus).catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : 'Unbekannter API-Fehler');
    });
  }, []);

  return (
    <>
      <ShellBar primaryTitle="MK7 Control Center" secondaryTitle="Simulation" />
      <MessageStrip design="Negative" hideCloseButton className="simulation-warning">
        <strong>SIMULATION — KEINE SAP-VERBINDUNG</strong>
      </MessageStrip>
      <main>
        <Title level="H1">Technischer Systemstatus</Title>
        <section className="status-card" aria-live="polite">
          {error && <p className="error">{error}</p>}
          {!error && !status && <p>CAP API wird geprüft …</p>}
          {status && (
            <>
              <p><strong>CAP API:</strong> erreichbar</p>
              <p><strong>SQLite:</strong> {status.label}</p>
              <p><strong>Betriebsart:</strong> {status.environment}</p>
              <p><strong>SAP verbunden:</strong> {status.sapConnected ? 'Ja' : 'Nein'}</p>
            </>
          )}
        </section>
      </main>
    </>
  );
}
