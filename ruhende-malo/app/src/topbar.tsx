import { useEffect, useMemo, useRef, useState } from 'react';
import { Activity, ChevronDown, FlaskConical, KeyRound, LogOut, RotateCcw, Upload, Webhook } from 'lucide-react';
import type { Snapshot } from './api';
import { useAuth } from './auth';
import { Avatar } from '@/components/app/patterns';
import { relTime, useI18n, type Lang } from './i18n';
import { BrandMark, NAV_EVENT, SimTag, navigate } from './ui';
import { buildFeed, eventSubject } from './pages/Protokoll';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

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
    <div className="grid max-h-[min(560px,calc(100vh-90px))] grid-rows-[auto_minmax(0,1fr)_auto]">
      <header className="flex items-start justify-between gap-3 border-b px-4 pt-3.5 pb-2.5">
        <div><h2 className="text-[15px]">{t('feed.title')}</h2><p className="mt-0.5 max-w-[250px] text-[12.5px] text-muted-foreground">{t('feed.sub')}</p></div>
        <Badge variant="ok"><span className="size-1.5 rounded-full bg-current" />{t('top.live')}</Badge>
      </header>
      <ScrollArea className="min-h-0">
        <ul className="m-0 list-none p-0 py-1.5">
          {items.length === 0 && <li className="p-6 text-center text-muted-foreground">{t('feed.empty')}</li>}
          {items.map((it, i) => (
            <li key={it.id} style={{ animationDelay: `${Math.min(i, 8) * 25}ms` }} className="grid animate-rise grid-cols-[24px_1fr] gap-2.5 px-4 py-1.5 text-[13.5px]">
              <span className="grid size-6 place-items-center rounded-full bg-accent text-primary">{it.kind === 'call' ? <Webhook size={13} /> : <Activity size={13} />}</span>
              {it.kind === 'call' ? (
                <div><span className="font-mono text-[0.86em]">{it.call.method} {it.call.path.replace('/api/v1', '')}</span>
                  <small className="block text-xs text-muted-foreground">{actor(it.call.actor)} · <span className={cn('font-semibold', it.call.status < 300 ? 'text-teal-ink' : 'text-err')}>{it.call.status}</span> · {it.call.durationMs} ms · {relTime(lang, it.at)}</small></div>
              ) : (
                <div><span className="font-mono text-[0.86em]">{eventSubject(it.event, data)}</span> {t(`act.${it.event.operation}`)}
                  <small className="block text-xs text-muted-foreground">{actor(it.event.actor)} · {relTime(lang, it.at)}</small></div>
              )}
            </li>
          ))}
        </ul>
      </ScrollArea>
      <footer className="border-t px-4 py-2.5 text-[13.5px] font-medium"><a href="/activity" onClick={onClose}>{t('feed.all')} →</a></footer>
    </div>
  );
}

