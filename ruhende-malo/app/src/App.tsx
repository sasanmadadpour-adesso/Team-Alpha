import { useCallback, useRef, useState } from 'react';
import { AppShell, type PageId } from './components/AppShell';
import { ErrorState, LoadingState } from './components/primitives';
import { type Toast, ToastStack } from './components/overlays';
import { OverviewPage } from './pages/Overview';
import { EMPTY_FILTERS, type ExplorerFilters, ExplorerPage } from './pages/Explorer';
import { type WorkbenchSeed, WorkbenchPage } from './pages/Workbench';
import { AutomationPage } from './pages/Automation';
import { HistoryPage } from './pages/History';
import { TestCenterPage } from './pages/TestCenter';
import { useAppData, useDerived } from './lib/useAppData';
import type { OperationKey, Tone } from './lib/domain';
import './styles/app.css';

export default function App() {
  const { data, loading, error, reload } = useAppData();
  const { metrics, buildings, attention } = useDerived(data);

  const [page, setPage] = useState<PageId>('overview');
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [filters, setFilters] = useState<ExplorerFilters>(EMPTY_FILTERS);
  const [selectedMalo, setSelectedMalo] = useState<string>();
  const [historyFilter, setHistoryFilter] = useState('');
  const [seed, setSeed] = useState<WorkbenchSeed>({});
  const nextToast = useRef(1);

  const toast = useCallback((tone: Tone, title: string, text?: string) => {
    const id = nextToast.current++;
    setToasts((current) => [...current, { id, tone, title, text }]);
    setTimeout(() => setToasts((current) => current.filter((item) => item.id !== id)), 6000);
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((item) => item.id !== id));
  }, []);

  const openMalo = useCallback((maloId: string) => {
    setFilters(maloId ? { ...EMPTY_FILTERS, search: maloId } : { ...EMPTY_FILTERS, conflicts: 'ONLY' });
    setSelectedMalo(maloId || undefined);
    setPage('explorer');
  }, []);

  const openBuilding = useCallback((buildingId: string) => {
    setFilters({ ...EMPTY_FILTERS, building: buildingId });
    setSelectedMalo(undefined);
    setPage('explorer');
  }, []);

  const openHistory = useCallback((maloId?: string) => {
    setHistoryFilter(maloId ?? '');
    setPage('history');
  }, []);

  const startOperation = useCallback((maloId: string, buildingId: string, operation: OperationKey) => {
    setSeed({ maloId, buildingId, operation, nonce: Date.now() });
    setSelectedMalo(undefined);
    setPage('workbench');
  }, []);

  const counts: Partial<Record<PageId, number>> = {
    explorer: data.locations.length,
    history: data.history.length,
  };

  return (
    <AppShell page={page} onNavigate={setPage} counts={counts}>
      {loading ? (
        <LoadingState rows={8} label="Anwendungsdaten werden geladen" />
      ) : error ? (
        <ErrorState
          title="Die CAP-API ist nicht erreichbar"
          text={`${error} — Prüfen Sie, ob das CAP-Backend läuft (npm run dev:cap) und der Vite-Proxy auf Port 4004 zeigt.`}
          onRetry={() => void reload()}
        />
      ) : (
        <>
          {page === 'overview' ? (
            <OverviewPage
              data={data}
              metrics={metrics}
              buildings={buildings}
              attention={attention}
              onOpenBuilding={openBuilding}
              onOpenMalo={openMalo}
              onOpenHistory={() => openHistory()}
              onStartProcess={() => { setSeed({ nonce: Date.now() }); setPage('workbench'); }}
            />
          ) : null}

          {page === 'explorer' ? (
            <ExplorerPage
              data={data}
              filters={filters}
              onFilters={setFilters}
              selectedMalo={selectedMalo}
              onSelectMalo={setSelectedMalo}
              onStartOperation={startOperation}
              onCopied={(value) => toast('info', 'In die Zwischenablage kopiert', value)}
            />
          ) : null}

          {page === 'workbench' ? (
            <WorkbenchPage
              data={data}
              seed={seed}
              onReload={() => reload(true)}
              onOpenHistory={openHistory}
              onOpenMalo={openMalo}
              onToast={toast}
            />
          ) : null}

          {page === 'automation' ? (
            <AutomationPage
              data={data}
              onReload={() => reload(true)}
              onOpenHistory={openHistory}
              onToast={toast}
            />
          ) : null}

          {page === 'history' ? (
            <HistoryPage
              data={data}
              filterMalo={historyFilter}
              onFilterMalo={setHistoryFilter}
              onOpenMalo={openMalo}
            />
          ) : null}

          {page === 'tests' ? <TestCenterPage onToast={toast} /> : null}
        </>
      )}

      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </AppShell>
  );
}
