import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { toast as sonner } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Toaster } from '@/components/ui/sonner';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { Check, CircleDashed, Clock, GitFork, Minus, PencilLine } from 'lucide-react';
import type { StepState } from './api';
import { ApiError, type Case, type CaseIssue, type CaseStatus, type Snapshot } from './api';
import { resultText, translate, useI18n, type Key } from './i18n';

/* ---------------- App context ---------------- */
export interface AppCtx {
  data: Snapshot;
  refresh: () => Promise<Snapshot | undefined>;
  openCase: (caseId: string) => void;
  toast: (message: string, tone?: 'ok' | 'err') => void;
  go: (path: string) => void;
  /** Pause automatic refresh while an animation plays (nesting-safe). */
  pause: (on: boolean) => void;
}
export const AppContext = createContext<AppCtx | null>(null);
export const useApp = () => useContext(AppContext)!;

/* ---------------- Router (clean URLs, History API) ---------------- */
const NAV = 'ruhend:nav';
const LEGACY: Record<string, string> = {
  '/api': '/api-console',
  '/api#keys': '/api-console/access',
  '/klaerfaelle': '/cases',
  '/schnittstelle': '/api-console',
  '/schnittstelle/zugang': '/api-console/access',
  '/protokoll': '/activity',
  '/ablauf': '/process',
};
/** Old hash bookmarks are rewritten once to the current English client routes. */
function normalizeLegacy() {
  const old = location.hash.startsWith('#/') ? location.hash.slice(1) : location.pathname;
  const mapped = LEGACY[old];
  if (mapped) history.replaceState(null, '', mapped);
  else if (location.hash.startsWith('#/')) history.replaceState(null, '', old);
}
const current = () => location.pathname + location.search;

export function useRoute(): string {
  const [route, setRoute] = useState(() => { normalizeLegacy(); return current(); });
  useEffect(() => {
    const on = () => setRoute(current());
    window.addEventListener('popstate', on);
    window.addEventListener(NAV, on);
    return () => { window.removeEventListener('popstate', on); window.removeEventListener(NAV, on); };
  }, []);
  return route;
}
export const navigate = (path: string) => {
  if (current() !== path) history.pushState(null, '', path);
  window.dispatchEvent(new Event(NAV));
  window.scrollTo({ top: 0 });
};
export const NAV_EVENT = NAV;

/** Plain <a href="/..."> links navigate inside the app without a page load (Cmd/Ctrl-click and external links are left alone). */
export function useLinkInterceptor() {
  useEffect(() => {
    const on = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element).closest?.('a[href]') as HTMLAnchorElement | null;
      if (!a || a.target || a.hasAttribute('download') || a.origin !== location.origin) return;
      if (a.pathname.startsWith('/api/') || a.pathname.startsWith('/odata/') || /\.\w+$/.test(a.pathname)) return;   // API and files: normal browser behaviour
      e.preventDefault();
      navigate(a.pathname + a.search);
    };
    document.addEventListener('click', on);
    return () => document.removeEventListener('click', on);
  }, []);
}

/* ---------------- Brand ---------------- */
/** The logo. Calm motion: the teal node sends one soft ripple on load and once per hover (a signal, not a spinner). */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span className={cn('relative block size-9 shrink-0', className)}>
      <img src="/logo.svg" alt="" width={36} height={36} className="block size-full rounded-[10px]" />
      <span aria-hidden="true" className="pointer-events-none absolute top-[39.5%] left-[76.7%] -mt-1 -ml-1 size-2 animate-ripple rounded-full border-[1.5px] border-[#b8fff2] opacity-0 group-hover/brand:animate-[ripple2_1.2s_var(--ease)_1]" />
    </span>
  );
}

