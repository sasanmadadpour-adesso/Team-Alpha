import { useEffect, useMemo, useRef, useState } from 'react';
import { Activity, ChevronDown, FlaskConical, KeyRound, LogOut, RotateCcw, Upload, Webhook } from 'lucide-react';
import type { Snapshot } from './api';
import { initials, useAuth } from './auth';
import { relTime, useI18n, type Lang } from './i18n';
import { BrandMark, SimTag, navigate } from './ui';
import { buildFeed, eventSubject } from './pages/Protokoll';

/* ---------------- Activity ---------------- */
function useUnseen(newest: string | undefined, open: boolean) {
  const [seen, setSeen] = useState<string>(() => { try { return localStorage.getItem('ruhend.feedSeen') ?? ''; } catch { return ''; } });
  const initial = useRef(true);
  useEffect(() => {
    if (!newest) return;
    if (initial.current && !seen) { initial.current = false; setSeen(newest); return; }   // first visit: nothing is "new"
    initial.current = false;
    if (open && newest !== seen) { setSeen(newest); try { localStorage.setItem('ruhend.feedSeen', newest); } catch { /* storage unavailable */ } }
  }, [newest, open, seen]);
  return !!newest && newest > seen && !open;
}

export function ActivityPanel({ data, onClose }: { data: Snapshot; onClose: () => void }) {
  const { t, lang } = useI18n();
  const items = useMemo(() => buildFeed(data).slice(0, 30), [data]);
  const actor = (a: string) => (t(`actor.${a}`) === `actor.${a}` ? a : t(`actor.${a}`));
  return (
    <aside className="feed-panel" role="dialog" aria-label={t('feed.title')} onClick={(e) => e.stopPropagation()}>
      <header><div><h2>{t('feed.title')}</h2><p className="subtle">{t('feed.sub')}</p></div><span className="chip ok"><span className="dot" />{t('top.live')}</span></header>
      <ul>
        {items.length === 0 && <li className="empty">{t('feed.empty')}</li>}
        {items.map((it, i) => (
          <li key={it.id} style={{ ['--i' as string]: Math.min(i, 8) }}>
            {it.kind === 'call' ? (
              <>
                <span className="fic api"><Webhook size={13} /></span>
                <div>
                  <span className="mono">{it.call.method} {it.call.path.replace('/api/v1', '')}</span>
                  <small>{actor(it.call.actor)} · <span className={`code-${it.call.status < 300 ? 'ok' : 'err'}`}>{it.call.status}</span> · {it.call.durationMs} ms · {relTime(lang, it.at)}</small>
                </div>
              </>
            ) : (
              <>
                <span className="fic"><Activity size={13} /></span>
                <div>
                  <span className="mono">{eventSubject(it.event, data)}</span> {t(`act.${it.event.operation}`)}
                  <small>{actor(it.event.actor)} · {relTime(lang, it.at)}</small>
                </div>
              </>
            )}
          </li>
        ))}
      </ul>
      <footer><a href="#/protokoll" onClick={onClose}>{t('feed.all')} →</a></footer>
    </aside>
  );
}

