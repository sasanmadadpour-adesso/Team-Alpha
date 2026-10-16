import { useState } from 'react';
import { ArrowRight, Check, ChevronRight, GitFork, Inbox, Play, RefreshCw } from 'lucide-react';
import { processAll, type ProcessResult } from '../api';
import { fmtDate, relTime, useI18n } from '../i18n';
import { Rail, Ring, ToneIcon, caseHeadline, constructRail, errorText, openItems, useApp } from '../ui';

export function OverviewPage() {
  const { data, refresh, toast, go } = useApp();
  const { t, lang } = useI18n();
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<ProcessResult>();

  const households = data.cases.filter((c) => c.kind === 'HOUSEHOLD' && !['EXCLUDED', 'NOT_PARTICIPATING'].includes(c.status));
  const uniqueDone = new Set(households.filter((c) => c.status === 'DONE').map((c) => c.maloId)).size;
  const uniqueTotal = new Set(households.map((c) => c.maloId)).size;
  const openUnique = openItems(data.cases).length;
  const processed = data.constructs.some((c) => c.validatedAt);
  const lastRun = data.events.find((e) => e.operation === 'VALIDATE')?.eventTime;

  const run = async () => {
    setRunning(true); setResult(undefined);
    try {
      const [r] = await Promise.all([processAll(), new Promise((res) => setTimeout(res, 650))]);
      await refresh(); setResult(r);
    } catch (e) { toast(errorText(t, e), 'err'); }
    setRunning(false);
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{t('ov.title')}</h1>
          <p>{t('ov.sub', { n: data.constructs.length })}</p>
          {lastRun && <p className="subtle" style={{ marginTop: 4 }}>{t('ov.lastrun', { d: relTime(lang, lastRun) })}</p>}
        </div>
        <button className="btn primary" onClick={run} disabled={running}>
          {running ? <span className="spin" /> : processed ? <RefreshCw size={16} /> : <Play size={16} />}
          {running ? t('ov.running') : processed ? t('ov.rerun') : t('ov.run')}
        </button>
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

      <div className="two-col">
        <div className="grid-constructs">
          {data.constructs.map((c, i) => {
            const rail = constructRail(t, data, c.constructId, running);
            return (
              <article key={c.constructId} className="card c-card" style={{ ['--i' as string]: i }} onClick={() => go(`/konstrukt/${c.constructId}`)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && go(`/konstrukt/${c.constructId}`)}>
                <div className="c-head">
                  <div>
                    <h2>{c.city}</h2>
                    <div className="c-meta"><span>{c.constructId}</span><span>{t('common.reststrom')} <b className="mono">{c.reststromMaloId}</b></span><span>{t('common.stichtag')} <b>{fmtDate(lang, c.stichtag)}</b></span></div>
                  </div>
                  <Ring value={rail.done} total={rail.total} />
                </div>
                <Rail nodes={rail.nodes} running={running} />
                <div className="c-foot">
                  {rail.open ? <span className="chip act"><Inbox size={13} />{t('ov.card.cases', { n: rail.open })}</span> : <span className="subtle">{t('ov.card.nocases')}</span>}
                  <span className="muted" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>{t('ov.card.open')}<ArrowRight size={14} /></span>
                </div>
              </article>
            );
          })}
        </div>
        <NeedsYou />
      </div>
    </>
  );
}

/** The first-page panel: what needs the clerk right now, each with a direct way to act. */
function NeedsYou() {
  const { data, openCase, go } = useApp();
  const { t } = useI18n();
  const items = openItems(data.cases);
  return (
    <aside className="card needs" aria-label={t('ov.needs')}>
      <div className="needs-head"><h2>{t('ov.needs')}</h2>{items.length > 0 && <span className="count">{items.length}</span>}</div>
      {items.length === 0 ? (
        <div className="needs-empty"><span className="ic ok"><Check size={16} strokeWidth={3} /></span><div><b>{t('ov.needs.none')}</b><small>{t('ov.needs.none.d')}</small></div></div>
      ) : (
        <ul>
          {items.slice(0, 5).map((w, i) => {
            const head = caseHeadline(t, w.c, w.issue);
            return (
              <li key={w.issue?.ID ?? w.c.caseId} style={{ ['--i' as string]: i }} onClick={() => openCase(w.c.caseId)} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && openCase(w.c.caseId)}>
                <span className={`ic ${head.tone}`}><ToneIcon tone={head.tone} size={14} /></span>
                <div><b>{head.title}</b><small><span className="mono">{w.issue?.ruleId === 'V14' && w.c.feedInMaloId ? w.c.feedInMaloId : w.c.maloId}</span> · {(w.issue?.constructIds ?? w.c.constructId).replaceAll(',', ' · ')}</small></div>
                <ChevronRight size={16} className="muted" />
              </li>
            );
          })}
        </ul>
      )}
      {items.length > 0 && <button className="needs-all" onClick={() => go('/klaerfaelle')}>{t('ov.needs.all', { n: items.length })}<ArrowRight size={14} /></button>}
    </aside>
  );
}
