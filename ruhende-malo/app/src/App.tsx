import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlaskConical, MoreHorizontal, RotateCcw, Upload } from 'lucide-react';
import { type Snapshot, importWorkbook, loadSnapshot, resetDemo, runSelfCheck } from './api';
import { I18nContext, translate, type Key, type Lang } from './i18n';
import { AppContext, BrandMark, errorText, navigate, openItems, useRoute, useToasts } from './ui';
import { ConfirmHost, confirmDialog } from './confirm';
import { OverviewPage } from './pages/Overview';
import { ConstructPage } from './pages/Construct';
import { CasesPage } from './pages/Cases';
import { ApiPage } from './pages/ApiPage';
import { ProtokollPage } from './pages/Protokoll';
import { StagesPage } from './pages/Stages';
import { CaseDrawer } from './pages/CaseDrawer';
import './styles.css';

function readLang(): Lang {
  try { return localStorage.getItem('ruhend.lang') === 'en' ? 'en' : 'de'; } catch { return 'de'; }
}

export default function App() {
  const [lang, setLangState] = useState<Lang>(readLang);
  const [data, setData] = useState<Snapshot>();
  const [error, setError] = useState<string>();
  const [caseId, setCaseId] = useState<string>();
  const [menu, setMenu] = useState(false);
  const route = useRoute();
  const toasts = useToasts();
  const file = useRef<HTMLInputElement>(null);

  const t = useCallback((k: Key | string, p?: Record<string, string | number>) => translate(lang, k, p), [lang]);
  const setLang = (l: Lang) => { setLangState(l); document.documentElement.lang = l; try { localStorage.setItem('ruhend.lang', l); } catch { /* storage unavailable */ } };
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);

  // The backend is the single source of truth. The screen follows it: manual refresh, a quiet poll, and a refresh on return.
  const lastSig = useRef('');
  const pausedBy = useRef(0);
  const refresh = useCallback(async () => {
    try {
      const s = await loadSnapshot();
      lastSig.current = JSON.stringify({ ...s, loadedAt: 0 });
      setData(s); setError(undefined); return s;
    }
    catch (e) { setError(errorText((k, p) => translate(readLang(), k, p), e)); return undefined; }
  }, []);
  const poll = useCallback(async () => {
    if (pausedBy.current > 0 || document.visibilityState !== 'visible') return;
    try {
      const s = await loadSnapshot();
      const sig = JSON.stringify({ ...s, loadedAt: 0 });
      if (sig !== lastSig.current) { lastSig.current = sig; setData(s); }   // redraw only when something really changed
      setError(undefined);
    } catch (e) { setError(errorText((k, p) => translate(readLang(), k, p), e)); }
  }, []);
  const pause = useCallback((on: boolean) => { pausedBy.current = Math.max(0, pausedBy.current + (on ? 1 : -1)); }, []);
  useEffect(() => {
    const id = setInterval(() => void poll(), 4000);
    const onVisible = () => { if (document.visibilityState === 'visible') void poll(); };
    window.addEventListener('focus', onVisible); document.addEventListener('visibilitychange', onVisible);
    return () => { clearInterval(id); window.removeEventListener('focus', onVisible); document.removeEventListener('visibilitychange', onVisible); };
  }, [poll]);
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => { if (!menu) return; const close = () => setMenu(false); window.addEventListener('click', close); return () => window.removeEventListener('click', close); }, [menu]);

  const openCount = data ? openItems(data.cases).length : 0;
  const lastCount = useRef(openCount);
  const [bump, setBump] = useState(false);
  useEffect(() => { if (lastCount.current !== openCount) { setBump(true); lastCount.current = openCount; const id = setTimeout(() => setBump(false), 450); return () => clearTimeout(id); } }, [openCount]);

  const ctx = useMemo(() => data && { data, refresh, openCase: setCaseId, toast: toasts.push, go: navigate, pause }, [data, refresh, toasts.push, pause]);
  const i18n = useMemo(() => ({ lang, t, setLang }), [lang, t]);

  const reset = async () => {
    if (!(await confirmDialog(`${t('confirm.reset')}\n\n${t('confirm.reset.d')}`, t))) return;
    try { await resetDemo(); setCaseId(undefined); await refresh(); toasts.push(t('toast.reset')); navigate('/'); } catch (e) { toasts.push(errorText(t, e), 'err'); }
  };
  const selfCheck = async () => {
    try { const r = await runSelfCheck(); toasts.push(t('toast.selfcheck', { p: r.passed, t: r.passed + r.failed }), r.failed ? 'err' : 'ok'); } catch (e) { toasts.push(errorText(t, e), 'err'); }
  };
  const onFile = async (f?: File) => {
    if (!f) return;
    if (await confirmDialog(`${t('confirm.import', { f: f.name })}\n\n${t('confirm.import.d')}`, t)) {
      try {
        const bytes = new Uint8Array(await f.arrayBuffer());
        let bin = ''; bytes.forEach((b) => { bin += String.fromCharCode(b); });
        const r = await importWorkbook(f.name, btoa(bin));
        await refresh(); toasts.push(t('toast.imported', { n: r.rows }));
      } catch (e) { toasts.push(errorText(t, e), 'err'); }
    }
    if (file.current) file.current.value = '';
  };

  const section = route.startsWith('/klaerfaelle') ? 'cases' : route.startsWith('/protokoll') ? 'log' : route.startsWith('/api') ? 'api' : route.startsWith('/ablauf') ? 'stages' : 'overview';
  const logConstruct = new URLSearchParams(route.split('?')[1] ?? '').get('k') ?? undefined;
  const constructId = route.match(/^\/konstrukt\/([^/]+)/)?.[1];

  return (
    <I18nContext.Provider value={i18n}>
      <header className="topbar">
        <a className="brand" href="#/" aria-label="Ruhend">
          <BrandMark />
          <span className="brand-name">Ruhend</span>
          <span className="brand-sub">{t('app.subtitle')}</span>
        </a>
        <nav className="nav" aria-label={t('nav.main')}>
          <a href="#/" className={section === 'overview' ? 'on' : ''}>{t('nav.overview')}</a>
          <a href="#/klaerfaelle" className={section === 'cases' ? 'on' : ''}>{t('nav.cases')}{openCount > 0 && <span className={`count ${bump ? 'pop' : ''}`}>{openCount}</span>}</a>
          <a href="#/protokoll" className={section === 'log' ? 'on' : ''}>{t('nav.log')}</a>
          <a href="#/api" className={section === 'api' ? 'on' : ''}>{t('nav.api')}</a>
        </nav>
        <div className="top-right">
          <span className="sim" title={t('top.simulation')}><i /><span>{t('top.simulation')}</span></span>
          <div className="lang" role="group" aria-label={t('lang.label')}>
            <button className={lang === 'de' ? 'on' : ''} onClick={() => setLang('de')}>DE</button>
            <button className={lang === 'en' ? 'on' : ''} onClick={() => setLang('en')}>EN</button>
          </div>
          <div className="menu-wrap" onClick={(e) => e.stopPropagation()}>
            <button className="icon-btn" aria-label={t('menu.title')} aria-expanded={menu} onClick={() => setMenu((m) => !m)}><MoreHorizontal size={18} /></button>
            {menu && (
              <div className="menu" role="menu">
                <div className="menu-title">{t('menu.title')}</div>
                <button role="menuitem" onClick={() => { setMenu(false); void selfCheck(); }}><FlaskConical size={16} />{t('menu.selfcheck')}</button>
                <button role="menuitem" onClick={() => { setMenu(false); file.current?.click(); }}><Upload size={16} />{t('menu.import')}</button>
                <hr />
                <button role="menuitem" onClick={() => { setMenu(false); void reset(); }}><RotateCcw size={16} />{t('menu.reset')}</button>
              </div>
            )}
          </div>
          <input ref={file} type="file" accept=".xlsx" hidden onChange={(e) => onFile(e.target.files?.[0])} />
        </div>
      </header>

      <main className="page">
        {error && !data && <div className="banner err">{error}</div>}
        {!data && !error && <div className="skeleton" style={{ height: 320 }} />}
        {ctx && (
          <AppContext.Provider value={ctx}>
            {error && <div className="banner err">{error}</div>}
            <div key={route} className="page-enter">
              {section === 'overview' && !constructId && <OverviewPage />}
              {constructId && <ConstructPage constructId={decodeURIComponent(constructId)} />}
              {section === 'cases' && <CasesPage />}
              {section === 'stages' && <StagesPage />}
              {section === 'log' && <ProtokollPage initialConstruct={logConstruct} />}
              {section === 'api' && <ApiPage />}
            </div>
            {caseId && <CaseDrawer caseId={caseId} onClose={() => setCaseId(undefined)} />}
          </AppContext.Provider>
        )}
      </main>
      {toasts.view}
      <ConfirmHost />
    </I18nContext.Provider>
  );
}
