import { confirmDialog, ConfirmHost } from './confirm';
import { useCallback, useEffect, useState } from 'react';
import { type Snapshot, loadSnapshot, resetDemo, runSelfCheck } from './api';
import { ProcessPage } from './pages/Process';
import { KorrekturPage } from './pages/Korrektur';
import { ManualPage } from './pages/Manual';
import { ApiPage } from './pages/ApiPage';
import './styles.css';

export type Tab = 'process' | 'korrektur' | 'manual' | 'api';
const TABS: { id: Tab; label: string }[] = [
  { id: 'process', label: 'Process' },
  { id: 'korrektur', label: 'Korrektur' },
  { id: 'manual', label: 'MaLo' },
  { id: 'api', label: 'API' },
];

export interface PageProps {
  data: Snapshot;
  refresh: () => Promise<void>;
  notify: (message: string) => void;
  openMalo: (maloId: string) => void;
  go: (tab: Tab) => void;
}

export default function App() {
  const initial = location.hash.slice(1) as Tab;
  const [tab, setTab] = useState<Tab>(TABS.some((t) => t.id === initial) ? initial : 'process');
  const [data, setData] = useState<Snapshot>();
  const [error, setError] = useState<string>();
  const [toast, setToast] = useState<string>();
  const [check, setCheck] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [focusMalo, setFocusMalo] = useState<string>();

  const refresh = useCallback(async () => {
    try { setData(await loadSnapshot()); setError(undefined); } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => { location.hash = tab; }, [tab]);
  useEffect(() => {
    const onHash = () => { const next = location.hash.slice(1) as Tab; if (TABS.some((t) => t.id === next)) setTab(next); };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(undefined), 4000); return () => clearTimeout(t); }, [toast]);

  const reset = async () => {
    if (!(await confirmDialog('Reset the demo?\n\nThe workbook is re-registered and all simulated changes and history are cleared. The workbook file itself is not changed.'))) return;
    setBusy(true);
    try { await resetDemo(); setCheck(undefined); setToast('Demo reset to the workbook baseline'); await refresh(); }
    catch (e) { setToast(e instanceof Error ? e.message : String(e)); }
    setBusy(false);
  };
  const selfCheck = async () => {
    setBusy(true);
    try {
      const r = await runSelfCheck();
      setCheck(`${r.passed}/${r.passed + r.failed}`);
      const failed = (JSON.parse(r.results) as { id: string; title: string; passed: boolean }[]).filter((x) => !x.passed);
      setToast(failed.length ? `Failed: ${failed.map((f) => f.id).join(', ')}` : `All ${r.passed} business scenarios passed`);
    } catch (e) { setCheck(undefined); setToast(e instanceof Error ? e.message : 'Self-check failed'); }
    setBusy(false);
  };
  const openMalo = (maloId: string) => { setFocusMalo(maloId); setTab('manual'); };
  const openIssues = data?.issues.filter((i) => i.status === 'OPEN' && i.affects !== '[]').length ?? 0;
  const props = data && { data, refresh, notify: setToast, openMalo, go: setTab };

  return (
    <div className="page">
      <header className="top">
        <div className="brand"><span className="logo">R</span><div><b>Ruhend</b><small>Umstellung auf ruhende MaLo · MK7</small></div></div>
        <nav className="tabs">
          {TABS.map((t) => (
            <button key={t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>
              {t.label}{t.id === 'korrektur' && openIssues > 0 && <span className="badge">{openIssues}</span>}
            </button>
          ))}
        </nav>
        <div className="right">
          <span className="sim" title="Everything is simulated in a local SQLite database. Nothing is sent to SAP IS-U.">Simulation · no SAP</span>
          <button className="ghost" onClick={selfCheck} disabled={busy}>{check ? `Self-check ${check} ✓` : 'Self-check'}</button>
          <button className="ghost" onClick={reset} disabled={busy}>Reset</button>
        </div>
      </header>

      {error && <div className="banner error">Backend not reachable: {error}</div>}
      {!data && !error && <div className="loading">Loading…</div>}
      {props && tab === 'process' && <ProcessPage {...props} />}
      {props && tab === 'korrektur' && <KorrekturPage {...props} />}
      {props && tab === 'manual' && <ManualPage {...props} focusMalo={focusMalo} />}
      {tab === 'api' && <ApiPage />}

      {toast && <div className="toast">{toast}</div>}
      <ConfirmHost />
    </div>
  );
}

export function Chip({ tone, children, title }: { tone: string; children: React.ReactNode; title?: string }) {
  return <span className={`chip ${tone}`} title={title}>{children}</span>;
}
