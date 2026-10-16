import { useState } from 'react';
import type { Snapshot } from '../api';
import { ArrowRight, BookOpen, Check, ChevronRight, GitFork, Loader2, Play, RefreshCw } from 'lucide-react';
import { Banner, PageHeader, StatCard } from '@/components/app/patterns';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { useAuth } from '../auth';
import { processAll, type ProcessResult } from '../api';
import { fmtDate, relTime, useI18n } from '../i18n';
import { Rail, Ring, STAGES, ToneBox, caseHeadline, constructRail, errorText, openItems, useApp } from '../ui';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const STAGE_MS = [380, 420, 620, 460, 620, 420]; // vSZ and the switch take longest: that's where most work happens

export function OverviewPage() {
  const { data: live, refresh, toast, go, pause } = useApp();
  const { t, lang } = useI18n();
  const auth = useAuth();
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<ProcessResult>();
  // During the playback the page still shows the state from before the run; each card reveals its real result stage by stage.
  const [before, setBefore] = useState<Snapshot>();
  const [reveal, setReveal] = useState<Record<string, number>>({});
  const data = before ?? live;

  const households = data.cases.filter((c) => c.kind === 'HOUSEHOLD' && !['EXCLUDED', 'NOT_PARTICIPATING'].includes(c.status));
  const uniqueDone = new Set(households.filter((c) => c.status === 'DONE').map((c) => c.maloId)).size;
  const uniqueTotal = new Set(households.map((c) => c.maloId)).size;
  const openUnique = openItems(data.cases).length;
  const processed = data.constructs.some((c) => c.validatedAt);
  const lastRun = data.events.find((e) => e.operation === 'VALIDATE')?.eventTime;

  const run = async () => {
    setRunning(true); setResult(undefined); setBefore(live); pause(true);
    try {
      const r = await processAll();           // the real run: all rules, writes, read-back, audit (about 0.1 s)
      const fresh = await refresh();          // the real result
      if (!fresh) throw new Error('NETWORK');
      // Play the real result back stage by stage, constructs slightly staggered.
      await Promise.all(live.constructs.map(async (c, i) => {
        await sleep(i * 300);
        for (let stage = 0; stage < STAGES.length; stage++) { setReveal((x) => ({ ...x, [c.constructId]: stage })); await sleep(STAGE_MS[stage]); }
        setReveal((x) => ({ ...x, [c.constructId]: STAGES.length }));
      }));
      await sleep(250);
      setBefore(undefined); setReveal({}); setResult(r);
    } catch (e) { setBefore(undefined); setReveal({}); toast(errorText(t, e), 'err'); }
    pause(false); setRunning(false);
  };

  return (
    <>
      <PageHeader
        title={t('ov.title')}
        description={<>{t('ov.sub', { n: data.constructs.length })}{lastRun && <span className="mt-1 block text-[13px] text-muted-foreground">{t('ov.lastrun', { d: relTime(lang, lastRun) })}</span>}</>}
        actions={<>
          <Button variant="outline" onClick={() => go('/process')}><BookOpen />{t('stages.title')}</Button>
          <Button onClick={run} disabled={running || !auth.write}>
            {running ? <Loader2 className="animate-spin" /> : processed ? <RefreshCw /> : <Play />}
            {running ? t('ov.running') : processed ? t('ov.rerun') : t('ov.run')}
          </Button>
        </>}
      />

      {result && (() => {
        const waiting = result.review + result.blocked;
        const none = result.success === 0 && waiting === 0;
        return (
          <Banner tone={waiting ? 'act' : 'ok'} icon={waiting ? <GitFork size={18} /> : <Check size={18} />} action={waiting > 0 ? <Button size="sm" variant="outline" onClick={() => go('/cases')}>{t('nav.cases')}<ArrowRight /></Button> : undefined}>
            {none ? t('ov.result.none') : t('ov.result', { done: result.success, already: result.alreadyDone, waiting })}
          </Banner>
        );
      })()}

      <div className="mb-[22px] grid grid-cols-4 gap-3 max-[1100px]:grid-cols-2">
        <StatCard value={uniqueDone} total={uniqueTotal} tone="ok" label={<>MaLos {t('ov.kpi.done')}</>} />
        <StatCard value={openUnique} tone={openUnique ? 'act' : undefined} label={<>{t('ov.kpi.cases')} →</>} onClick={() => go('/cases')} />
        <StatCard value={data.relationships.filter((r) => !r.validToExclusive).length} label={t('ov.kpi.rel')} />
        <StatCard value={data.outbox.length} label={t('ov.kpi.handover')} />
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] content-start gap-4">
        {data.constructs.map((c, i) => {
          const finished = !before || (reveal[c.constructId] ?? 0) >= STAGES.length;
          const rail = constructRail(t, finished ? live : data, c.constructId);                 // status line and ring: "before" state until this card has played through
          const anim = before ? constructRail(t, live, c.constructId, false, reveal[c.constructId] ?? 0) : rail; // stages: real result, revealed step by step
          const doing = before && (reveal[c.constructId] ?? 0) < STAGES.length ? STAGES[reveal[c.constructId] ?? 0] : undefined;
          return (
            <Card key={c.constructId} style={{ animationDelay: `${i * 60}ms` }} onClick={() => go(`/constructs/${c.constructId}`)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && go(`/constructs/${c.constructId}`)}
              className="animate-rise cursor-pointer gap-4 p-5 shadow-card transition duration-200 hover:-translate-y-0.5 hover:border-input hover:shadow-lift">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-[17px]">{c.city}</h2>
                  <div className="mt-1 flex flex-wrap gap-x-3.5 text-[13px] text-muted-foreground">
                    <span>{c.constructId}</span>
                    <span>{t('common.reststrom')} <b className="font-mono text-[0.86em] font-medium text-foreground/80">{c.reststromMaloId}</b></span>
                    <span>{t('common.stichtag')} <b className="font-medium text-foreground/80">{fmtDate(lang, c.stichtag)}</b></span>
                  </div>
                </div>
                <Ring value={rail.done} total={rail.total} />
              </div>
              <Rail nodes={anim.nodes} running={!!doing} />
              <ConstructStatus rail={rail} constructId={c.constructId} doing={doing} />
            </Card>
          );
        })}
      </div>
    </>
  );
}