/** SIMULATION marker next to the title; the full explanation is one hover or focus away. */
export function SimTag() {
  const { t } = useI18n();
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} role="note" aria-label={t('top.sim.title')} className="inline-flex h-[17px] cursor-help items-center gap-1.5 rounded-[5px] border border-wait-line bg-wait-soft px-1.5 text-[10px] font-semibold tracking-[0.07em] text-wait">
          <i className="size-[5px] animate-breathe rounded-full bg-wait" />{t('top.sim.tag')}
        </span>
      </TooltipTrigger>
      <TooltipContent align="start" className="max-w-[270px] bg-card text-[13px] font-normal leading-snug text-muted-foreground shadow-float ring-1 ring-border [&_svg]:hidden">
        <b className="mb-0.5 block font-semibold text-wait">{t('top.sim.title')}</b>{t('top.sim.body')}
      </TooltipContent>
    </Tooltip>
  );
}

/* ---------------- Case presentation ---------------- */
export type Tone = 'ok' | 'wait' | 'act' | 'err' | 'info' | 'neutral';
export const STATUS_TONE: Record<CaseStatus, Tone> = {
  DONE: 'ok', READY: 'info', NEW: 'neutral', WAITING: 'wait', DECISION: 'act', CORRECTION: 'err', EXCLUDED: 'neutral', NOT_PARTICIPATING: 'neutral', REACTIVATED: 'info',
};
export const NEEDS_ATTENTION: CaseStatus[] = ['DECISION', 'CORRECTION', 'WAITING'];

export function statusLabel(t: (k: Key | string) => string, c: Pick<Case, 'status' | 'kind'>) {
  return c.status === 'DONE' && c.kind === 'GENERATOR' ? t('status.DONE.gen') : t(`status.${c.status}`);
}

export function StatusChip({ c, animateKey }: { c: Pick<Case, 'status' | 'kind'>; animateKey?: string }) {
  const { t } = useI18n();
  const prev = useRef(c.status);
  const [changed, setChanged] = useState(false);
  useEffect(() => {
    if (prev.current !== c.status) { setChanged(true); const id = setTimeout(() => setChanged(false), 500); prev.current = c.status; return () => clearTimeout(id); }
  }, [c.status, animateKey]);
  return <Badge variant={STATUS_TONE[c.status]} className={cn(changed && 'animate-pop')}><span className="size-1.5 rounded-full bg-current" />{statusLabel(t, c)}</Badge>;
}

/** One work item per open finding (a shared finding is one decision); cases without a finding (vSZ) count once. */
export interface WorkItem { c: Case; issue?: CaseIssue; category: 'DECISION' | 'CORRECTION' | 'STATUS' | 'VSZ' }
const RULE_CATEGORY: Record<string, WorkItem['category']> = {
  V05: 'DECISION', V06: 'DECISION', V14: 'DECISION', V09: 'STATUS', V10: 'STATUS', V11: 'STATUS',
  V01: 'CORRECTION', V02: 'CORRECTION', V04: 'CORRECTION', V07: 'CORRECTION', V08: 'CORRECTION', V12: 'CORRECTION', V13: 'CORRECTION',
};
export function openItems(cases: Case[]): WorkItem[] {
  const seen = new Set<string>();
  const items: WorkItem[] = [];
  for (const c of cases.filter((x) => NEEDS_ATTENTION.includes(x.status))) {
    if (c.issues.length === 0) { const k = `${c.maloId}|${c.category}`; if (!seen.has(k)) { seen.add(k); items.push({ c, category: c.category === 'VSZ' ? 'VSZ' : 'STATUS' }); } continue; }
    for (const issue of c.issues) {
      if (seen.has(issue.ID)) continue;
      seen.add(issue.ID);
      items.push({ c, issue, category: RULE_CATEGORY[issue.ruleId] ?? 'CORRECTION' });
    }
  }
  return items.sort((a, b) => (a.issue?.createdAt ?? a.c.since ?? '').localeCompare(b.issue?.createdAt ?? b.c.since ?? ''));
}

