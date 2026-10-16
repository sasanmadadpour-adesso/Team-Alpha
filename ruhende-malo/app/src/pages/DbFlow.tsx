import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ComponentType } from 'react';
import { ArrowLeftRight, Building2, Database, FileSpreadsheet, Globe, KeyRound, Monitor, Route, ScrollText, Server, ShieldCheck, Sun, ChartLine, Boxes, Waypoints } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DbCatalog, DbClient, DbEvent, DbLane } from '../api';
import { useI18n } from '../i18n';

/**
 * Live map of the request path: client → access layer → CAP service → SQL → table.
 * Every particle is a real request reported by the backend monitor; the tables it reaches are the
 * tables the request really read (SELECT) or wrote (INSERT · UPDATE · DELETE).
 */

export const GROUP_ORDER = ['process', 'switch', 'audit', 'workbook', 'producers', 'series', 'other'] as const;
export const GROUP_ICON: Record<string, ComponentType<{ size?: number; className?: string }>> = {
  process: Building2, switch: ArrowLeftRight, audit: ScrollText, workbook: FileSpreadsheet, producers: Sun, series: ChartLine, other: Boxes,
};
const CLIENTS: { key: DbClient; id: 'SESSION' | 'KEY' | 'ANON'; icon: typeof Monitor }[] = [
  { key: 'SESSION', id: 'SESSION', icon: Monitor }, { key: 'KEY', id: 'KEY', icon: KeyRound }, { key: '-', id: 'ANON', icon: Globe },
];
const LANES: { lane: DbLane; icon: typeof Server }[] = [{ lane: 'ProcessApi', icon: Server }, { lane: 'OData', icon: Waypoints }, { lane: 'Custom', icon: Route }];
const clientNode = (c: DbClient | undefined) => `client:${c === 'SESSION' || c === 'KEY' ? c : 'ANON'}`;

/* ---------------- geometry ---------------- */
interface Pt { x: number; y: number }
type Bez = [Pt, Pt, Pt, Pt];

