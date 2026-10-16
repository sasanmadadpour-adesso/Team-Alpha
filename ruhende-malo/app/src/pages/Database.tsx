import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Globe, KeyRound, Lock, Monitor, Pause, Play, RefreshCw } from 'lucide-react';
import { Banner, EmptyState, PageHeader, StatCard } from '@/components/app/patterns';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { loadDbCatalog, openDbStream, type DbCatalog, type DbClient, type DbEvent } from '../api';
import { translate, useI18n } from '../i18n';
import { errorText } from '../ui';
import { DbFlow } from './DbFlow';
import { DbTables } from './DbTables';

type Conn = 'connecting' | 'live' | 'offline';
const EVENT = 'db-event';

/**
 * Database page: the live request map, the latest requests and every table with its records.
 * One stream from the backend monitor feeds all three; nothing on this page writes.
 */
export function DatabasePage() {
  const { t, lang } = useI18n();
  const [catalog, setCatalog] = useState<DbCatalog>();
  const [error, setError] = useState<string>();
  const [selected, setSelected] = useState(() => new URLSearchParams(location.search).get('t') ?? 'Constructs');
  const [paused, setPaused] = useState(false);
  const [missed, setMissed] = useState(0);
  const [conn, setConn] = useState<Conn>('connecting');
  const [touched, setTouched] = useState<Record<string, number>>({});
  const [highlight, setHighlight] = useState<Set<string>>(() => new Set());
  const feed = useMemo(() => new EventTarget(), []);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const langRef = useRef(lang);
  langRef.current = lang;

  const loadCatalog = useCallback(async () => {
    try { setCatalog(await loadDbCatalog()); setError(undefined); }
    catch (e) { setError(errorText((k, p) => translate(langRef.current, k, p), e)); }
  }, []);
  useEffect(() => { void loadCatalog(); }, [loadCatalog]);

  useEffect(() => {
    const ac = new AbortController();
    let written = new Set<string>();
    let timer: ReturnType<typeof setTimeout> | undefined;
    openDbStream((e: DbEvent) => {
      // Writes change counts and records: refresh them shortly after (batched), paused or not.
      if (e.type !== 'start') {
        const tables = e.ops.filter((o) => o.op !== 'SELECT').map((o) => o.table);
        if (tables.length) {
          tables.forEach((x) => written.add(x));
          clearTimeout(timer);
          timer = setTimeout(() => {
            const batch = written; written = new Set();
            void loadCatalog();
            setTouched((m) => { const next = { ...m }; batch.forEach((x) => { next[x] = (next[x] ?? 0) + 1; }); return next; });
          }, 900);
        }
      }
      if (pausedRef.current) { if (e.type === 'end') setMissed((n) => n + 1); return; }
      if (document.visibilityState !== 'visible') return;
      feed.dispatchEvent(new CustomEvent(EVENT, { detail: e }));
    }, setConn, ac.signal);
    return () => { ac.abort(); clearTimeout(timer); };
  }, [feed, loadCatalog]);

  const select = useCallback((name: string, scroll = false) => {
    setSelected(name);
    history.replaceState(null, '', `/database?t=${encodeURIComponent(name)}`);   // shareable, without reloading the page
    if (scroll) document.getElementById('db-browser')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  const nf = new Intl.NumberFormat(lang === 'de' ? 'de-DE' : 'en-US');
  const rows = catalog?.tables.reduce((s, x) => s + x.rows, 0) ?? 0;
  const cols = catalog?.tables.reduce((s, x) => s + x.columns.length, 0) ?? 0;
  const size = catalog?.sizeBytes ? `${(catalog.sizeBytes / 1024 / 1024).toLocaleString(lang === 'de' ? 'de-DE' : 'en-US', { maximumFractionDigits: 1 })} MB` : '—';

  return (
    <>
      <PageHeader
        title={t('db.title')}
        description={<>{t('db.sub')}<span className="mt-1.5 flex items-center gap-1.5 text-[13px]"><Lock size={13} className="shrink-0" />{t('db.sim')}</span></>}
        actions={<>
          <ConnBadge conn={conn} paused={paused} />
          <Button variant="outline" onClick={() => { setPaused((p) => !p); setMissed(0); }}>
            {paused ? <Play /> : <Pause />}{paused ? t('db.live.resume') : t('db.live.pause')}
            {paused && missed > 0 && <Badge variant="secondary" className="ml-0.5 animate-pop px-1.5">{t('db.live.new', { n: missed })}</Badge>}
          </Button>
          <Button variant="outline" size="icon" aria-label={t('db.refresh')} title={t('db.refresh')} onClick={() => void loadCatalog()}><RefreshCw /></Button>
        </>}
      />
      {error && <Banner tone="err">{error}</Banner>}
      {!catalog && !error && <Skeleton className="h-[520px]" />}
      {catalog && (
        <>
          <div className="mb-4 grid grid-cols-4 gap-3 max-[1100px]:grid-cols-2">
            <StatCard value={catalog.tables.length} label={t('db.kpi.tables')} />
            <StatCard value={nf.format(rows)} label={t('db.kpi.rows')} />
            <StatCard value={nf.format(cols)} label={t('db.kpi.cols')} />
            <StatCard value={size} label={t('db.kpi.size', { f: catalog.file ?? 'db' })} />
          </div>

          <Card className="mb-4 gap-0 overflow-hidden py-0 shadow-card">
            <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3 border-b px-5 py-4">
              <div className="max-w-[640px] min-w-0">
                <h2 className="flex items-center gap-2.5">{t('db.live.title')}</h2>
                <p className="mt-1 text-[13.5px] text-muted-foreground">{t('db.live.sub')}</p>
              </div>
              <LiveStats feed={feed} />
            </header>
            <div className="overflow-x-clip px-5 pt-4 pb-6 pl-6">
              <DbFlow catalog={catalog} feed={feed} selected={selected} highlight={highlight} onSelect={(n) => select(n, true)} />
            </div>
            <footer className="flex flex-wrap items-center gap-x-5 gap-y-1.5 border-t bg-muted/30 px-5 py-2.5 text-[12.5px] text-muted-foreground">
              <Legend className="bg-primary" label={t('db.legend.read')} />
              <Legend className="bg-teal" label={t('db.legend.write')} />
              <Legend className="bg-err" label={t('db.legend.error')} />
              <span className="ml-auto font-mono text-[11.5px]">{catalog.services.map((s) => `${s.name} ${s.path}`).join(' · ')}</span>
            </footer>
          </Card>

          <Ticker feed={feed} onHover={setHighlight} />

          <DbTables catalog={catalog} selected={selected} onSelect={(n) => select(n)} touched={touched[selected] ?? 0} />
        </>
      )}
    </>
  );
}

function Legend({ className, label }: { className: string; label: string }) {
  return <span className="inline-flex items-center gap-1.5"><span className={cn('size-2.5 rounded-full', className)} />{label}</span>;
}

function ConnBadge({ conn, paused }: { conn: Conn; paused: boolean }) {
  const { t } = useI18n();
  if (paused) return <Badge variant="neutral" className="h-7 px-3"><Pause size={11} />{t('db.live.paused')}</Badge>;
  if (conn === 'live') return <Badge variant="ok" className="h-7 px-3"><span className="size-1.5 animate-breathe rounded-full bg-current" />{t('db.live.on')}</Badge>;
  if (conn === 'offline') return <Badge variant="wait" className="h-7 px-3">{t('db.live.offline')}</Badge>;
  return <Badge variant="info" className="h-7 px-3">{t('db.live.connecting')}</Badge>;
}

/** Counters since the page opened and a 60-second sparkline of SQL queries per second. */
function LiveStats({ feed }: { feed: EventTarget }) {
  const { t, lang } = useI18n();
  const nf = new Intl.NumberFormat(lang === 'de' ? 'de-DE' : 'en-US');
  const totals = useRef({ requests: 0, queries: 0, commits: 0, errors: 0 });
  const bucket = useRef(0);
  const [series, setSeries] = useState<number[]>(() => Array(60).fill(0));
  useEffect(() => {
    const on = (ev: Event) => {
      const e = (ev as CustomEvent<DbEvent>).detail;
      if (e.type === 'start') return;
      const n = e.ops.reduce((s, o) => s + o.n, 0);
      bucket.current += n;
      totals.current.queries += n;
      if (e.type === 'end') { totals.current.requests++; totals.current.commits += e.commits; if (e.status >= 400) totals.current.errors++; }
    };
    feed.addEventListener(EVENT, on);
    const id = setInterval(() => { const v = bucket.current; bucket.current = 0; setSeries((s) => [...s.slice(1), v]); }, 1000);
    return () => { feed.removeEventListener(EVENT, on); clearInterval(id); };
  }, [feed]);
  const max = Math.max(4, ...series);
  const W = 180, H = 40;
  const pts = series.map((v, i) => `${(i / (series.length - 1)) * W},${H - 2 - (v / max) * (H - 6)}`).join(' ');
  const stat = (label: string, value: number, tone?: string) => (
    <div className="grid leading-tight"><b className={cn('text-[19px] font-semibold tabular-nums', tone)}>{nf.format(value)}</b><small className="text-[11.5px] text-muted-foreground">{label}</small></div>
  );
  return (
    <div className="flex flex-wrap items-center gap-5">
      {stat(t('db.live.requests'), totals.current.requests)}
      {stat(t('db.live.queries'), totals.current.queries)}
      {stat(t('db.live.commits'), totals.current.commits)}
      {stat(t('db.live.errors'), totals.current.errors, totals.current.errors ? 'text-err' : undefined)}
      <figure className="m-0 grid gap-0.5" title={t('db.live.qps')}>
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t('db.live.qps')} className="overflow-visible">
          <polygon points={`0,${H} ${pts} ${W},${H}`} className="fill-teal/15" />
          <polyline points={pts} className="fill-none stroke-teal" strokeWidth={1.6} strokeLinejoin="round" />
        </svg>
        <figcaption className="text-[11px] text-muted-foreground">{t('db.live.qps')} · {series[series.length - 1]}/s</figcaption>
      </figure>
    </div>
  );
}

interface Entry { id: string; at: string; method: string; path: string; status: number; ms: number; via: DbClient; tables: { table: string; write: boolean; n: number }[]; queries: number }
const CLIENT_ICON: Record<DbClient, typeof Monitor> = { SESSION: Monitor, KEY: KeyRound, '-': Globe };

/** The latest requests with the tables each one touched. Pointing at one highlights its tables on the map. */
function Ticker({ feed, onHover }: { feed: EventTarget; onHover: (tables: Set<string>) => void }) {
  const { t } = useI18n();
  const [list, setList] = useState<Entry[]>([]);
  useEffect(() => {
    const on = (ev: Event) => {
      const e = (ev as CustomEvent<DbEvent>).detail;
      if (e.type !== 'end') return;
      const map = new Map<string, { table: string; write: boolean; n: number }>();
      for (const o of e.ops) { const x = map.get(o.table) ?? { table: o.table, write: false, n: 0 }; x.n += o.n; x.write ||= o.op !== 'SELECT'; map.set(o.table, x); }
      const entry: Entry = { id: e.id, at: e.at, method: e.method, path: e.path, status: e.status, ms: e.ms, via: e.via, tables: [...map.values()].sort((a, b) => Number(b.write) - Number(a.write) || b.n - a.n), queries: e.ops.reduce((s, o) => s + o.n, 0) };
      setList((l) => [entry, ...l].slice(0, 40));
    };
    feed.addEventListener(EVENT, on);
    return () => feed.removeEventListener(EVENT, on);
  }, [feed]);
  const time = (iso: string) => new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  return (
    <Card className="mb-4 gap-0 overflow-hidden py-0 shadow-card">
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b px-5 py-3">
        <h2 className="text-[15px]">{t('db.ticker.title')}</h2>
        <small className="text-[12.5px] text-muted-foreground">{t('db.ticker.hover')}</small>
      </header>
      <ul className="m-0 max-h-[300px] list-none overflow-y-auto p-0 py-1" onMouseLeave={() => onHover(new Set())}>
        {list.length === 0 && <li><EmptyState>{t('db.ticker.empty')}</EmptyState></li>}
        {list.map((x) => {
          const Icon = CLIENT_ICON[x.via] ?? Globe;
          return (
            <li key={x.id} onMouseEnter={() => onHover(new Set(x.tables.map((y) => y.table)))}
              className="grid animate-rise grid-cols-[62px_18px_52px_minmax(120px,1fr)_auto] items-center gap-x-3 gap-y-1 px-5 py-1.5 text-[13px] hover:bg-accent/50 max-[760px]:grid-cols-[62px_18px_52px_minmax(0,1fr)]">
              <span className="font-mono text-[11.5px] text-muted-foreground">{time(x.at)}</span>
              <Icon size={14} className="text-muted-foreground" aria-label={t(`db.node.${x.via === '-' ? 'ANON' : x.via}`)} />
              <Badge variant={x.method === 'GET' ? 'info' : 'secondary'} className="w-[52px] font-mono text-[11px]">{x.method}</Badge>
              <span className="truncate font-mono text-[12px]" title={x.path}>{x.path}</span>
              <span className="flex min-w-0 flex-wrap items-center justify-end gap-1.5 max-[760px]:col-span-4 max-[760px]:justify-start">
                {x.tables.slice(0, 4).map((y) => (
                  <span key={y.table} className={cn('inline-flex items-center gap-1 rounded-md border px-1.5 py-px font-mono text-[11px]', y.write ? 'border-teal/40 bg-secondary text-secondary-foreground' : 'bg-muted/60 text-muted-foreground')}>
                    <span className={cn('size-1.5 rounded-full', y.write ? 'bg-teal' : 'bg-primary/60')} />{y.table}{y.n > 1 && <span className="opacity-70">×{y.n}</span>}
                  </span>
                ))}
                {x.tables.length > 4 && <span className="text-[11.5px] text-muted-foreground">+{x.tables.length - 4}</span>}
                {x.tables.length === 0 && <span className="text-[11.5px] text-muted-foreground">{t('db.ticker.none')}</span>}
                <span className={cn('ml-1 font-mono text-[12px] font-semibold', x.status >= 400 ? 'text-err' : 'text-teal-ink')}>{x.status}</span>
                <span className="w-[52px] text-right font-mono text-[11.5px] text-muted-foreground tabular-nums">{x.ms} ms</span>
              </span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
