import { useMemo, useState } from 'react';
import { type Issue, type Participant, type Resolution, resolveIssue, resolveIssues, updateSapState } from '../api';
import { type PageProps, Chip } from '../App';
import { RULE_TITLE, fmtTime, short, statusTone } from '../lib';

const RESOLUTION_LABEL: Record<string, string> = {
  CHOOSE_BUILDING: 'Choose construct', EXCLUDE_PARTICIPANT: 'Exclude', FIX_VALUE: 'Fix value', CONFIRM_ASSUMPTION: 'Confirm', AUTO_CLEARED: 'Cleared by re-check',
};

export function KorrekturPage({ data, refresh, notify, openMalo, go }: PageProps) {
  const open = data.issues.filter((i) => i.status === 'OPEN' && i.affects !== '[]');
  const notices = data.issues.filter((i) => i.status === 'OPEN' && i.affects === '[]');
  const resolved = data.issues.filter((i) => i.status === 'RESOLVED');
  const groups = useMemo(() => {
    const map = new Map<string, Issue[]>();
    for (const i of open) map.set(i.ruleId, [...(map.get(i.ruleId) ?? []), i]);
    return [...map.entries()];
  }, [open]);

  return (
    <>
      <section className="hero compact">
        <div>
          <h1>Korrektur Daten</h1>
          <p>Findings of the Prüfung that need a human decision. Every decision needs a reason, is audited, and triggers a re-check. Then run the process again.</p>
        </div>
        <div className="controls"><button className="primary" onClick={() => go('process')}>Back to process</button></div>
      </section>

      {groups.length === 0 && <div className="banner ok"><b>Nothing to correct.</b> All findings are resolved.</div>}
      {groups.map(([ruleId, issues]) => <IssueGroup key={ruleId} ruleId={ruleId} issues={issues} participants={data.participants} refresh={refresh} notify={notify} openMalo={openMalo} />)}

      {notices.length > 0 && (
        <details className="log">
          <summary>Notices — do not block ({notices.length})</summary>
          <ul>
            {notices.map((i) => (
              <li key={i.ID} className="resolved-row">
                <span><b>{i.ruleId}</b> {RULE_TITLE[i.ruleId]}</span>
                <span className="mono">{i.objectId}</span>
                <span className="muted">{i.message}</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {resolved.length > 0 && (
        <details className="log">
          <summary>Resolved ({resolved.length})</summary>
          <ul>
            {resolved.map((i) => (
              <li key={i.ID} className="resolved-row">
                <span><b>{i.ruleId}</b> {RULE_TITLE[i.ruleId]}</span>
                <span className="mono">{short(i.objectId, 12)}</span>
                <span className="muted">{RESOLUTION_LABEL[i.resolution ?? ''] ?? i.resolution}{i.resolutionValue ? ` → ${i.resolutionValue}` : ''} · {i.resolvedBy} · {i.resolvedAt ? fmtTime(i.resolvedAt) : ''}{i.reason ? ` · "${i.reason}"` : ''}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </>
  );
}

/** Status input = what another system (MSB, market communication, MCM) would send through POST /updateSapState. */
const STATUS_INPUT: Record<string, { label: string; attribute: 'imsys' | 'abmeldung' | 'mcm'; value: string }> = {
  V10: { label: 'iMSys installed', attribute: 'imsys', value: 'INSTALLED' },
  V11: { label: 'Abmeldung received', attribute: 'abmeldung', value: 'CONFIRMED' },
  V09: { label: 'MCM completed', attribute: 'mcm', value: 'COMPLETED' },
};

function IssueGroup({ ruleId, issues, participants, refresh, notify, openMalo }: { ruleId: string; issues: Issue[]; participants: Participant[] } & Pick<PageProps, 'refresh' | 'notify' | 'openMalo'>) {
  const [reason, setReason] = useState('');
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const bulk = issues.length > 1 && issues.every((i) => i.allowedResolutions.split(',').includes('CONFIRM_ASSUMPTION'));

  const act = async (fn: () => Promise<unknown>, done: string) => {
    setBusy(true);
    try { await fn(); notify(done); setReason(''); await refresh(); } catch (e) { notify(e instanceof Error ? e.message : String(e)); }
    setBusy(false);
  };
  const resolve = (i: Issue, r: Resolution, value?: string) => act(() => resolveIssue(i.ID, r, reason.trim(), value), `${i.ruleId} ${short(i.objectId, 12)}: ${RESOLUTION_LABEL[r]} — re-checked`);

  return (
    <section className="panel issue-group">
      <div className="head">
        <div>
          <h2>{ruleId} · {RULE_TITLE[ruleId] ?? ruleId} <Chip tone={statusTone(issues[0].severity)}>{issues[0].severity}</Chip></h2>
          <span className="muted">{issues[0].checkGroup} · {issues.length} open</span>
        </div>
        {bulk && <button className="dark" disabled={busy || !reason.trim()} onClick={() => act(() => resolveIssues(issues.map((i) => i.ID), 'CONFIRM_ASSUMPTION', reason.trim()), `${ruleId}: ${issues.length} confirmed`)}>Confirm all {issues.length}</button>}
      </div>
      <label className="field reason">Reason for this decision (required)<input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Who confirmed what, and when — e.g. confirmed with the MK7 operator on 12.10.2026" /></label>
      {issues.map((i) => {
        const allowed = i.allowedResolutions ? i.allowedResolutions.split(',') as Resolution[] : [];
        return (
          <div key={i.ID} className="issue">
            <div className="issue-text">
              <button className="link mono" onClick={() => i.objectType === 'MALO' && openMalo(i.objectId)}>{i.objectType === 'CONSTRUCT' ? i.objectId : short(i.objectId, 14)}</button>
              <span className="muted"> · {i.constructIds.replaceAll(',', ', ')}</span>
              <div>{i.message}</div>
            </div>
            <div className="actions">
              {allowed.length === 0 && <span className="muted">Fix via new Anmeldung of the construct</span>}
              {allowed.includes('CHOOSE_BUILDING') && i.constructIds.split(',').map((c) => (
                <button key={c} className="dark" disabled={busy || !reason.trim()} onClick={() => resolve(i, 'CHOOSE_BUILDING', c)}>Belongs to {c}</button>
              ))}
              {allowed.includes('FIX_VALUE') && (
                <span className="fix">
                  <input placeholder={`new ${i.field}`} value={values[i.ID] ?? ''} onChange={(e) => setValues({ ...values, [i.ID]: e.target.value })} />
                  <button className="dark" disabled={busy || !reason.trim() || !values[i.ID]?.trim()} onClick={() => resolve(i, 'FIX_VALUE', values[i.ID].trim())}>Apply</button>
                </span>
              )}
              {STATUS_INPUT[i.ruleId] && (() => {
                const input = STATUS_INPUT[i.ruleId];
                const row = participants.find((p) => p.sourceId === i.sourceId);
                const objectId = input.attribute === 'imsys' ? row?.meloId : input.attribute === 'mcm' ? row?.generationFeedInMaloId : row?.maloId;
                return objectId ? <button className="dark" disabled={busy} title={`Status input via POST /updateSapState (${input.attribute} = ${input.value})`} onClick={() => act(() => updateSapState(input.attribute, objectId, input.value), `${input.label}: ${short(objectId, 12)} — re-checked`)}>{input.label}</button> : null;
              })()}
              {allowed.includes('CONFIRM_ASSUMPTION') && <button className="secondary small" disabled={busy || !reason.trim()} title="Manual override with reason (audited)" onClick={() => resolve(i, 'CONFIRM_ASSUMPTION')}>Confirm manually</button>}
              {allowed.includes('EXCLUDE_PARTICIPANT') && <button className="secondary small" disabled={busy || !reason.trim()} onClick={() => resolve(i, 'EXCLUDE_PARTICIPANT')}>Exclude</button>}
            </div>
          </div>
        );
      })}
    </section>
  );
}
