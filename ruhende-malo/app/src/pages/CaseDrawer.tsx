import { useEffect, useMemo, useState } from 'react';
import { Check, Copy, Loader2 } from 'lucide-react';
import { Banner, Field } from '@/components/app/patterns';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import { Gate } from '../auth';
import { execute, loadPeriods, preview, resolveIssue, updateSapState, type Case, type CaseIssue, type Operation, type OperationResult, type Period, type Resolution } from '../api';
import { fmtDate, fmtDateTime, resultText, useI18n, type Key } from '../i18n';
import { confirmDialog } from '../confirm';
import { humanReason } from './Protokoll';
import { StateIcon, StatusChip, ToneBox, caseHeadline, errorText, primaryIssue, statusLabel, stepUi, useApp } from '../ui';

const STATUS_INPUT: Record<string, { attribute: 'imsys' | 'abmeldung' | 'mcm'; value: string }> = {
  V10: { attribute: 'imsys', value: 'INSTALLED' },
  V11: { attribute: 'abmeldung', value: 'CONFIRMED' },
  V09: { attribute: 'mcm', value: 'COMPLETED' },
};
type Phase = { kind: 'idle' } | { kind: 'working' } | { kind: 'done'; ruhend: boolean; status: string };

export function CaseDrawer({ caseId, onClose }: { caseId: string; onClose: () => void }) {
  const { data, refresh, toast, openCase } = useApp();
  const { t, lang } = useI18n();
  const [open, setOpen] = useState(true);
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [periods, setPeriods] = useState<Period[]>([]);
  const c = data.cases.find((x) => x.caseId === caseId);

  const close = () => { setOpen(false); setTimeout(onClose, 200); };
  useEffect(() => { setPhase({ kind: 'idle' }); }, [caseId]);
  useEffect(() => { if (c?.kind === 'HOUSEHOLD') void loadPeriods(c.maloId).then(setPeriods).catch(() => setPeriods([])); }, [c?.maloId, c?.kind, data.loadedAt]);

  if (!c) return null;
  const head = caseHeadline(t, c);

  /** Every action: apply → backend continues automatically → show the new truth. */
  const run = async (fn: () => Promise<unknown>, nextCaseId?: (latest: Case[]) => string | undefined) => {
    setPhase({ kind: 'working' });
    try {
      await fn();
      const [snap] = await Promise.all([refresh(), new Promise((r) => setTimeout(r, 450))]);
      const latest = (snap as { cases: Case[] } | undefined)?.cases ?? [];
      const target = nextCaseId?.(latest) ?? caseId;
      if (target !== caseId) openCase(target);
      const now = latest.find((x) => x.caseId === target);
      setPhase({ kind: 'done', ruhend: now?.status === 'DONE', status: now ? statusLabel(t, now) : '' });
    } catch (e) { setPhase({ kind: 'idle' }); toast(errorText(t, e), 'err'); void refresh(); }
  };

  const issues = [...c.issues].sort((a, b) => (a.ID === primaryIssue(c)?.ID ? -1 : b.ID === primaryIssue(c)?.ID ? 1 : 0));
  const rels = data.relationships.filter((r) => r.fromLocationId === c.maloId || r.toLocationId === c.meloId);
  const history = data.events.filter((e) => e.maloId === c.maloId).slice(0, 12);

  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <section className="grid gap-2.5 border-b px-6 py-4 last:border-b-0"><h4 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">{title}</h4>{children}</section>
  );

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) close(); }}>
      <SheetContent side="right" className="w-full gap-0 overflow-hidden p-0 sm:max-w-[500px]" aria-describedby={undefined}>
        <SheetHeader className="gap-1.5 border-b px-6 py-4 pr-14">
          <div><StatusChip c={c} animateKey={String(data.loadedAt)} /></div>
          <SheetTitle className="flex items-center gap-2 font-mono text-[22px] font-semibold tracking-tight">{c.maloId}
            <Button variant="quiet" size="icon-xs" aria-label={t('common.copy')} onClick={() => { void navigator.clipboard?.writeText(c.maloId); toast(t('common.copied')); }}><Copy /></Button>
          </SheetTitle>
          <SheetDescription className="text-[13px]">{t(`role.${c.role}`)} · {c.city} ({c.constructId}) · MeLo <span className="font-mono text-[0.86em]">{c.meloId}</span></SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {!(phase.kind === 'done' && phase.ruhend) && (
            <Section title={t('case.what')}>
              <div className="grid grid-cols-[36px_1fr] gap-3">
                <ToneBox tone={head.tone === 'info' ? 'neutral' : head.tone} box={36} icon={18} className="rounded-[10px]" />
                <div>
                  <h3 className="text-base">{head.title}</h3>
                  <p className="mt-0.5 text-sm text-muted-foreground">{head.text}</p>
                  {issues.length > 0 && (
                    <Collapsible className="mt-2">
                      <CollapsibleTrigger className="text-[12.5px] text-muted-foreground underline-offset-2 hover:underline">{t('common.details')}</CollapsibleTrigger>
                      <CollapsibleContent>{issues.map((i) => <p key={i.ID} className="mt-1 font-mono text-xs text-muted-foreground">{t('case.tech', { rule: i.ruleId, object: i.constructIds.includes(',') ? `${c.maloId} (${i.constructIds.replaceAll(',', ' · ')})` : c.maloId, field: i.field ? ` · ${i.field}` : '' })}</p>)}</CollapsibleContent>
                    </Collapsible>
                  )}
                </div>
              </div>
            </Section>
          )}

          {phase.kind === 'working' && (
            <Section title={t('case.working')}>
              <div className="relative h-[3px] overflow-hidden rounded-full bg-primary-line"><span className="absolute inset-y-0 w-2/5 animate-indet rounded-full bg-primary" /></div>
            </Section>
          )}
          {phase.kind === 'done' && (
            <div className="border-b px-6 py-4">
              {phase.ruhend ? (
                <div className="grid animate-pop justify-items-center gap-1 rounded-xl bg-ok-soft p-4 text-center text-ok">
                  <svg viewBox="0 0 44 44" className="size-11" aria-hidden="true"><circle cx="22" cy="22" r="21" fill="#fff" /><path d="M13 23l6 6 12-13" fill="none" stroke="var(--ok)" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="60" strokeDashoffset="60" style={{ animation: 'draw 500ms var(--ease) 150ms forwards' }} /></svg>
                  <b>{t('case.done.title')}</b><span className="text-sm">{t('case.done.ruhend')}</span>
                </div>
              ) : <Banner tone="act" className="mb-0">{t('case.done.next', { s: phase.status })}</Banner>}
            </div>
          )}

          {issues.length > 0 && phase.kind !== 'working' && (
            <Section title={t('case.actions')}>
              <Gate><div className="grid gap-3">{issues.map((issue, i) => <IssueActions key={issue.ID} issue={issue} c={c} primary={i === 0} run={run} />)}</div></Gate>
            </Section>
          )}

          <Section title={t('case.progress')}>
            <div className="grid gap-1">
              {c.steps.length === 0 && <p className="text-[13px] text-muted-foreground">{c.status === 'EXCLUDED' ? c.exclusionReason : t('case.notrun')}</p>}
              {c.steps.map((s, i) => {
                const ui = c.status === 'NEW' ? 'todo' : stepUi(s.id, s.state);
                return (
                  <div key={s.id} style={{ animationDelay: `${i * 30}ms` }} title={c.status === 'NEW' ? '' : t(`state.${ui}`)} className="grid animate-rise grid-cols-[20px_1fr_auto] items-center gap-3 py-1 text-sm">
                    <StateIcon state={ui} size={20} />
                    <span className={cn(ui === 'na' && 'text-muted-foreground')}>{t(`step.${s.id}`)}</span>
                    <small className="text-xs text-muted-foreground">{c.status === 'NEW' ? t('state.notrun') : t(`state.${ui}`)}</small>
                  </div>
                );
              })}
            </div>
          </Section>

          <Section title={t('case.data')}>
            <dl className="m-0 grid grid-cols-[110px_1fr] gap-x-3 gap-y-1.5 text-sm">
              {([
                [t('common.malo'), c.maloId, true], [t('common.melo'), c.meloId, true], [t('common.reststrom'), c.reststromMaloId ?? '—', true],
                ...(c.feedInMaloId ? [[t('common.einspeise'), c.feedInMaloId, true] as const] : []),
                [t('common.stichtag'), fmtDate(lang, data.constructs.find((x) => x.constructId === c.constructId)?.stichtag), false],
              ] as (readonly [string, string, boolean])[]).map(([k, v, mono]) => (
                <div key={k} className="contents"><dt className="text-muted-foreground">{k}</dt><dd className={cn('m-0 break-all', mono && 'font-mono text-[0.86em]')}>{v}</dd></div>
              ))}
            </dl>
          </Section>

          {rels.length > 0 && (
            <Section title={t('case.rels')}>
              <div className="grid gap-1.5">
                {rels.map((r) => (
                  <div key={r.ID} className={cn('grid grid-cols-[64px_minmax(0,1fr)_auto] items-center gap-2.5 rounded-md border bg-card px-3 py-2 text-[13px]', r.validToExclusive && 'opacity-60')}>
                    <Badge variant="info" className="justify-center">{r.context === 'EINSPEISE_MEMA' ? t('rel.einspeise') : r.kind === 'MEMA' ? 'MeMa' : 'MaMa'}</Badge>
                    <span className="truncate font-mono text-[0.86em]" title={`${r.fromLocationId} → ${r.toLocationId}`}>{r.fromLocationId} → {r.toLocationId}</span>
                    <span className="text-xs whitespace-nowrap text-muted-foreground">{fmtDate(lang, r.validFrom)} – {r.validToExclusive ? fmtDate(lang, r.validToExclusive) : '31.12.9999'}</span>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {c.kind === 'HOUSEHOLD' && periods.length > 0 && (
            <Section title={t('case.periods')}>
              <div className="grid gap-1.5">
                {periods.map((p) => (
                  <div key={p.ID} className={cn('flex items-center justify-between rounded-md px-3 py-2 text-sm', p.businessState === 'RUHEND' ? 'bg-secondary text-teal-ink' : 'bg-accent text-accent-foreground')}>
                    <b className="font-semibold">{p.businessState === 'RUHEND' ? t('state.period.RUHEND') : t('state.period.ACTIVE')}</b>
                    <span className="text-[13px]">{p.validFrom ? fmtDate(lang, p.validFrom) : '…'} – {p.validToExclusive ? fmtDate(lang, p.validToExclusive) : '∞'}</span>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {c.kind === 'HOUSEHOLD' && ['DONE', 'REACTIVATED'].includes(c.status) && <Gate><LifecycleActions c={c} /></Gate>}

          {history.length > 0 && (
            <Section title={t('case.history')}>
              <div className="grid gap-2">
                {history.map((e) => <div key={e.ID} className="text-sm">{t(`act.${e.operation}`)}{humanReason(e) ? ` — ${humanReason(e)}` : ''}<small className="block text-xs text-muted-foreground">{t(`actor.${e.actor}`) === `actor.${e.actor}` ? e.actor : t(`actor.${e.actor}`)} · {fmtDateTime(lang, e.eventTime)}</small></div>)}
              </div>
            </Section>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ Actions per finding */

function IssueActions({ issue, c, primary, run }: { issue: CaseIssue; c: Case; primary: boolean; run: (fn: () => Promise<unknown>, next?: (cases: Case[]) => string | undefined) => Promise<void> }) {
  const { t } = useI18n();
  const { data } = useApp();
  const allowed = issue.allowedResolutions ? issue.allowedResolutions.split(',') as Resolution[] : [];
  const [reason, setReason] = useState('');
  const [reasonErr, setReasonErr] = useState(false);
  const [value, setValue] = useState('');
  const [valueErr, setValueErr] = useState(false);
  const need = (fn: () => Promise<unknown>, next?: (cases: Case[]) => string | undefined) => {
    if (!reason.trim()) { setReasonErr(true); return; }
    void run(fn, next);
  };
  const statusInput = STATUS_INPUT[issue.ruleId];
  const statusObject = statusInput?.attribute === 'imsys' ? c.meloId : statusInput?.attribute === 'mcm' ? c.feedInMaloId : c.maloId;

  const reasonField = (
    <Field label={t('common.reason')} error={reasonErr ? t('common.reason.required') : undefined}>
      <Textarea rows={2} aria-invalid={reasonErr} value={reason} onChange={(e) => { setReason(e.target.value); setReasonErr(false); }} placeholder={t('common.reason.placeholder')} />
    </Field>
  );

  // Live validation for corrections, so the clerk sees immediately whether the new value fits.
  const fixHint = useMemo(() => {
    if (issue.field === 'meloId') return { text: t('case.melo.count', { n: value.length }), ok: /^DE[0-9A-Z]{31}$/.test(value) };
    if (issue.field === 'maloId') return { text: t('case.malo.count', { n: value.length }), ok: /^[1-9]\d{10}$/.test(value) };
    return undefined;
  }, [issue.field, value, t]);

  const More = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <Collapsible>
      <CollapsibleTrigger className="text-[13.5px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">{label}</CollapsibleTrigger>
      <CollapsibleContent><div className="mt-2 grid gap-2">{children}</div></CollapsibleContent>
    </Collapsible>
  );

  return (
    <div className={cn('grid gap-3 rounded-xl border p-3.5', primary ? 'border-act-line bg-act-soft/40' : 'bg-card')}>
      <h5 className="text-sm font-semibold">{t(`rule.${issue.ruleId}` as Key)}</h5>

      {allowed.includes('CHOOSE_BUILDING') && (
        <>
          <p className="text-sm text-muted-foreground">{t('case.choose.q')}</p>
          <div className="grid grid-cols-2 gap-2.5 max-[520px]:grid-cols-1">
            {issue.constructIds.split(',').map((cid) => {
              const row = data.cases.find((x) => x.maloId === c.maloId && x.constructId === cid);
              const con = data.constructs.find((x) => x.constructId === cid);
              return (
                <div key={cid} className="grid content-start gap-0.5 rounded-lg border bg-card p-3 text-[13px]">
                  <b className="mb-1 text-sm">{con?.city} · {cid}</b>
                  <span className="text-xs text-muted-foreground">MeLo</span><span className="font-mono text-[0.86em] break-all">{row?.meloId}</span>
                  <span className="mt-1 text-xs text-muted-foreground">{t('common.reststrom')}</span><span className="font-mono text-[0.86em]">{row?.reststromMaloId}</span>
                  <Button size="sm" variant="decision" className="mt-2" onClick={() => need(() => resolveIssue(issue.ID, 'CHOOSE_BUILDING', reason.trim(), cid), (cases) => cases.find((x) => x.maloId === c.maloId && x.constructId === cid)?.caseId)}>{t('case.choose', { c: con?.city ?? cid })}</Button>
                </div>
              );
            })}
          </div>
          {reasonField}
        </>
      )}

      {statusInput && statusObject && (
        <>
          <Button variant="decision" className="w-full" onClick={() => void run(() => updateSapState(statusInput.attribute, statusObject, statusInput.value))}>{t(`case.si.${issue.ruleId}` as Key)}</Button>
          <p className="text-[13px] text-muted-foreground">{t('case.si.hint')}</p>
        </>
      )}

      {allowed.includes('FIX_VALUE') && (
        <>
          <Field label={`${t('case.fix.new')} (${issue.field})`} error={valueErr ? t('err.value') : undefined}
            hint={fixHint ? <span className={value ? (fixHint.ok ? 'text-ok' : 'text-err') : ''}>{fixHint.text}</span> : undefined}>
            <Input className="font-mono" aria-invalid={valueErr} value={value} onChange={(e) => { setValue(e.target.value.trim()); setValueErr(false); }} placeholder={issue.field === 'meloId' ? 'DE0073325707820000000000000880945' : ''} />
          </Field>
          {reasonField}
          <Button variant="decision" className="justify-self-start" onClick={() => { if (!value) { setValueErr(true); return; } need(() => resolveIssue(issue.ID, 'FIX_VALUE', reason.trim(), value)); }}>{t('case.fix')}</Button>
        </>
      )}

      {allowed.includes('CONFIRM_ASSUMPTION') && (
        <>
          {!statusInput && <>{reasonField}<Button variant="decision" className="justify-self-start" onClick={() => need(() => resolveIssue(issue.ID, 'CONFIRM_ASSUMPTION', reason.trim()))}>{t('case.ack')}</Button></>}
          {statusInput && (
            <More label={t('case.manual')}>
              <p className="text-[13px] text-muted-foreground">{t('case.manual.hint')}</p>
              {reasonField}
              <Button variant="outline" className="justify-self-start" onClick={() => need(() => resolveIssue(issue.ID, 'CONFIRM_ASSUMPTION', reason.trim()))}>{t('case.manual')}</Button>
            </More>
          )}
        </>
      )}

      {allowed.includes('EXCLUDE_PARTICIPANT') && (
        <More label={t('case.exclude')}>
          {reasonField}
          <Button variant="danger-quiet" className="justify-self-start" onClick={() => need(() => resolveIssue(issue.ID, 'EXCLUDE_PARTICIPANT', reason.trim()))}>{t('case.exclude')}</Button>
        </More>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ Lifecycle after the Umstellung */

const LIFE: Operation[] = ['REACTIVATE', 'REMOVE_FROM_CONSTRUCT', 'CORRECT_TRANSITION', 'REVERSE_TRANSITION'];
const DEFAULT_DATE: Record<string, string> = { REACTIVATE: '2026-12-01', REMOVE_FROM_CONSTRUCT: '2026-12-01', CORRECT_TRANSITION: '2026-10-15', REVERSE_TRANSITION: '2027-01-01' };

function LifecycleActions({ c }: { c: Case }) {
  const { t, lang } = useI18n();
  const { data, refresh, toast } = useApp();
  const [op, setOp] = useState<Operation>(c.status === 'REACTIVATED' ? 'REVERSE_TRANSITION' : 'REACTIVATE');
  const [date, setDate] = useState(DEFAULT_DATE[op]);
  const [reason, setReason] = useState('');
  const [ref, setRef] = useState('');
  const [result, setResult] = useState<OperationResult>();
  const [busy, setBusy] = useState(false);
  const needsRef = op === 'CORRECT_TRANSITION' || op === 'REVERSE_TRANSITION';
  const needsReason = needsRef || op === 'REMOVE_FROM_CONSTRUCT';
  const refs = data.requests.filter((r) => r.maloId === c.maloId && r.status === 'SUCCESS' && ['SET_DORMANT', 'REACTIVATE'].includes(r.operation));
  useEffect(() => { setResult(undefined); }, [op, date, reason, ref]);
  useEffect(() => { if (needsRef && !ref && refs[0]) setRef(refs[0].ID); }, [needsRef, ref, refs]);

  const command = { operation: op, maloId: c.maloId, buildingId: c.constructId, effectiveDate: date, reason: reason.trim() || undefined, referenceOperationId: needsRef ? ref || undefined : undefined };
  const check = async () => { setBusy(true); try { setResult(await preview(command)); } catch (e) { toast(errorText(t, e), 'err'); void refresh(); } setBusy(false); };
  const go = async () => {
    if (!(await confirmDialog(`${t('confirm.life', { op: t(`life.${op}`), m: c.maloId, d: fmtDate(lang, date) })}\n\n${t('confirm.life.d')}`, t))) return;
    setBusy(true);
    try { const r = await execute(command); setResult(r); await refresh(); toast(`${t(`life.${op}`)} · ${r.status === 'SUCCESS' ? '✓' : resultText(t, r.code, op, '')}`, r.status === 'SUCCESS' ? 'ok' : 'err'); }
    catch (e) { toast(errorText(t, e), 'err'); void refresh(); }
    setBusy(false);
  };

  return (
    <section className="grid gap-2.5 border-b px-6 py-4">
      <h4 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">{t('case.more')}</h4>
      <div role="tablist" className="grid grid-cols-4 gap-0.5 rounded-lg bg-muted p-0.5 max-[520px]:grid-cols-2">
        {LIFE.map((o) => <button key={o} role="tab" aria-selected={op === o} onClick={() => { setOp(o); setDate(DEFAULT_DATE[o]); }} className={cn('rounded-md px-1.5 py-1.5 text-[12.5px] font-medium text-muted-foreground transition', op === o && 'bg-card text-primary shadow-card')}>{t(`life.${o}`)}</button>)}
      </div>
      <p className="text-[13px] text-muted-foreground">{t(`life.${op}.d`)}</p>
      <div className="grid gap-2.5">
        <Field label={t('life.date')}><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        {needsRef && (
          <Field label={t('life.ref')}>
            <Select value={ref || undefined} onValueChange={setRef}>
              <SelectTrigger className="w-full"><SelectValue placeholder={t('life.noref')} /></SelectTrigger>
              <SelectContent>{refs.map((r) => <SelectItem key={r.ID} value={r.ID}>{t(`act.${r.operation}`)} · {fmtDate(lang, r.effectiveDate)}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
        )}
        {needsReason && <Field label={t('common.reason')}><Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t('common.reason.placeholder')} /></Field>}
        {result && <Banner tone={result.canExecute || result.status === 'SUCCESS' ? 'ok' : 'err'} className="mb-0">{resultText(t, result.status === 'SUCCESS' ? 'SIMULATED_SUCCESS' : result.code, op, '')}</Banner>}
        <div className="flex gap-2">
          <Button variant="outline" disabled={busy || (needsReason && !reason.trim())} onClick={check}>{t('life.check')}</Button>
          <Button disabled={busy || !result?.canExecute} onClick={go}>{busy && <Loader2 className="animate-spin" />}{t('life.run')}</Button>
        </div>
      </div>
    </section>
  );
}
