import { useMemo, useState } from 'react';
import { Check, GitFork } from 'lucide-react';
import type { AuditEvent, Snapshot } from '../api';
import { fmtDateTime, relTime, useI18n } from '../i18n';
import { useApp } from '../ui';

/** Which construct an audit event belongs to (construct events carry it in afterValue, MaLo events via the cases). */
export function eventConstructs(e: AuditEvent, data: Snapshot): string[] {
  try {
    const v = JSON.parse(e.afterValue ?? '{}') as { constructId?: string; constructIds?: string[] };
    if (v.constructId) return [v.constructId];
    if (v.constructIds?.length) return v.constructIds;
  } catch { /* not JSON */ }
  return e.maloId ? [...new Set(data.cases.filter((c) => c.maloId === e.maloId).map((c) => c.constructId))] : [];
}

/** What an entry is about: the construct for construct events, otherwise the MaLo. */
export function eventSubject(e: AuditEvent, data: Snapshot): string {
  if (['REGISTER_CONSTRUCT', 'CONFIRM_VSZ', 'SAP_READ', 'VSZ_SETUP'].includes(e.operation)) return eventConstructs(e, data)[0] ?? '';
  return e.maloId ?? '';
}

const tone = (op: string) => (['SET_DORMANT', 'MAINTAIN_EINSPEISE_MEMA', 'CONFIRM_VSZ'].includes(op) ? 'ok' : ['RESOLVE_ISSUE', 'SAP_STATE_UPDATE', 'REACTIVATE', 'REMOVE_FROM_CONSTRUCT', 'CORRECT_TRANSITION', 'REVERSE_TRANSITION'].includes(op) ? 'act' : '');

/** Compact history list, used on the construct page. */
export function HistoryList({ events, limit = 8 }: { events: AuditEvent[]; limit?: number }) {
  const { t, lang } = useI18n();
  const { data, openCase } = useApp();
  const actor = (a: string) => (t(`actor.${a}`) === `actor.${a}` ? a : t(`actor.${a}`));
  const shown = events.filter((e) => e.operation !== 'VALIDATE').slice(0, limit);
  if (!shown.length) return <div className="empty">{t('log.empty')}</div>;
  return (
    <ul className="feed-list">
      {shown.map((e, i) => {
        const c = e.maloId ? data.cases.find((x) => x.maloId === e.maloId) : undefined;
        const tn = tone(e.operation);
        return (
          <li key={e.ID} style={{ ['--i' as string]: i, cursor: c ? 'pointer' : 'default' }} onClick={() => c && openCase(c.caseId)}>
            <span className={`ic ${tn}`}>{tn === 'ok' ? <Check size={12} strokeWidth={3} /> : tn === 'act' ? <GitFork size={12} /> : <span className="pip" />}</span>
            <div>
              <span className={e.maloId ? 'mono' : ''}>{eventSubject(e, data)}</span> {t(`act.${e.operation}`)}
              <small>{actor(e.actor)} · {relTime(lang, e.eventTime)}</small>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** Full audit log (FR-22): every recorded action with filters. */
export function ProtokollPage({ initialConstruct }: { initialConstruct?: string }) {
  const { data, openCase } = useApp();
  const { t, lang } = useI18n();
  const [construct, setConstruct] = useState(initialConstruct ?? '');
  const [operation, setOperation] = useState('');
  const [query, setQuery] = useState('');
  const [showChecks, setShowChecks] = useState(false);
  const actor = (a: string) => (t(`actor.${a}`) === `actor.${a}` ? a : t(`actor.${a}`));

  const operations = useMemo(() => [...new Set(data.events.map((e) => e.operation))].sort(), [data.events]);
  const rows = data.events.filter((e) => {
    if (!showChecks && e.operation === 'VALIDATE') return false;
    if (operation && e.operation !== operation) return false;
    if (construct && !eventConstructs(e, data).includes(construct)) return false;
    if (query && !`${e.maloId ?? ''} ${eventSubject(e, data)} ${e.reason ?? ''} ${e.actor}`.toLowerCase().includes(query.toLowerCase())) return false;
    return true;
  });

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{t('log.title')}</h1>
          <p>{t('log.sub')}</p>
        </div>
      </div>
      <div className="card log-filters">
        <label className="field">{t('log.f.construct')}
          <select value={construct} onChange={(e) => setConstruct(e.target.value)}>
            <option value="">{t('log.f.all')}</option>
            {data.constructs.map((c) => <option key={c.constructId} value={c.constructId}>{c.city} · {c.constructId}</option>)}
          </select>
        </label>
        <label className="field">{t('log.f.action')}
          <select value={operation} onChange={(e) => setOperation(e.target.value)}>
            <option value="">{t('log.f.all')}</option>
            {operations.map((o) => <option key={o} value={o}>{t(`act.${o}`)}</option>)}
          </select>
        </label>
        <label className="field grow">{t('log.f.search')}
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="50539603921" />
        </label>
        <label className="check"><input type="checkbox" checked={showChecks} onChange={(e) => setShowChecks(e.target.checked)} />{t('log.f.checks')}</label>
      </div>
      <div className="card log-table">
        <table>
          <thead><tr><th>{t('log.c.when')}</th><th>{t('log.c.what')}</th><th>{t('log.c.object')}</th><th>{t('log.c.who')}</th><th>{t('log.c.why')}</th></tr></thead>
          <tbody>
            {rows.map((e) => {
              const c = e.maloId ? data.cases.find((x) => x.maloId === e.maloId) : undefined;
              return (
                <tr key={e.ID} onClick={() => c && openCase(c.caseId)} className={c ? 'link' : ''}>
                  <td title={relTime(lang, e.eventTime)}>{fmtDateTime(lang, e.eventTime)}</td>
                  <td><span className={`chip ${tone(e.operation) || 'neutral'}`}>{t(`act.${e.operation}`)}</span></td>
                  <td className={e.maloId ? 'mono' : ''}>{eventSubject(e, data)}</td>
                  <td>{actor(e.actor)}</td>
                  <td className="why">{e.operation === 'SET_DORMANT' || e.operation === 'VALIDATE' ? '' : e.reason}</td>
                </tr>
              );
            })}
            {rows.length === 0 && <tr><td colSpan={5} className="empty">{t('log.empty')}</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
