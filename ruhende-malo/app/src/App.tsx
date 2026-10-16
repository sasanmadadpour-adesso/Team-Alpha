import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type Snapshot, importWorkbook, loadSnapshot, resetDemo, runSelfCheck, whoAmI } from './api';
import { AuthContext, SIGNED_OUT, SignIn, makeAuth, type Who } from './auth';
import { getToken, setToken } from './session';
import { Topbar } from './topbar';
import { I18nContext, translate, type Key, type Lang } from './i18n';
import { AppContext, errorText, navigate, openItems, useRoute, useToasts } from './ui';
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
  const [who, setWho] = useState<Who | null | undefined>(undefined);   // undefined = checking the stored session, null = signed out
  const [expired, setExpired] = useState(false);
  const route = useRoute();
  const toasts = useToasts();
  const file = useRef<HTMLInputElement>(null);

  const t = useCallback((k: Key | string, p?: Record<string, string | number>) => translate(lang, k, p), [lang]);
  const setLang = (l: Lang) => { setLangState(l); document.documentElement.lang = l; try { localStorage.setItem('ruhend.lang', l); } catch { /* storage unavailable */ } };
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);
  useEffect(() => {
    const page = route.startsWith('/klaerfaelle') ? t('nav.cases') : route.startsWith('/api') ? t('nav.api') : route.startsWith('/protokoll') ? t('feed.title') : route.startsWith('/konstrukt') ? decodeURIComponent(route.split('/')[2] ?? '') : t('nav.overview');
    document.title = `${page} · Ruhend — ${t('app.subtitle')} (${t('top.simulation.short')})`;
    document.querySelector('meta[name="description"]')?.setAttribute('content', t('app.description'));
    document.querySelector('meta[property="og:description"]')?.setAttribute('content', t('app.description'));
  }, [route, t]);
  useEffect(() => {
    if (!getToken()) { setWho(null); return; }
    whoAmI().then((me) => { if (me.authenticated && me.name) setWho({ name: me.name, role: me.role }); else { setToken(null); setWho(null); } }).catch(() => setWho(null));
  }, []);
  useEffect(() => { const out = () => { setWho(null); setExpired(true); setData(undefined); }; window.addEventListener(SIGNED_OUT, out); return () => window.removeEventListener(SIGNED_OUT, out); }, []);

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
    if (!who) return;
    const id = setInterval(() => void poll(), 4000);
    const onVisible = () => { if (document.visibilityState === 'visible') void poll(); };
    window.addEventListener('focus', onVisible); document.addEventListener('visibilitychange', onVisible);
    return () => { clearInterval(id); window.removeEventListener('focus', onVisible); document.removeEventListener('visibilitychange', onVisible); };
  }, [poll, who]);
  useEffect(() => { if (who) void refresh(); }, [refresh, who]);

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

  const auth = useMemo(() => (who ? makeAuth(who, setWho, () => undefined) : undefined), [who]);
  if (who === undefined) return <I18nContext.Provider value={i18n}><div className="skeleton" style={{ height: 320, margin: 80 }} /></I18nContext.Provider>;
  if (!who || !auth) return <I18nContext.Provider value={i18n}><SignIn expired={expired} onSignedIn={(w) => { setExpired(false); setWho(w); }} /></I18nContext.Provider>;

  return (
    <I18nContext.Provider value={i18n}>
     <AuthContext.Provider value={auth}>
      <Topbar lang={lang} setLang={setLang} data={data} section={section} openCount={openCount} bump={bump} onSelfCheck={() => void selfCheck()} onImport={() => file.current?.click()} onReset={() => void reset()} />
      <input ref={file} type="file" accept=".xlsx" hidden onChange={(e) => onFile(e.target.files?.[0])} />

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
     </AuthContext.Provider>
    </I18nContext.Provider>
  );
}