/** The one issue that best explains the case (decision > correction > status). */
export function primaryIssue(c: Case) {
  const order = ['V05', 'V06', 'V14', 'V01', 'V02', 'V04', 'V07', 'V08', 'V12', 'V13', 'V11', 'V10', 'V09'];
  return [...c.issues].sort((a, b) => order.indexOf(a.ruleId) - order.indexOf(b.ruleId))[0];
}
export function caseHeadline(t: (k: Key | string, p?: Record<string, string | number>) => string, c: Case, only?: CaseIssue): { title: string; text: string; tone: Tone } {
  const issue = only ?? primaryIssue(c);
  if (issue) {
    const unknown = issue.message.includes('UNKNOWN');
    return {
      title: issue.ruleId === 'V10' && unknown ? `${t('rule.V10')} (?)` : t(`rule.${issue.ruleId}`),
      text: t(`rule.${issue.ruleId}.x`), tone: only ? ({ DECISION: 'act', CORRECTION: 'err', STATUS: 'wait', VSZ: 'wait' } as const)[RULE_CATEGORY[issue.ruleId] ?? 'CORRECTION'] : STATUS_TONE[c.status],
    };
  }
  if (c.category === 'VSZ') return { title: t('rule.VSZ'), text: t('rule.VSZ.x'), tone: 'wait' };
  if (c.status === 'DONE') return { title: statusLabel(t, c), text: c.kind === 'GENERATOR' ? t('case.fine') : t('case.done.ruhend'), tone: 'ok' };
  if (c.status === 'NEW') return { title: t('status.NEW'), text: t('case.notrun'), tone: 'neutral' };
  if (c.status === 'READY') return { title: t('status.READY'), text: t('case.ready'), tone: 'info' };
  if (c.status === 'EXCLUDED') return { title: t('status.EXCLUDED'), text: c.exclusionReason ?? '', tone: 'neutral' };
  if (c.status === 'NOT_PARTICIPATING') return { title: t('status.NOT_PARTICIPATING'), text: t('res.NOT_PARTICIPATING'), tone: 'neutral' };
  return { title: statusLabel(t, c), text: resultText(t, c.code), tone: STATUS_TONE[c.status] };
}

export const TONE_BOX: Record<Tone, string> = { ok: 'bg-ok-soft text-ok', act: 'bg-act-soft text-act', err: 'bg-err-soft text-err', wait: 'bg-wait-soft text-wait', info: 'bg-primary-soft text-accent-foreground', neutral: 'bg-muted text-muted-foreground' };
/** Rounded square carrying a tone icon: the one way a finding or status is marked in lists. */
export function ToneBox({ tone, box = 24, icon = 13, className }: { tone: Tone; box?: number; icon?: number; className?: string }) {
  return <span style={{ width: box, height: box }} className={cn('grid shrink-0 place-items-center rounded-[7px]', TONE_BOX[tone], className)}><ToneIcon tone={tone} size={icon} /></span>;
}

export function ToneIcon({ tone, size = 18 }: { tone: Tone; size?: number }) {
  if (tone === 'ok') return <Check size={size} strokeWidth={2.2} />;
  if (tone === 'act') return <GitFork size={size} strokeWidth={2} />;
  if (tone === 'err') return <PencilLine size={size} strokeWidth={2} />;
  if (tone === 'wait') return <Clock size={size} strokeWidth={2} />;
  if (tone === 'neutral') return <Minus size={size} strokeWidth={2} />;
  return <CircleDashed size={size} strokeWidth={2} />;
}

/** "3 offene Befunde: 1 Datenfehler · 2 Entscheidungen" — zero parts are left out, singular/plural handled. */
export function findingsText(t: (k: Key | string, p?: Record<string, string | number>) => string, corr: number, dec: number, withTotal = true) {
  const parts = [corr ? t('co.f.err', { n: corr }) : '', dec ? t('co.f.dec', { n: dec }) : ''].filter(Boolean).join(' · ');
  return withTotal ? `${t('co.f.total', { n: corr + dec })}: ${parts}` : parts;
}