/** A smooth connector between two elements, horizontal when they sit side by side, vertical when stacked. */
function route(wrap: DOMRect, from: Element, to: Element, bend = 0): Bez {
  const a = from.getBoundingClientRect(), b = to.getBoundingClientRect();
  const rel = (x: number, y: number): Pt => ({ x: x - wrap.left, y: y - wrap.top });
  if (b.left >= a.right - 2 || b.right <= a.left + 2) {
    const fwd = b.left >= a.right - 2;
    const p0 = rel(fwd ? a.right : a.left, a.top + a.height / 2 + bend), p3 = rel(fwd ? b.left : b.right, b.top + b.height / 2 + bend);
    const dx = (p3.x - p0.x) * 0.5;
    return [p0, { x: p0.x + dx, y: p0.y }, { x: p3.x - dx, y: p3.y }, p3];
  }
  const down = b.top >= a.bottom - 2;
  const p0 = rel(a.left + a.width / 2 + bend, down ? a.bottom : a.top), p3 = rel(b.left + b.width / 2 + bend, down ? b.top : b.bottom);
  const dy = (p3.y - p0.y) * 0.5;
  return [p0, { x: p0.x, y: p0.y + dy }, { x: p3.x, y: p3.y - dy }, p3];
}
const at = ([p0, p1, p2, p3]: Bez, t: number): Pt => {
  const u = 1 - t;
  return { x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x, y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y };
};
const pathOf = ([p0, p1, p2, p3]: Bez) => `M${p0.x},${p0.y} C${p1.x},${p1.y} ${p2.x},${p2.y} ${p3.x},${p3.y}`;
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/** Theme colors come from the design tokens, so the canvas follows index.css. */
function token(name: string) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#073b70'; }
function rgba(color: string, alpha: number) {
  const hex = color.replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(hex)) return color;
  const n = parseInt(hex, 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${alpha})`;
}

/* ---------------- particle engine (canvas, runs only while something moves) ---------------- */
interface Spark { bez: Bez; t0: number; dur: number; color: string; size: number; onArrive?: () => void; arrived?: boolean }
const TAIL = 0.55;
class Storm {
  private sparks: Spark[] = [];
  private raf = 0;
  private w = 0;
  private h = 0;
  constructor(private canvas: HTMLCanvasElement) {}
  resize(w: number, h: number) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = w; this.h = h;
    this.canvas.width = Math.round(w * dpr); this.canvas.height = Math.round(h * dpr);
    this.canvas.getContext('2d')?.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  add(s: Spark) { if (this.sparks.length < 480) { this.sparks.push(s); if (!this.raf) this.raf = requestAnimationFrame(this.tick); } }
  stop() { cancelAnimationFrame(this.raf); this.raf = 0; this.sparks = []; }
  private tick = (now: number) => {
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, this.w, this.h);
    this.sparks = this.sparks.filter((s) => {
      const p = (now - s.t0) / s.dur;
      if (p < 0) return true;
      if (p >= 1 && !s.arrived) { s.arrived = true; s.onArrive?.(); }
      if (p >= 1 + TAIL) return false;
      const fade = p > 1 ? 1 - (p - 1) / TAIL : 1;
      const head = ease(Math.min(p, 1));
      // the trace: the path drawn so far, like a lightning streak that fades out after arrival
      ctx.beginPath();
      for (let k = 0; k <= 18; k++) { const q = at(s.bez, (head * k) / 18); if (k) ctx.lineTo(q.x, q.y); else ctx.moveTo(q.x, q.y); }
      ctx.strokeStyle = rgba(s.color, 0.2 * fade); ctx.lineWidth = 1.4; ctx.stroke();
      // the comet: a glowing head and a tapering tail
      for (let k = 10; k >= 1; k--) {
        const tt = ease(Math.max(0, Math.min(p, 1) - k * 0.042));
        const q = at(s.bez, tt);
        ctx.beginPath(); ctx.arc(q.x, q.y, Math.max(0.6, s.size * (1 - k / 11)), 0, Math.PI * 2);
        ctx.fillStyle = rgba(s.color, 0.5 * (1 - k / 11) * fade); ctx.fill();
      }
      if (p < 1) {
        const q = at(s.bez, head);
        ctx.save(); ctx.shadowBlur = 14; ctx.shadowColor = s.color;
        ctx.beginPath(); ctx.arc(q.x, q.y, s.size, 0, Math.PI * 2); ctx.fillStyle = s.color; ctx.fill();
        ctx.restore();
        ctx.beginPath(); ctx.arc(q.x, q.y, s.size * 0.45, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.fill();
      }
      return true;
    });
    this.raf = this.sparks.length ? requestAnimationFrame(this.tick) : 0;
  };
}

/* ---------------- component ---------------- */
/** A box on the map. The small teal counter shows requests currently in flight at this node. */
function FlowNode({ id, icon: Icon, title, sub, inFlight = 0 }: { id: string; icon: typeof Server; title: string; sub: string; inFlight?: number }) {
  return (
    <div data-node={id} title={`${title} — ${sub}`} className="relative flex min-w-0 items-center gap-2.5 rounded-xl border bg-card px-3 py-2.5 shadow-card max-[1100px]:flex-1">
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-accent text-primary"><Icon size={16} /></span>
      <span className="grid min-w-0 leading-tight"><b className="truncate text-[13.5px] font-semibold">{title}</b><small className="truncate text-[11.5px] text-muted-foreground">{sub}</small></span>
      {inFlight > 0 && <span className="absolute -top-1.5 -right-1.5 grid h-[18px] min-w-[18px] animate-pop place-items-center rounded-full border-2 border-card bg-teal px-1 text-[10px] font-bold text-white">{inFlight}</span>}
    </div>
  );
}

interface Props {
  catalog: DbCatalog;
  feed: EventTarget;
  selected?: string;
  highlight: Set<string>;
  onSelect: (table: string) => void;
}

export function DbFlow({ catalog, feed, selected, highlight, onSelect }: Props) {
  const { t, lang } = useI18n();
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const floaters = useRef<HTMLDivElement>(null);
  const storm = useRef<Storm | null>(null);
  const [lines, setLines] = useState<{ d: string; soft?: boolean }[]>([]);
  const [busy, setBusy] = useState<Record<string, number>>({});
  const compact = new Intl.NumberFormat(lang === 'de' ? 'de-DE' : 'en-US', { notation: 'compact', maximumFractionDigits: 1 });
  const size = catalog.sizeBytes ? `${(catalog.sizeBytes / 1024 / 1024).toLocaleString(lang === 'de' ? 'de-DE' : 'en-US', { maximumFractionDigits: 1 })} MB` : null;

  const node = useCallback((id: string) => wrap.current?.querySelector(`[data-node="${CSS.escape(id)}"]`) ?? null, []);

  /** Static connectors between the lanes (recomputed whenever the layout changes). */
  const measure = useCallback(() => {
    const w = wrap.current;
    if (!w) return;
    const box = w.getBoundingClientRect();
    storm.current?.resize(box.width, box.height);
    const access = node('access'), port = node('port');
    const out: { d: string; soft?: boolean }[] = [];
    for (const c of CLIENTS) {
      const el = node(clientNode(c.key));
      if (el && access) out.push({ d: pathOf(route(box, el, access)) });
      const odata = node('svc:OData');
      if (el && odata) out.push({ d: pathOf(route(box, el, odata)), soft: true });
    }
    for (const l of ['ProcessApi', 'Custom'] as const) { const s = node(`svc:${l}`); if (access && s) out.push({ d: pathOf(route(box, access, s)) }); }
    for (const l of LANES) { const s = node(`svc:${l.lane}`); if (s && port) out.push({ d: pathOf(route(box, s, port)) }); }
    setLines(out);
  }, [node]);

  useLayoutEffect(() => {
    if (!canvas.current || !wrap.current) return;
    storm.current = new Storm(canvas.current);
    measure();
    const ro = new ResizeObserver(() => measure());
    ro.observe(wrap.current);
    return () => { ro.disconnect(); storm.current?.stop(); storm.current = null; };
  }, [measure]);
  useEffect(() => { measure(); }, [catalog.tables.length, measure]);

  /* ---- animation: one flight per request ---- */
  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const colors = { read: token('--primary'), write: token('--teal'), err: token('--err') };
    const flights = new Map<string, { arriveAt: number; client: DbClient }>();

    const flash = (el: Element | null, color: string, ring = 9) => {
      (el as HTMLElement | null)?.animate?.(
        [{ boxShadow: `0 0 0 0 ${rgba(color, 0.55)}`, backgroundColor: rgba(color, 0.14) }, { boxShadow: `0 0 0 ${ring}px ${rgba(color, 0)}`, backgroundColor: rgba(color, 0) }],
        { duration: 700, easing: 'cubic-bezier(0.2,0.8,0.2,1)' },
      );
    };
    const float = (el: Element | null, text: string, color: string) => {
      const host = floaters.current, w = wrap.current;
      if (!host || !w || !el || reduced) return;
      const r = el.getBoundingClientRect(), box = w.getBoundingClientRect();
      const tag = document.createElement('span');
      tag.textContent = text;
      tag.className = 'absolute font-mono text-[10.5px] font-semibold';
      tag.style.left = `${r.right - box.left - 6}px`; tag.style.top = `${r.top - box.top - 4}px`; tag.style.color = color;
      host.appendChild(tag);
      tag.animate([{ opacity: 0, transform: 'translateY(4px)' }, { opacity: 1, transform: 'translateY(-4px)', offset: 0.25 }, { opacity: 0, transform: 'translateY(-14px)' }], { duration: 1100, easing: 'ease-out' }).onfinish = () => tag.remove();
    };
    /** One leg from element A to element B. Without motion, only the arrival is shown. */
    const leg = (from: Element | null, to: Element | null, start: number, dur: number, color: string, sizePx: number, onArrive?: () => void, bend = 0) => {
      if (!from || !to) return;
      if (reduced || !storm.current || !wrap.current) { if (onArrive) setTimeout(onArrive, Math.max(0, start - performance.now()) + dur); return; }
      storm.current.add({ bez: route(wrap.current.getBoundingClientRect(), from, to, bend), t0: start, dur, color, size: sizePx, onArrive });
    };
    const setBusyBy = (id: string, delta: number) => setBusy((b) => ({ ...b, [id]: Math.max(0, (b[id] ?? 0) + delta) }));

    const fanOut = (fromEl: Element | null, ops: { table: string; op: string; n: number }[], start: number) => {
      const byTable = new Map<string, { write: boolean; n: number }>();
      for (const o of ops) { const x = byTable.get(o.table) ?? { write: false, n: 0 }; x.n += o.n; x.write ||= o.op !== 'SELECT'; byTable.set(o.table, x); }
      const port = node('port');
      if (!byTable.size) return start;
      leg(fromEl, port, start, 240, colors.read, 3, () => flash(port, colors.read, 7));
      let last = start + 240;
      [...byTable.entries()].forEach(([table, x], i) => {
        const chip = node(`table:${table}`);
        const color = x.write ? colors.write : colors.read;
        const delay = Math.min(i * 38, 420), dur = 420 + Math.min(x.n, 40) * 4;
        leg(port, chip, start + 240 + delay, dur, color, 2.7 + Math.min(2.3, Math.log2(x.n + 1) / 2), () => { flash(chip, color); if (x.n > 1 || x.write) float(chip, `${x.write ? '+' : '×'}${x.n}`, color); });
        last = Math.max(last, start + 240 + delay + dur);
      });
      return last;
    };

    const on = (ev: Event) => {
      const e = (ev as CustomEvent<DbEvent>).detail;
      const now = performance.now();
      if (e.type === 'start') {
        const from = node(clientNode(e.client)), access = node('access'), svc = node(`svc:${e.lane}`);
        let arrive = now;
        setBusyBy(`svc:${e.lane}`, 1);
        if (e.lane === 'OData') { leg(from, svc, now, 560, colors.read, 3.4, () => flash(svc, colors.read)); arrive += 560; }
        else {
          leg(from, access, now, 360, colors.read, 3.4, () => flash(access, colors.read));
          leg(access, svc, now + 360, 300, colors.read, 3.4, () => flash(svc, colors.read));
          arrive += 660;
        }
        flights.set(e.id, { arriveAt: arrive, client: e.client });
        setTimeout(() => { if (flights.delete(e.id)) setBusyBy(`svc:${e.lane}`, -1); }, 60_000);   // never answered (client went away)
        return;
      }
      if (e.type === 'db') { fanOut(node('access'), e.ops, now); return; }
      const f = flights.get(e.id);
      flights.delete(e.id);
      if (f) setBusyBy(`svc:${e.lane}`, -1);
      const svc = node(`svc:${e.lane}`), access = node('access');
      const writes = e.ops.some((o) => o.op !== 'SELECT');
      const back = e.status >= 400 ? colors.err : writes ? colors.write : colors.read;
      const done = fanOut(svc, e.ops, f ? Math.max(now, f.arriveAt) : now);
      const client = node(clientNode(e.via !== '-' ? e.via : f?.client ?? '-'));
      if (e.lane === 'OData') leg(svc, client, done, 520, back, 2.8, () => flash(client, back), 6);
      else {
        leg(svc, access, done, 280, back, 2.8, undefined, 6);
        leg(access, client, done + 280, 340, back, 2.8, () => flash(client, back), 6);
      }
    };
    feed.addEventListener('db-event', on);
    return () => feed.removeEventListener('db-event', on);
  }, [feed, node]);

  const groups = GROUP_ORDER.map((g) => ({ g, tables: catalog.tables.filter((x) => x.group === g) })).filter((x) => x.tables.length);
  const laneLabel = (k: string) => <span className="mb-2.5 block text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">{t(`db.lane.${k}`)}</span>;

  return (
    <div ref={wrap} className="relative">
      <svg className="pointer-events-none absolute inset-0 size-full overflow-visible" aria-hidden="true">
        {lines.map((l, i) => <path key={i} d={l.d} className={cn('fill-none [stroke-dasharray:4_4] animate-flow', l.soft ? 'stroke-border' : 'stroke-primary-line')} strokeWidth={1.5} />)}
      </svg>

      <div className="relative grid grid-cols-[176px_172px_184px_minmax(0,1fr)] gap-x-12 max-[1100px]:grid-cols-1 max-[1100px]:gap-y-7">
        <section className="flex flex-col">
          {laneLabel('client')}
          <div className="flex flex-1 flex-col justify-center gap-3 max-[1100px]:flex-row max-[1100px]:flex-wrap">
            {CLIENTS.map((c) => <FlowNode key={c.id} id={clientNode(c.key)} icon={c.icon} title={t(`db.node.${c.id}`)} sub={t(`db.node.${c.id}.d`)} />)}
          </div>
        </section>
        <section className="flex flex-col">
          {laneLabel('access')}
          <div className="flex flex-1 flex-col justify-center">
            <FlowNode id="access" icon={ShieldCheck} title={t('db.node.access')} sub={t('db.node.access.d')} />
          </div>
        </section>
        <section className="flex flex-col">
          {laneLabel('service')}
          <div className="flex flex-1 flex-col justify-center gap-3 max-[1100px]:flex-row max-[1100px]:flex-wrap">
            {LANES.map((l) => <FlowNode key={l.lane} id={`svc:${l.lane}`} icon={l.icon} title={l.lane === 'ProcessApi' ? 'ProcessApi' : t(`db.node.${l.lane}`)} sub={t(`db.node.${l.lane}.d`)} inFlight={busy[`svc:${l.lane}`]} />)}
          </div>
        </section>

        <section className="min-w-0">
          {laneLabel('db')}
          <div data-node="db" className="relative rounded-2xl border border-primary-line bg-primary-soft/50 p-3 pl-6">
            <span data-node="port" title="SQL" className="absolute top-1/2 -left-[15px] grid size-[30px] -translate-y-1/2 place-items-center rounded-full border-2 border-primary bg-card font-mono text-[9.5px] font-semibold text-primary max-[1100px]:top-0 max-[1100px]:left-1/2 max-[1100px]:-translate-x-1/2">SQL</span>
            <header className="mb-2.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 px-1 text-[13px]">
              <Database size={16} className="text-primary" />
              <b className="font-semibold">{catalog.kind === 'sqlite' ? 'SQLite' : catalog.kind}</b>
              {catalog.file && <span className="font-mono text-[12px] text-muted-foreground">{catalog.file}</span>}
              {size && <span className="text-muted-foreground">· {size}</span>}
              <span className="ml-auto text-muted-foreground">{catalog.tables.length} {t('db.kpi.tables')}</span>
            </header>
            <div className="grid grid-cols-3 items-start gap-2.5 max-[1400px]:grid-cols-2 max-[640px]:grid-cols-1">
              {groups.map(({ g, tables }) => {
                const Icon = GROUP_ICON[g] ?? Boxes;
                return (
                  <section key={g} className="rounded-xl border bg-card/90 p-1.5 shadow-card">
                    <h3 className="mb-1 flex items-center gap-1.5 px-1.5 pt-0.5 text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase"><Icon size={13} />{t(`db.g.${g}`)}</h3>
                    <ul className="m-0 grid list-none gap-px p-0">
                      {tables.map((x) => (
                        <li key={x.name}>
                          <button data-node={`table:${x.name}`} onClick={() => onSelect(x.name)} title={t(`db.t.${x.name}`)}
                            className={cn('flex w-full items-center justify-between gap-2 rounded-md border border-transparent px-1.5 py-[3px] text-left transition-colors hover:bg-accent',
                              selected === x.name && 'border-primary-line bg-accent', highlight.has(x.name) && 'border-teal bg-secondary')}>
                            <span className={cn('truncate font-mono text-[11.5px]', x.rows === 0 && 'text-muted-foreground')}>{x.name}</span>
                            <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">{compact.format(x.rows)}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </section>
                );
              })}
            </div>
          </div>
        </section>
      </div>

      <canvas ref={canvas} className="pointer-events-none absolute inset-0 size-full" aria-hidden="true" />
      <div ref={floaters} className="pointer-events-none absolute inset-0 overflow-visible" aria-hidden="true" />
    </div>
  );
}
