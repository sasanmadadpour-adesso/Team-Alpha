import { useEffect, useMemo, useState } from 'react';
import { Copy, X } from 'lucide-react';
import { execute, loadPeriods, preview, resolveIssue, updateSapState, type Case, type CaseIssue, type Operation, type OperationResult, type Period, type Resolution } from '../api';
import { fmtDate, fmtDateTime, resultText, useI18n, type Key } from '../i18n';
import { confirmDialog } from '../confirm';
import { humanReason } from './Protokoll';
import { StateIcon, StatusChip, ToneIcon, caseHeadline, errorText, primaryIssue, statusLabel, stepUi, useApp } from '../ui';

const STATUS_INPUT: Record<string, { attribute: 'imsys' | 'abmeldung' | 'mcm'; value: string }> = {
  V10: { attribute: 'imsys', value: 'INSTALLED' },
  V11: { attribute: 'abmeldung', value: 'CONFIRMED' },
  V09: { attribute: 'mcm', value: 'COMPLETED' },
};
type Phase = { kind: 'idle' } | { kind: 'working' } | { kind: 'done'; ruhend: boolean; status: string };

export function CaseDrawer({ caseId, onClose }: { caseId: string; onClose: () => void }) {
  const { data, refresh, toast, openCase } = useApp();
  const { t, lang } = useI18n();
  const [closing, setClosing] = useState(false);
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [periods, setPeriods] = useState<Period[]>([]);
  const c = data.cases.find((x) => x.caseId === caseId);

  const close = () => { setClosing(true); setTimeout(onClose, 200); };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
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

  return (
    <>
      <div className={`scrim ${closing ? 'closing' : ''}`} onClick={close} />
      <aside className={`drawer ${closing ? 'closing' : ''}`} role="dialog" aria-modal="true" aria-label={`MaLo ${c.maloId}`}>
        <div className="d-head">
          <div className="row">
            <StatusChip c={c} animateKey={String(data.loadedAt)} />
            <button className="icon-btn" aria-label={t('common.close')} onClick={close}><X size={18} /></button>
          </div>
          <div className="d-id">{c.maloId}<button className="copy" aria-label={t('common.copy')} onClick={() => { void navigator.clipboard?.writeText(c.maloId); toast(t('common.copied')); }}><Copy size={14} /></button></div>
          <div className="subtle">{t(`role.${c.role}`)} · {c.city} ({c.constructId}) · MeLo <span className="mono">{c.meloId}</span></div>
        </div>

        <div className="d-body">
          {!(phase.kind === 'done' && phase.ruhend) && <section className="d-sec">
            <h4>{t('case.what')}</h4>
            <div className="what">
              <span className={`ic ${head.tone === 'info' ? 'neutral' : head.tone}`}><ToneIcon tone={head.tone} /></span>
              <div>
                <h3>{head.title}</h3>
                <p>{head.text}</p>
                {issues.length > 0 && (
                  <details className="tech"><summary>{t('common.details')}</summary>{issues.map((i) => <p key={i.ID}>{t('case.tech', { rule: i.ruleId, object: i.constructIds.includes(',') ? `${c.maloId} (${i.constructIds.replaceAll(',', ' · ')})` : c.maloId, field: i.field ? ` · ${i.field}` : '' })}</p>)}</details>
                )}
              </div>
            </div>
          </section>}

          {phase.kind === 'working' && <section className="d-sec"><div className="working"><span>{t('case.working')}</span><span className="bar" /></div></section>}
          {phase.kind === 'done' && (
            <section className="d-sec">
              {phase.ruhend ? (
                <div className="success-box">
                  <svg viewBox="0 0 44 44" aria-hidden="true"><circle cx="22" cy="22" r="21" fill="#fff" /><path className="draw" d="M13 23l6 6 12-13" fill="none" stroke="var(--ok)" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  <b>{t('case.done.title')}</b><span>{t('case.done.ruhend')}</span>
                </div>
              ) : <div className="banner act" style={{ margin: 0 }}>{t('case.done.next', { s: phase.status })}</div>}
            </section>
          )}

          {issues.length > 0 && phase.kind !== 'working' && (
            <section className="d-sec">
              <h4>{t('case.actions')}</h4>
              {issues.map((issue, i) => <IssueActions key={issue.ID} issue={issue} c={c} primary={i === 0} run={run} />)}
            </section>
          )}

          <section className="d-sec">
            <h4>{t('case.progress')}</h4>
            <div className="steps-v">
              {c.steps.length === 0 && <p className="subtle">{c.status === 'EXCLUDED' ? c.exclusionReason : t('case.notrun')}</p>}
              {c.steps.map((s, i) => {
                const ui = c.status === 'NEW' ? 'todo' : stepUi(s.id, s.state);
                return (
                  <div key={s.id} className={`sv sv-${ui}`} style={{ ['--i' as string]: i }} title={c.status === 'NEW' ? '' : t(`state.${ui}`)}>
                    <StateIcon state={ui} size={20} />
                    <span>{t(`step.${s.id}`)}</span>
                    <small>{c.status === 'NEW' ? t('state.notrun') : t(`state.${ui}`)}</small>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="d-sec">
            <h4>{t('case.data')}</h4>
            <dl className="kv">
              <dt>{t('common.malo')}</dt><dd className="mono">{c.maloId}</dd>
              <dt>{t('common.melo')}</dt><dd className="mono" style={{ wordBreak: 'break-all' }}>{c.meloId}</dd>
              <dt>{t('common.reststrom')}</dt><dd className="mono">{c.reststromMaloId ?? '—'}</dd>
              {c.feedInMaloId && <><dt>{t('common.einspeise')}</dt><dd className="mono">{c.feedInMaloId}</dd></>}
              <dt>{t('common.stichtag')}</dt><dd>{fmtDate(lang, data.constructs.find((x) => x.constructId === c.constructId)?.stichtag)}</dd>
            </dl>
          </section>

          {rels.length > 0 && (
            <section className="d-sec">
              <h4>{t('case.rels')}</h4>
              <div className="rel-list">
                {rels.map((r) => (
                  <div key={r.ID} className={`rel-row ${r.validToExclusive ? 'closed' : ''}`} style={{ gridTemplateColumns: '64px minmax(0,1fr) auto' }}>
                    <span className="chip info" style={{ justifyContent: 'center' }}>{r.context === 'EINSPEISE_MEMA' ? t('rel.einspeise') : r.kind === 'MEMA' ? 'MeMa' : 'MaMa'}</span>
                    <span className="mono" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }} title={`${r.fromLocationId} → ${r.toLocationId}`}>{r.fromLocationId} → {r.toLocationId}</span>
                    <span className="when">{fmtDate(lang, r.validFrom)} – {r.validToExclusive ? fmtDate(lang, r.validToExclusive) : '31.12.9999'}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {c.kind === 'HOUSEHOLD' && periods.length > 0 && (
            <section className="d-sec">
              <h4>{t('case.periods')}</h4>
              <div className="periods">
                {periods.map((p) => (
                  <div key={p.ID} className={`period ${p.businessState}`}><b>{p.businessState === 'RUHEND' ? t('state.period.RUHEND') : t('state.period.ACTIVE')}</b><span>{p.validFrom ? fmtDate(lang, p.validFrom) : '…'} – {p.validToExclusive ? fmtDate(lang, p.validToExclusive) : '∞'}</span></div>
                ))}
              </div>
            </section>
          )}

          {c.kind === 'HOUSEHOLD' && ['DONE', 'REACTIVATED'].includes(c.status) && <LifecycleActions c={c} />}

          {history.length > 0 && (
            <section className="d-sec">
              <h4>{t('case.history')}</h4>
              <div className="hist">
                {history.map((e) => <div key={e.ID}>{t(`act.${e.operation}`)}{humanReason(e) ? ` — ${humanReason(e)}` : ''}<small>{t(`actor.${e.actor}`) === `actor.${e.actor}` ? e.actor : t(`actor.${e.actor}`)} · {fmtDateTime(lang, e.eventTime)}</small></div>)}
              </div>
            </section>
          )}
        </div>
      </aside>
    </>
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
    <label className={`field ${reasonErr ? 'invalid' : ''}`}>{t('common.reason')}
      <textarea rows={2} value={reason} onChange={(e) => { setReason(e.target.value); setReasonErr(false); }} placeholder={t('common.reason.placeholder')} />
      {reasonErr && <span className="err-text">{t('common.reason.required')}</span>}
    </label>
  );

  // Live validation for corrections, so the clerk sees immediately whether the new value fits.
  const fixHint = useMemo(() => {
    if (issue.field === 'meloId') return { text: t('case.melo.count', { n: value.length }), ok: /^DE[0-9A-Z]{31}$/.test(value) };
    if (issue.field === 'maloId') return { text: t('case.malo.count', { n: value.length }), ok: /^[1-9]\d{10}$/.test(value) };
    return undefined;
  }, [issue.field, value, t]);

  return (
    <div className={`action-card ${primary ? 'primary' : ''}`}>
      <h5>{t(`rule.${issue.ruleId}` as Key)}</h5>

      {allowed.includes('CHOOSE_BUILDING') && (
        <>
          <p>{t('case.choose.q')}</p>
          <div className="compare">
            {issue.constructIds.split(',').map((cid) => {
              const row = data.cases.find((x) => x.maloId === c.maloId && x.constructId === cid);
              const con = data.constructs.find((x) => x.constructId === cid);
              return (
                <div key={cid} className="compare-item">
                  <b>{con?.city} · {cid}</b>
                  <span className="k">MeLo</span><span className="mono" style={{ wordBreak: 'break-all' }}>{row?.meloId}</span>
                  <span className="k">{t('common.reststrom')}</span><span className="mono">{row?.reststromMaloId}</span>
                  <button className="btn sm act" style={{ marginTop: 8 }} onClick={() => need(() => resolveIssue(issue.ID, 'CHOOSE_BUILDING', reason.trim(), cid), (cases) => cases.find((x) => x.maloId === c.maloId && x.constructId === cid)?.caseId)}>{t('case.choose', { c: con?.city ?? cid })}</button>
                </div>
              );
            })}
          </div>
          {reasonField}
        </>
      )}

      {statusInput && statusObject && (
        <>
          <button className="btn act block" onClick={() => void run(() => updateSapState(statusInput.attribute, statusObject, statusInput.value))}>{t(`case.si.${issue.ruleId}` as Key)}</button>
          <p className="subtle">{t('case.si.hint')}</p>
        </>
      )}

      {allowed.includes('FIX_VALUE') && (
        <>
          <label className={`field ${valueErr ? 'invalid' : ''}`}>{t('case.fix.new')} ({issue.field})
            <input className="mono" value={value} onChange={(e) => { setValue(e.target.value.trim()); setValueErr(false); }} placeholder={issue.field === 'meloId' ? 'DE0073325707820000000000000880945' : ''} />
            {fixHint && <span className={`hint ${value ? (fixHint.ok ? 'good' : 'bad') : ''}`}>{fixHint.text}</span>}
            {valueErr && <span className="err-text">{t('err.value')}</span>}
          </label>
          {reasonField}
          <button className="btn act" onClick={() => { if (!value) { setValueErr(true); return; } need(() => resolveIssue(issue.ID, 'FIX_VALUE', reason.trim(), value)); }}>{t('case.fix')}</button>
        </>
      )}

      {allowed.includes('CONFIRM_ASSUMPTION') && (
        <>
          {!statusInput && <>{reasonField}<button className="btn act" onClick={() => need(() => resolveIssue(issue.ID, 'CONFIRM_ASSUMPTION', reason.trim()))}>{t('case.ack')}</button></>}
          {statusInput && (
            <details className="tech" style={{ fontSize: 13.5 }}>
              <summary>{t('case.manual')}</summary>
              <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
                <p className="subtle">{t('case.manual.hint')}</p>
                {reasonField}
                <button className="btn secondary" onClick={() => need(() => resolveIssue(issue.ID, 'CONFIRM_ASSUMPTION', reason.trim()))}>{t('case.manual')}</button>
              </div>
            </details>
          )}
        </>
      )}

      {allowed.includes('EXCLUDE_PARTICIPANT') && (
        <details className="tech" style={{ fontSize: 13.5 }}>
          <summary>{t('case.exclude')}</summary>
          <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
            {reasonField}
            <button className="btn danger-quiet" onClick={() => need(() => resolveIssue(issue.ID, 'EXCLUDE_PARTICIPANT', reason.trim()))}>{t('case.exclude')}</button>
          </div>
        </details>
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
    <section className="d-sec">
      <h4>{t('case.more')}</h4>
      <div className="seg-ops" role="tablist">
        {LIFE.map((o) => <button key={o} className={op === o ? 'on' : ''} onClick={() => { setOp(o); setDate(DEFAULT_DATE[o]); }}>{t(`life.${o}`)}</button>)}
      </div>
      <p className="subtle" style={{ margin: '10px 0' }}>{t(`life.${op}.d`)}</p>
      <div style={{ display: 'grid', gap: 10 }}>
        <label className="field">{t('life.date')}<input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
        {needsRef && (
          <label className="field">{t('life.ref')}
            <select value={ref} onChange={(e) => setRef(e.target.value)}>
              {refs.length === 0 && <option value="">{t('life.noref')}</option>}
              {refs.map((r) => <option key={r.ID} value={r.ID}>{t(`act.${r.operation}`)} · {fmtDate(lang, r.effectiveDate)}</option>)}
            </select>
          </label>
        )}
        {needsReason && <label className="field">{t('common.reason')}<textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t('common.reason.placeholder')} /></label>}
        {result && <div className={`banner ${result.canExecute || result.status === 'SUCCESS' ? 'ok' : 'err'}`} style={{ margin: 0 }}>{resultText(t, result.status === 'SUCCESS' ? 'SIMULATED_SUCCESS' : result.code, op, '')}</div>}
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn secondary" disabled={busy || (needsReason && !reason.trim())} onClick={check}>{t('life.check')}</button>
          <button className="btn primary" disabled={busy || !result?.canExecute} onClick={go}>{busy ? <span className="spin" /> : null}{t('life.run')}</button>
        </div>
      </div>
    </section>
  );
}