/* ---------------- One state system for the whole UI ----------------
 * Every place that shows a state (card rail, timeline, drawer steps, lists) uses these, so the same
 * situation always looks and reads the same.
 */
export type UiState = 'ok' | 'partial' | 'act' | 'err' | 'wait' | 'planned' | 'todo' | 'na' | 'now';

/** A participant's step state → UI state. Prüfung waits on a decision; prerequisites wait on an outside status. */
export function stepUi(stepId: string, state: StepState): UiState {
  if (state === 'OK' || state === 'DONE') return 'ok';
  if (state === 'TODO') return 'planned';
  if (state === 'NA') return 'na';
  if (state === 'SKIP') return 'todo';
  if (state === 'FAIL') return stepId === 'PREREQ' ? 'wait' : 'err';
  return stepId === 'PRUEFUNG' ? 'act' : 'wait';
}

const STATE_CLASS: Record<UiState, string> = {
  ok: 'border-ok bg-ok text-white',
  partial: 'border-ok text-white bg-[linear-gradient(90deg,var(--ok)_50%,var(--ok-line)_50%)]',
  act: 'border-act bg-act-soft text-act',
  err: 'border-err bg-err-soft text-err',
  wait: 'border-wait bg-wait-soft text-wait',
  planned: 'border-dashed border-primary bg-card text-primary',
  todo: 'border-dashed border-input bg-card text-muted-foreground',
  na: 'border-border bg-card text-muted-foreground/60 opacity-70',
  now: 'relative animate-ring border-primary bg-primary-soft',
};

export function StateIcon({ state, size = 24 }: { state: UiState; size?: number }) {
  const g = Math.round(size * 0.52);
  const icon = state === 'ok' || state === 'partial' ? <Check size={g} strokeWidth={3} />
    : state === 'act' ? <GitFork size={g} strokeWidth={2.4} />
      : state === 'err' ? <PencilLine size={g} strokeWidth={2.4} />
        : state === 'wait' ? <Clock size={g} strokeWidth={2.4} />
          : state === 'na' ? <Minus size={g} strokeWidth={2.4} />
            : state === 'now' ? <span className="size-[55%] animate-spin rounded-full border-2 border-primary border-r-transparent [animation-duration:700ms]" /> : null;
  return <i aria-hidden="true" style={{ width: size, height: size }} className={cn('inline-grid shrink-0 place-items-center rounded-full border-2 transition-colors duration-300', STATE_CLASS[state])}>{icon}</i>;
}

const STATE_CHIP: Record<UiState, string> = {
  ok: 'ok', partial: 'ok', act: 'act', err: 'err', wait: 'wait', planned: 'info', todo: 'neutral', na: 'neutral', now: 'info',
};
export function StateChip({ state, label }: { state: UiState; label?: string }) {
  const { t } = useI18n();
  return <Badge variant={STATE_CHIP[state] as 'ok'} className="gap-1.5 pl-1"><StateIcon state={state} size={14} />{label ?? t(`state.${state}`)}</Badge>;
}

/* ---------------- Progress ring ---------------- */
export function Ring({ value, total }: { value: number; total: number }) {
  const r = 21, c = 2 * Math.PI * r;
  const [shown, setShown] = useState(0);
  useEffect(() => { const id = requestAnimationFrame(() => setShown(total ? value / total : 0)); return () => cancelAnimationFrame(id); }, [value, total]);
  return (
    <svg className="size-[52px] shrink-0" viewBox="0 0 52 52" role="img" aria-label={`${value}/${total}`}>
      <circle cx="26" cy="26" r={r} fill="none" strokeWidth={5} className="stroke-muted" />
      <circle cx="26" cy="26" r={r} fill="none" strokeWidth={5} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - shown)} className="origin-center -rotate-90 stroke-ok transition-[stroke-dashoffset] duration-[900ms] ease-[var(--ease)]" />
      <text x="26" y="30" textAnchor="middle" className="fill-foreground text-[13px] font-semibold">{value}/{total}</text>
    </svg>
  );
}