/* ---------------- Topbar ---------------- */
interface TopbarProps {
  lang: Lang; setLang: (l: Lang) => void; data?: Snapshot; section: string; openCount: number; bump: boolean;
  onSelfCheck: () => void; onImport: () => void; onReset: () => void;
}
export function Topbar({ lang, setLang, data, section, openCount, bump, onSelfCheck, onImport, onReset }: TopbarProps) {
  const { t } = useI18n();
  const auth = useAuth();
  const [panel, setPanel] = useState<'' | 'feed' | 'user'>('');
  const newest = useMemo(() => (data ? buildFeed(data)[0]?.at : undefined), [data]);
  const unseen = useUnseen(newest, panel === 'feed');

  useEffect(() => { const off = () => setPanel(''); window.addEventListener('hashchange', off); return () => window.removeEventListener('hashchange', off); }, []);
  useEffect(() => { if (!panel) return; const close = () => setPanel(''); const esc = (e: KeyboardEvent) => e.key === 'Escape' && close(); window.addEventListener('click', close); window.addEventListener('keydown', esc); return () => { window.removeEventListener('click', close); window.removeEventListener('keydown', esc); }; }, [panel]);
  const toggle = (p: 'feed' | 'user') => (e: React.MouseEvent) => { e.stopPropagation(); setPanel((x) => (x === p ? '' : p)); };

  return (
    <header className="topbar">
      <a className="brand" href="#/" aria-label="Ruhend">
        <BrandMark />
        <span className="brand-text">
          <span className="brand-line"><span className="brand-name">Ruhend</span><SimTag /></span>
          <span className="brand-sub">{t('app.subtitle')}</span>
        </span>
      </a>
      <nav className="nav" aria-label={t('nav.main')}>
        <a href="#/" className={section === 'overview' ? 'on' : ''}>{t('nav.overview')}</a>
        <a href="#/klaerfaelle" className={section === 'cases' ? 'on' : ''}>{t('nav.cases')}{openCount > 0 && <span className={`count ${bump ? 'pop' : ''}`}>{openCount}</span>}</a>
        <a href="#/api" className={section === 'api' ? 'on' : ''}>{t('nav.api')}</a>
      </nav>
      <div className="top-right">
        <div className="lang" role="group" aria-label={t('lang.label')}>
          <button className={lang === 'de' ? 'on' : ''} onClick={() => setLang('de')}>DE</button>
          <button className={lang === 'en' ? 'on' : ''} onClick={() => setLang('en')}>EN</button>
        </div>
        <div className="menu-wrap">
          <button className={`icon-btn ${panel === 'feed' || section === 'log' ? 'on' : ''}`} aria-label={t('top.activity')} title={t('top.activity')} aria-expanded={panel === 'feed'} onClick={toggle('feed')}>
            <Activity size={18} />{unseen && <span className="unseen" />}
          </button>
          {panel === 'feed' && data && <ActivityPanel data={data} onClose={() => setPanel('')} />}
        </div>
        {(
          <div className="menu-wrap" onClick={(e) => e.stopPropagation()}>
            <button className="user-chip" aria-label={t('top.user')} aria-expanded={panel === 'user'} onClick={toggle('user')}>
              <span className="av">{initials(auth.who.name)}</span>
              <span className="user-text"><b>{auth.who.name}</b><small>{t(`role.${auth.who.role}`)}</small></span>
              <ChevronDown size={14} className={`chev ${panel === 'user' ? 'open' : ''}`} />
            </button>
            {panel === 'user' && (
              <div className="menu user-menu" role="menu">
                <div className="menu-head"><span className="av lg">{initials(auth.who.name)}</span><div><b>{auth.who.name}</b><small>{t(`role.${auth.who.role}`)} · Demo</small></div></div>
                <p className="menu-note">{t(`role.${auth.who.role}.d`)}</p>
                <button role="menuitem" onClick={() => { setPanel(''); navigate('/api#keys'); }}><KeyRound size={16} />{t('auth.keys')}</button>
                {auth.admin && (
                  <>
                    <hr />
                    <div className="menu-title">{t('auth.demo')}</div>
                    <button role="menuitem" onClick={() => { setPanel(''); onSelfCheck(); }}><FlaskConical size={16} />{t('menu.selfcheck')}</button>
                    <button role="menuitem" onClick={() => { setPanel(''); onImport(); }}><Upload size={16} />{t('menu.import')}</button>
                    <button role="menuitem" onClick={() => { setPanel(''); onReset(); }}><RotateCcw size={16} />{t('menu.reset')}</button>
                  </>
                )}
                <hr />
                <button role="menuitem" onClick={() => { setPanel(''); auth.signOut(); }}><LogOut size={16} />{t('auth.signout')}</button>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
