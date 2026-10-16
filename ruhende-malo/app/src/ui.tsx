import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Check, CircleDashed, Clock, GitFork, Minus, PencilLine, X } from 'lucide-react';
import type { Case, CaseIssue, CaseStatus, Snapshot } from './api';
import { useI18n, type Key } from './i18n';

/* ---------------- App context ---------------- */
export interface AppCtx {
  data: Snapshot;
  refresh: () => Promise<Snapshot | undefined>;
  openCase: (caseId: string) => void;
  toast: (message: string, tone?: 'ok' | 'err') => void;
  go: (path: string) => void;
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
  if (c.status === 'NOT_PARTICIPATING') return { title: t('status.NOT_PARTICIPATING'), text: 'Teilnahme MK7 = nein', tone: 'neutral' };
  return { title: statusLabel(t, c), text: c.message, tone: STATUS_TONE[c.status] };
}

export function ToneIcon({ tone, size = 18 }: { tone: Tone; size?: number }) {
  if (tone === 'ok') return <Check size={size} strokeWidth={2.2} />;
  if (tone === 'act') return <GitFork size={size} strokeWidth={2} />;
  if (tone === 'err') return <PencilLine size={size} strokeWidth={2} />;
  if (tone === 'wait') return <Clock size={size} strokeWidth={2} />;
  if (tone === 'neutral') return <Minus size={size} strokeWidth={2} />;
  return <CircleDashed size={size} strokeWidth={2} />;
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

/* ---------------- Process rail (5 stages from the solution map) ---------------- */
export type RailState = 'ok' | 'wait' | 'act' | 'now' | 'todo';
export function Rail({ nodes, running }: { nodes: { label: string; state: RailState }[]; running?: boolean }) {
  const done = nodes.filter((n) => n.state === 'ok').length;
  const width = nodes.length > 1 ? (Math.max(0, done - 1) / (nodes.length - 1)) * 80 : 0;
  return (
    <div className={`rail ${running ? 'running' : ''}`}>
      <div className="rail-fill" style={{ width: `${width}%` }} />
      {nodes.map((n) => (
        <div key={n.label} className={`rail-node ${n.state}`}>
          <i>{n.state === 'ok' ? <Check size={13} strokeWidth={3} /> : n.state === 'act' ? <GitFork size={12} strokeWidth={2.4} /> : n.state === 'wait' ? <Clock size={12} strokeWidth={2.4} /> : null}</i>
          <span>{n.label}</span>
        </div>
      ))}
    </div>
  );
}

/** Stage states of a construct, derived from its cases and checklist (same truth as the case list). */
export function constructRail(t: (k: Key | string) => string, data: Snapshot, constructId: string, running = false) {
  const cases = data.cases.filter((c) => c.constructId === constructId);
  const c = data.constructs.find((x) => x.constructId === constructId)!;
  const validated = !!c.validatedAt;
  const participating = cases.filter((x) => x.kind === 'HOUSEHOLD' && !['EXCLUDED', 'NOT_PARTICIPATING'].includes(x.status));
  const done = participating.filter((x) => x.status === 'DONE').length;
  const open = cases.some((x) => ['DECISION', 'CORRECTION'].includes(x.status));
  const waiting = cases.some((x) => x.status === 'WAITING');
  const vszOk = c.vszConfirmed === c.vszTotal;
  const handover = data.outbox.some((e) => e.constructId === constructId);
  const nodes: { label: string; state: RailState }[] = [
    { label: t('stage.ANMELDUNG'), state: 'ok' },
    { label: t('stage.PRUEFUNG'), state: running && !validated ? 'now' : !validated ? 'todo' : open ? 'act' : 'ok' },
    { label: t('stage.VSZ'), state: vszOk ? (validated ? 'ok' : 'todo') : 'wait' },
    { label: t('stage.UMSTELLUNG'), state: running ? 'now' : participating.length && done === participating.length ? 'ok' : done > 0 ? (waiting ? 'wait' : 'act') : 'todo' },
    { label: t('stage.UEBERGABE'), state: handover && done === participating.length ? 'ok' : handover ? 'wait' : 'todo' },
  ];
  const openCount = openItems(data.cases).filter((w) => (w.issue?.constructIds.split(',') ?? [w.c.constructId]).includes(constructId)).length;
  return { nodes, done, total: participating.length, open: openCount };
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
          <button className="x" aria-label="close" onClick={() => setItems((x) => x.filter((y) => y.id !== i.id))}><X size={14} /></button>
        </div>
      ))}
    </div>
  );
  return { push, view };
}

/** Error text for API errors, translated where we know the cause. */
export function errorText(t: (k: Key | string) => string, e: unknown) {
  const m = e instanceof Error ? e.message : String(e);
  return m === 'NETWORK' ? t('common.offline') : m;
}
