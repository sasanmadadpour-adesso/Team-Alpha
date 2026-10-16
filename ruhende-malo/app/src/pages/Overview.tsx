import { useState } from 'react';
import type { Snapshot } from '../api';
import { ArrowRight, BookOpen, Check, ChevronRight, GitFork, Play, RefreshCw } from 'lucide-react';
import { processAll, type ProcessResult } from '../api';
import { fmtDate, relTime, useI18n } from '../i18n';
import { Rail, Ring, STAGES, ToneIcon, caseHeadline, constructRail, errorText, openItems, useApp } from '../ui';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const STAGE_MS = [380, 420, 620, 460, 620, 420]; // vSZ and the switch take longest: that's where most work happens

export function OverviewPage() {
  const { data: live, refresh, toast, go, pause } = useApp();
  const { t, lang } = useI18n();
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
      <div className="page-head">
        <div>
          <h1>{t('ov.title')}</h1>
          <p>{t('ov.sub', { n: data.constructs.length })}</p>
          {lastRun && <p className="subtle" style={{ marginTop: 4 }}>{t('ov.lastrun', { d: relTime(lang, lastRun) })}</p>}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn secondary" onClick={() => go('/ablauf')}><BookOpen size={15} />{t('stages.title')}</button>
        <button className="btn primary" onClick={run} disabled={running}>
          {running ? <span className="spin" /> : processed ? <RefreshCw size={16} /> : <Play size={16} />}
          {running ? t('ov.running') : processed ? t('ov.rerun') : t('ov.run')}
        </button>
        </div>
      </div>

      {result && (() => {
        const waiting = result.review + result.blocked;
        const none = result.success === 0 && waiting === 0;
        return (
          <div className={`banner ${waiting ? 'act' : 'ok'}`}>
            {waiting ? <GitFork size={18} /> : <Check size={18} />}
            <span className="grow">{none ? t('ov.result.none') : t('ov.result', { done: result.success, already: result.alreadyDone, waiting })}</span>
            {waiting > 0 && <button className="btn sm secondary" onClick={() => go('/klaerfaelle')}>{t('nav.cases')}<ArrowRight size={14} /></button>}
          </div>
        );
      })()}

      <div className="kpis">
        <div className="card kpi ok"><b>{uniqueDone}<small> / {uniqueTotal}</small></b><span>MaLos {t('ov.kpi.done')}</span></div>
        <div className={`card kpi link ${openUnique ? 'act' : ''}`} role="button" tabIndex={0} onClick={() => go('/klaerfaelle')} onKeyDown={(e) => e.key === 'Enter' && go('/klaerfaelle')}><b>{openUnique}</b><span>{t('ov.kpi.cases')} →</span></div>
        <div className="card kpi"><b>{data.relationships.filter((r) => !r.validToExclusive).length}</b><span>{t('ov.kpi.rel')}</span></div>
        <div className="card kpi"><b>{data.outbox.length}</b><span>{t('ov.kpi.handover')}</span></div>
      </div>

      <div>
        <div className="grid-constructs">
          {data.constructs.map((c, i) => {
            const finished = !before || (reveal[c.constructId] ?? 0) >= STAGES.length;
            const rail = constructRail(t, finished ? live : data, c.constructId);                 // status line and ring: "before" state until this card has played through
            const anim = before ? constructRail(t, live, c.constructId, false, reveal[c.constructId] ?? 0) : rail; // stages: real result, revealed step by step
            const doing = before && (reveal[c.constructId] ?? 0) < STAGES.length ? STAGES[reveal[c.constructId] ?? 0] : undefined;
            return (
              <article key={c.constructId} className="card c-card" style={{ ['--i' as string]: i }} onClick={() => go(`/konstrukt/${c.constructId}`)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && go(`/konstrukt/${c.constructId}`)}>
                <div className="c-head">
                  <div>
                    <h2>{c.city}</h2>
                    <div className="c-meta"><span>{c.constructId}</span><span>{t('common.reststrom')} <b className="mono">{c.reststromMaloId}</b></span><span>{t('common.stichtag')} <b>{fmtDate(lang, c.stichtag)}</b></span></div>
                  </div>
                  <Ring value={rail.done} total={rail.total} />
                </div>
                <Rail nodes={anim.nodes} running={!!doing} />
                <ConstructStatus rail={rail} constructId={c.constructId} doing={doing} />
              </article>
            );
          })}
        </div>
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
  return (
    <div className="c-status" onClick={(e) => e.stopPropagation()}>
      <div className={`c-line ${doing ? 'doing' : tone}`}><span className="dot" />{doing ? t(`ov.do.${doing}`) : line}</div>
      {!doing && shown.length > 0 && (
        <ul className="c-open">
          {shown.map((w) => {
            const head = caseHeadline(t, w.c, w.issue);
            return (
              <li key={w.issue?.ID ?? w.c.caseId} onClick={() => openCase(w.c.caseId)} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && openCase(w.c.caseId)}>
                <span className={`ic ${head.tone}`}><ToneIcon tone={head.tone} size={13} /></span>
                <span className="c-open-t">{head.title}</span>
                <span className="mono subtle">{w.issue?.ruleId === 'V14' && w.c.feedInMaloId ? w.c.feedInMaloId : w.c.maloId}</span>
                <ChevronRight size={15} className="muted" />
              </li>
            );
          })}
        </ul>
      )}
      <div className="c-foot">
        {rail.items.length > 3 ? <button className="link-btn" onClick={() => go('/klaerfaelle')}>{t('ov.st.more', { n: rail.items.length - 3 })}</button> : <span />}
        <button className="link-btn strong" onClick={() => go(`/konstrukt/${constructId}`)}>{t('ov.card.open')}<ArrowRight size={14} /></button>
      </div>
    </div>
  );
}