/* ---------------- Process rail: the 6 stages (solution map + PDF + FRs) ---------------- */
export type RailState = UiState;
export interface RailNode { id: string; label: string; state: RailState; count: string; hint: string }
export const STAGES = ['ANMELDUNG', 'PRUEFUNG', 'VSZ', 'PREREQ', 'UMSTELLUNG', 'UEBERGABE'] as const;

export function Rail({ nodes, running }: { nodes: RailNode[]; running?: boolean }) {
  const n = nodes.length;
  let reached = 0;
  while (reached < n && nodes[reached].state === 'ok') reached++;
  const span = 100 - 100 / n;
  const width = n > 1 ? (Math.max(0, reached - 1) / (n - 1)) * span : 0;
  const edge = `${50 / n}%`;
  return (
    <div className="@container">
      <div className="relative grid" style={{ gridTemplateColumns: `repeat(${n}, 1fr)` }}>
        <div className="absolute top-[11px] h-0.5 rounded-sm bg-border" style={{ left: edge, right: edge }} />
        <div className={cn('absolute top-[11px] h-0.5 rounded-sm transition-[width] duration-700 ease-[var(--ease)]', running ? 'bg-[linear-gradient(90deg,var(--teal),var(--primary))]' : 'bg-ok')} style={{ left: edge, width: `${width}%` }} />
        {nodes.map((node) => (
          <Tooltip key={node.id}>
            <TooltipTrigger asChild>
              <div className="relative grid cursor-help justify-items-center gap-1.5 text-center">
                <StateIcon state={node.state} size={24} />
                <span className={cn('text-xs leading-tight whitespace-nowrap text-muted-foreground @max-[470px]:px-px @max-[470px]:text-[11px] @max-[470px]:whitespace-normal', (node.state === 'ok' || node.state === 'partial') && 'text-foreground/80')}>{node.label}</span>
              </div>
            </TooltipTrigger>
            <TooltipContent className="max-w-[280px] text-[13px]">{node.hint}{node.count && node.count !== '–' ? ` (${node.count})` : ''}</TooltipContent>
          </Tooltip>
        ))}
      </div>
    </div>
  );
}