/** What a card says in words: where the construct stands, and the open cases with a direct way in. */
function ConstructStatus({ rail, constructId, doing }: { rail: ReturnType<typeof constructRail>; constructId: string; doing?: string }) {
  const { t } = useI18n();
  const { openCase, go } = useApp();
  const shown = rail.items.slice(0, 3);
  const line = !rail.validated ? t('ov.st.new')
    : rail.total && rail.done === rail.total && rail.open === 0 ? t('ov.st.complete', { n: rail.done, h: rail.handover })
      : rail.total && rail.done === rail.total ? t('ov.st.doneopen', { n: rail.done, o: rail.open })
        : t('ov.st.progress', { d: rail.done, n: rail.total, o: rail.open });
  const tone = !rail.validated ? 'neutral' : rail.open ? 'act' : rail.done === rail.total ? 'ok' : 'wait';
  const DOT: Record<string, string> = { neutral: 'bg-muted-foreground/50', act: 'bg-act', ok: 'bg-ok', wait: 'bg-wait' };
  return (
    <div className="grid cursor-default gap-2 border-t pt-3.5" onClick={(e) => e.stopPropagation()}>
      <div className={cn('flex items-center gap-2 text-sm font-medium', doing && 'text-accent-foreground')}>
        <span className={cn('size-2 shrink-0 rounded-full', doing ? 'animate-pulse bg-primary' : DOT[tone])} />{doing ? t(`ov.do.${doing}`) : line}
      </div>
      {!doing && shown.length > 0 && (
        <ul className="m-0 grid list-none gap-0.5 p-0">
          {shown.map((w) => {
            const head = caseHeadline(t, w.c, w.issue);
            return (
              <li key={w.issue?.ID ?? w.c.caseId} onClick={() => openCase(w.c.caseId)} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && openCase(w.c.caseId)}
                className="-mx-2 grid cursor-pointer grid-cols-[24px_minmax(0,1fr)_auto_16px] items-center gap-2 rounded-md px-2 py-1.5 text-[13.5px] transition-colors hover:bg-accent/60">
                <ToneBox tone={head.tone} />
                <span className="truncate">{head.title}</span>
                <span className="font-mono text-[0.86em] text-muted-foreground">{w.issue?.ruleId === 'V14' && w.c.feedInMaloId ? w.c.feedInMaloId : w.c.maloId}</span>
                <ChevronRight size={15} className="text-muted-foreground" />
              </li>
            );
          })}
        </ul>
      )}
      <div className="flex items-center justify-between gap-3 text-[13.5px]">
        {rail.items.length > 3 ? <button className="text-muted-foreground hover:text-primary" onClick={() => go('/cases')}>{t('ov.st.more', { n: rail.items.length - 3 })}</button> : <span />}
        <button className="inline-flex items-center gap-1.5 font-medium text-foreground hover:text-primary" onClick={() => go(`/constructs/${constructId}`)}>{t('ov.card.open')}<ArrowRight size={14} /></button>
      </div>
    </div>
  );
}
