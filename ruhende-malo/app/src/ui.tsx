import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Check, CircleDashed, Clock, GitFork, Minus, PencilLine, X } from 'lucide-react';
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

/* ---------------- Hash router ---------------- */
export function useRoute(): string {
  const [route, setRoute] = useState(() => location.hash.replace(/^#/, '') || '/');
  useEffect(() => {
    const on = () => setRoute(location.hash.replace(/^#/, '') || '/');
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}
export const navigate = (path: string) => { if (location.hash !== `#${path}`) location.hash = path; window.scrollTo({ top: 0 }); };

/* ---------------- Brand mark: active circle + ruhend crescent ---------------- */
export function BrandMark() {
  return (
    <svg className="brand-mark" viewBox="0 0 28 28" aria-hidden="true">
      <rect width="28" height="28" rx="8" fill="#0a5fc2" />
      <circle cx="11" cy="14" r="6" fill="#fff" />
      <path d="M17.5 8.2a6 6 0 1 1 0 11.6 6 6 0 0 0 0-11.6z" fill="#9cc4f3" />
    </svg>
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
  return <span className={`chip ${STATUS_TONE[c.status]} ${changed ? 'changed' : ''}`}><span className="dot" />{statusLabel(t, c)}</span>;
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

export function StateIcon({ state, size = 24 }: { state: UiState; size?: number }) {
  const g = Math.round(size * 0.52);
  const icon = state === 'ok' || state === 'partial' ? <Check size={g} strokeWidth={3} />
    : state === 'act' ? <GitFork size={g} strokeWidth={2.4} />
      : state === 'err' ? <PencilLine size={g} strokeWidth={2.4} />
        : state === 'wait' ? <Clock size={g} strokeWidth={2.4} />
          : state === 'na' ? <Minus size={g} strokeWidth={2.4} /> : null;
  return <i className={`st st-${state}`} style={{ ['--s' as string]: `${size}px` }} aria-hidden="true">{icon}</i>;
}

export function StateChip({ state, label }: { state: UiState; label?: string }) {
  const { t } = useI18n();
  return <span className={`chip st-chip st-${state}`}><StateIcon state={state} size={14} />{label ?? t(`state.${state}`)}</span>;
}

/* ---------------- Progress ring ---------------- */
export function Ring({ value, total }: { value: number; total: number }) {
  const r = 21, c = 2 * Math.PI * r;
  const [shown, setShown] = useState(0);
  useEffect(() => { const id = requestAnimationFrame(() => setShown(total ? value / total : 0)); return () => cancelAnimationFrame(id); }, [value, total]);
  return (
    <svg className="ring" viewBox="0 0 52 52" role="img" aria-label={`${value}/${total}`}>
      <circle className="bg" cx="26" cy="26" r={r} />
      <circle className="fg" cx="26" cy="26" r={r} strokeDasharray={c} strokeDashoffset={c * (1 - shown)} />
      <text x="26" y="30" textAnchor="middle">{value}/{total}</text>
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
  return (
    <div className="rail-wrap">
    <div className={`rail ${running ? 'running' : ''}`} style={{ gridTemplateColumns: `repeat(${n}, 1fr)`, ['--edge' as string]: `${50 / n}%` }}>
      <div className="rail-fill" style={{ width: `${width}%` }} />
      {nodes.map((node) => (
        <div key={node.id} className={`rail-node ${node.state}`} title={`${node.hint}${node.count && node.count !== '–' ? ` (${node.count})` : ''}`}>
          <StateIcon state={node.state} size={24} />
          <span>{node.label}</span>
        </div>
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

/* ---------------- Toasts ---------------- */
interface ToastItem { id: number; message: string; tone: 'ok' | 'err' }
export function useToasts() {
  const [items, setItems] = useState<ToastItem[]>([]);
  const push = useCallback((message: string, tone: 'ok' | 'err' = 'ok') => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x.slice(-2), { id, message, tone }]);
    setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), tone === 'err' ? 7000 : 4200);
  }, []);
  const view: ReactNode = (
    <div className="toasts" role="status" aria-live="polite">
      {items.map((i) => (
        <div key={i.id} className={`toast ${i.tone === 'err' ? 'err' : ''}`}>
          {i.tone === 'err' ? <X size={18} /> : <Check size={18} />}<span>{i.message}</span>
          <button className="x" aria-label={translate(document.documentElement.lang === 'en' ? 'en' : 'de', 'common.close')} onClick={() => setItems((x) => x.filter((y) => y.id !== i.id))}><X size={14} /></button>
        </div>
      ))}
    </div>
  );
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