/** Stage states and counters of a construct, derived from the same live cases as every other view. */
export function constructRail(t: (k: Key | string, p?: Record<string, string | number>) => string, data: Snapshot, constructId: string, running = false, reveal?: number) {
  const cases = data.cases.filter((c) => c.constructId === constructId);
  const c = data.constructs.find((x) => x.constructId === constructId)!;
  const validated = !!c.validatedAt;
  const participants = cases.filter((x) => !['EXCLUDED', 'NOT_PARTICIPATING'].includes(x.status));
  const households = participants.filter((x) => x.kind === 'HOUSEHOLD');
  const done = households.filter((x) => x.status === 'DONE').length;
  const items = openItems(data.cases).filter((w) => (w.issue?.constructIds.split(',') ?? [w.c.constructId]).includes(constructId));
  const corr = items.filter((w) => w.category === 'CORRECTION').length;   // data errors
  const dec = items.filter((w) => w.category === 'DECISION').length;      // decisions
  const findings = corr + dec;
  const vszOk = c.vszConfirmed === c.vszTotal;
  const hint = (i: number) => `${t(`stage.${STAGES[i - 1]}`)} — ${t(`stage.${i}.what`)}`;

  /**
   * A stage is judged only by what happens IN that stage, aggregated over the participants' own step states
   * (the same steps the case drawer shows). A participant that never reached a stage (stopped earlier) is counted
   * in the stage where it stopped, not here — so a full circle means: everyone who got this far passed it.
   */
  const STEP_IDS: Record<string, string[]> = { PRUEFUNG: ['PRUEFUNG'], PREREQ: ['PREREQ'], UMSTELLUNG: ['MEMA', 'MAMA', 'RUHEND'], UEBERGABE: ['UEBERGABE'] };
  const stage = (id: string): { state: RailState; count: string } => {
    if (!validated) return { state: running ? 'now' : 'todo', count: '–' };
    let relevant = 0, passed = 0, act = 0, wait = 0;
    for (const x of participants) {
      const st = x.steps.filter((s) => STEP_IDS[id].includes(s.id) && s.state !== 'NA' && s.state !== 'SKIP').map((s) => s.state);
      if (!st.length) continue;
      relevant++;
      if (st.includes('FAIL')) act++;
      else if (st.includes('WAIT')) wait++;
      else if (st.every((v) => v === 'OK' || v === 'DONE')) passed++;
    }
    const state: RailState = act ? 'act' : wait ? 'wait' : relevant === 0 || passed === relevant ? 'ok' : passed > 0 ? 'partial' : 'todo';
    return { state, count: relevant ? `${passed}/${relevant}` : '–' };
  };
  const pruefung = stage('PRUEFUNG'), prereq = stage('PREREQ'), umst = stage('UMSTELLUNG'), ueb = stage('UEBERGABE');
  const nodes: RailNode[] = [
    { id: 'ANMELDUNG', label: t('rail.ANMELDUNG'), state: validated ? 'ok' : running ? 'now' : 'todo', count: String(cases.length), hint: hint(1) },
    // Most urgent open finding decides the colour: data error (red) > decision (violet). The tooltip spells out the split.
    { id: 'PRUEFUNG', label: t('rail.PRUEFUNG'), state: !validated ? pruefung.state : corr ? 'err' : dec ? 'act' : pruefung.state === 'wait' ? 'act' : pruefung.state, count: pruefung.count, hint: `${hint(2)}${validated && findings ? ` · ${findingsText(t, corr, dec, false)}` : ''}` },
    { id: 'VSZ', label: t('rail.VSZ'), state: !validated ? (running ? 'now' : 'todo') : vszOk ? 'ok' : 'wait', count: `${c.vszConfirmed}/${c.vszTotal}`, hint: hint(3) },
    { id: 'PREREQ', label: t('rail.PREREQ'), state: prereq.state === 'act' ? 'wait' : prereq.state, count: prereq.count, hint: hint(4) }, // prerequisites wait for an external status
    { id: 'UMSTELLUNG', label: t('rail.UMSTELLUNG'), state: umst.state, count: umst.count, hint: hint(5) },
    { id: 'UEBERGABE', label: t('rail.UEBERGABE'), state: ueb.state, count: ueb.count, hint: hint(6) },
  ];
  // Playback: stages before `reveal` show their real result, the current one is running, later ones wait.
  const shown: RailNode[] = reveal === undefined ? nodes : nodes.map((n, i) => (i < reveal ? n : i === reveal ? { ...n, state: 'now' as UiState, count: '…' } : { ...n, state: 'todo' as UiState, count: '–' }));
  return { nodes: shown, done, total: households.length, open: items.length, items, corr, dec, validated, handover: data.outbox.filter((e) => e.constructId === constructId).length };
}

/* ---------------- Toasts (sonner, themed in components/ui/sonner.tsx) ---------------- */
export function useToasts() {
  const push = useCallback((message: string, tone: 'ok' | 'err' = 'ok') => {
    if (tone === 'err') sonner.error(message, { duration: 7000 });
    else sonner.success(message, { duration: 4200 });
  }, []);
  const view = <Toaster position="bottom-center" closeButton />;
  return { push, view };
}

/** Error text for API errors, always in the UI language: stable code + parameters → translated sentence. */
export function errorText(t: (k: Key | string, p?: Record<string, string | number>) => string, e: unknown) {
  if (e instanceof ApiError) {
    const text = t(`err.${e.code}`, e.params);
    return text === `err.${e.code}` ? t('err.ERROR') : text;
  }
  return t('err.ERROR');
}