interface TopbarProps {
  lang: Lang; setLang: (l: Lang) => void; data?: Snapshot; section: string; openCount: number; bump: boolean;
  onSelfCheck: () => void; onImport: () => void; onReset: () => void;
}
export function Topbar({ lang, setLang, data, section, openCount, bump, onSelfCheck, onImport, onReset }: TopbarProps) {
  const { t } = useI18n();
  const auth = useAuth();
  const [feedOpen, setFeedOpen] = useState(false);
  const newest = useMemo(() => (data ? buildFeed(data)[0]?.at : undefined), [data]);
  const unseen = useUnseen(newest, feedOpen);
  useEffect(() => { const off = () => setFeedOpen(false); window.addEventListener(NAV_EVENT, off); window.addEventListener('popstate', off); return () => { window.removeEventListener(NAV_EVENT, off); window.removeEventListener('popstate', off); }; }, []);

  const link = (href: string, on: boolean, label: string, extra?: React.ReactNode) => (
    <a href={href} className={cn("relative inline-flex h-full items-center gap-2 px-3 font-medium text-muted-foreground transition-colors hover:text-foreground after:absolute after:inset-x-3 after:-bottom-px after:h-0.5 after:origin-left after:scale-x-0 after:rounded-sm after:bg-teal after:transition-transform after:duration-200 max-[820px]:px-2", on && 'text-primary after:scale-x-100')}>{label}{extra}</a>
  );

  return (
    <header className="fixed inset-x-0 top-0 z-40 flex h-14 items-center gap-7 border-b bg-white/85 px-6 backdrop-blur-md backdrop-saturate-150 max-[640px]:gap-2 max-[640px]:px-2.5">
      <a href="/" aria-label="Ruhend" className="group/brand flex min-w-0 items-center gap-2.5 text-foreground no-underline">
        <BrandMark />
        <span className="grid min-w-0 gap-px leading-tight">
          <span className="flex items-center gap-2"><span className="text-[16.5px] font-semibold tracking-tight">Ruhend</span><span className="max-[640px]:hidden"><SimTag /></span></span>
          <span className="text-[12.5px] whitespace-nowrap text-muted-foreground max-[820px]:hidden">{t('app.subtitle')}</span>
        </span>
      </a>
      <nav className="flex h-full gap-1" aria-label={t('nav.main')}>
        {link('/', section === 'overview', t('nav.overview'))}
        {link('/cases', section === 'cases', t('nav.cases'), openCount > 0 && <Badge variant="secondary" className={cn('min-w-5 px-1.5', bump && 'animate-pop')}>{openCount}</Badge>)}
        {link('/api-console', section === 'api', t('nav.api'))}
      </nav>
      <div className="ml-auto flex items-center gap-2.5">
        <div role="group" aria-label={t('lang.label')} className="inline-flex rounded-lg bg-muted p-0.5 max-[640px]:hidden">
          {(['de', 'en'] as const).map((l) => (
            <button key={l} onClick={() => setLang(l)} className={cn('rounded-md px-2.5 py-0.5 text-[12.5px] font-semibold text-muted-foreground transition', lang === l && 'bg-card text-primary shadow-card')}>{l.toUpperCase()}</button>
          ))}
        </div>
        <Popover open={feedOpen} onOpenChange={setFeedOpen}>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" aria-label={t('top.activity')} title={t('top.activity')} className={cn('relative text-muted-foreground', (feedOpen || section === 'log') && 'bg-muted text-foreground')}>
              <Activity />{unseen && <span className="absolute top-1.5 right-1.5 size-2 animate-pop rounded-full border-2 border-card bg-teal" />}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" sideOffset={10} className="w-[392px] overflow-hidden p-0 max-[640px]:w-[calc(100vw-20px)]">
            {data && <ActivityPanel data={data} onClose={() => setFeedOpen(false)} />}
          </PopoverContent>
        </Popover>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button aria-label={t('top.user')} className="group flex h-9.5 items-center gap-2 rounded-full border bg-card py-0 pr-2.5 pl-1 transition hover:bg-accent/50">
              <Avatar name={auth.who.name} />
              <span className="grid text-left leading-tight max-[1100px]:hidden"><b className="text-[13px] font-semibold">{auth.who.name}</b><small className="text-[11.5px] text-muted-foreground">{t(`role.${auth.who.role}`)}</small></span>
              <ChevronDown size={14} className="text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" sideOffset={8} className="w-72">
            <div className="flex items-center gap-2.5 px-2 pt-2 pb-1"><Avatar name={auth.who.name} size="lg" /><div><b className="block leading-tight font-semibold">{auth.who.name}</b><small className="text-[12.5px] text-muted-foreground">{t(`role.${auth.who.role}`)} · Demo</small></div></div>
            <p className="px-2 pb-2 text-[12.5px] leading-snug text-muted-foreground">{t(`role.${auth.who.role}.d`)}</p>
            <DropdownMenuItem onSelect={() => navigate('/api-console/access')}><KeyRound />{t('auth.keys')}</DropdownMenuItem>
            {auth.admin && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-[11.5px] font-medium text-muted-foreground">{t('auth.demo')}</DropdownMenuLabel>
                <DropdownMenuItem onSelect={onSelfCheck}><FlaskConical />{t('menu.selfcheck')}</DropdownMenuItem>
                <DropdownMenuItem onSelect={onImport}><Upload />{t('menu.import')}</DropdownMenuItem>
                <DropdownMenuItem onSelect={onReset}><RotateCcw />{t('menu.reset')}</DropdownMenuItem>
              </>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={auth.signOut}><LogOut />{t('auth.signout')}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
