import { useState, type ReactNode } from 'react';
import { ArrowLeft, ChevronDown, Download, Play, Sun, Wind, Home } from 'lucide-react';
import { confirmVsz, processConstruct, type Case, type Relationship } from '../api';
import { evidenceText, fmtDate, useI18n } from '../i18n';
import { NEEDS_ATTENTION, StateChip, StateIcon, StatusChip, caseHeadline, constructRail, errorText, findingsText, stepUi, useApp, type UiState, type WorkItem } from '../ui';
import { HistoryList, eventConstructs } from './Protokoll';

type StepTone = UiState;

export function ConstructPage({ constructId }: { constructId: string }) {
  const { data, refresh, toast, openCase, go } = useApp();
  const { t, lang } = useI18n();
  const [busy, setBusy] = useState(false);
  const c = data.constructs.find((x) => x.constructId === constructId);
  if (!c) return <div className="banner err">{t('err.CONSTRUCT_NOT_FOUND', { construct: constructId })}</div>;

  const cases = data.cases.filter((x) => x.constructId === constructId);
  const rels = data.relationships.filter((r) => r.buildingId === constructId);
  const vsz = data.vsz.filter((v) => v.constructId === constructId);
  const outbox = data.outbox.filter((e) => e.constructId === constructId);
  const households = cases.filter((x) => x.kind === 'HOUSEHOLD');
  const participating = households.filter((x) => !['EXCLUDED', 'NOT_PARTICIPATING'].includes(x.status));
  const done = participating.filter((x) => x.status === 'DONE').length;
  const generators = cases.filter((x) => x.kind === 'GENERATOR' && x.status !== 'EXCLUDED');
  const relsOf = (ctx: string) => rels.filter((r) => r.context === ctx);

  const cont = async () => {
    setBusy(true);
    try { await processConstruct(constructId); await refresh(); } catch (e) { toast(errorText(t, e), 'err'); }
    setBusy(false);
  };

  const rail = constructRail(t, data, constructId);
  const pruefItems = rail.items.filter((w) => w.category === 'DECISION' || w.category === 'CORRECTION'); // exactly the findings counted in the text
  const findings = pruefItems.length;
  const stage = (id: string) => rail.nodes.find((n) => n.id === id)!;
  const tone = (id: string): StepTone => stage(id).state;
  const prereqOf = (x: Case) => x.steps.find((st) => st.id === 'PREREQ');
  const prereqCases = participating.concat(generators).filter((x) => x.steps.length);
  const prereqOk = prereqCases.filter((x) => ['OK', 'DONE'].includes(prereqOf(x)?.state ?? '')).length;

  const steps: { key: string; n: number; title: string; ref?: string; sub: string; tone: StepTone; detail?: ReactNode }[] = [
    { key: 'anm', n: 1, title: t('co.s.anmeldung'), sub: `${c.validatedAt ? t('co.s.anmeldung.ok') : t('co.s.anmeldung.in')} · ${t('co.s.anmeldung.d', { rows: cases.length + 1, src: 'MK7 Teilnehmer', hh: households.length, part: participating.length })}`, tone: tone('ANMELDUNG') },
    { key: 'pru', n: 2, title: t('stage.PRUEFUNG'), sub: !c.validatedAt ? t('co.s.pruefung.not') : findings ? findingsText(t, rail.corr, rail.dec) : t('co.s.pruefung.ok'), tone: tone('PRUEFUNG'),
      detail: findings ? <IssueList items={pruefItems} /> : undefined },
    { key: 'vsz', n: 3, title: t('co.s.vsz'), ref: t('vsz.ref'), sub: c.validatedAt ? t('co.s.vsz.d', { done: c.vszConfirmed, total: c.vszTotal }) : t('co.s.vsz.notread'), tone: tone('VSZ'),
      detail: <VszDetail items={vsz} onConfirm={async (ev) => { await confirmVsz(constructId, ev); await refresh(); toast(t('toast.vsz')); }} /> },
    { key: 'pre', n: 4, title: t('co.s.prereq'), ref: 'FR-09 · FR-11', sub: c.validatedAt ? t('co.s.prereq.d', { ok: prereqOk, total: prereqCases.length }) : t('co.s.prereq.pending'), tone: tone('PREREQ'),
      detail: c.validatedAt ? <PrereqList cases={prereqCases} /> : undefined },
    { key: 'sw', n: 5, title: t('co.s.switch'), ref: '§6.1–6.3', sub: t('co.s.switch.d', { done, total: participating.length, mema: relsOf('HOUSEHOLD_MEMA').length, mama: relsOf('MAMA').length, ein: relsOf('EINSPEISE_MEMA').length }), tone: tone('UMSTELLUNG'),
      detail: (
        <div style={{ display: 'grid', gap: 14 }}>
          <div><h4 className="sub-h">{t('co.s.mema')} <span className="ref">{t('co.s.mema.d', { n: relsOf('HOUSEHOLD_MEMA').length })}</span></h4><RelList rels={relsOf('HOUSEHOLD_MEMA')} /></div>
          <div><h4 className="sub-h">{t('co.s.mama')} <span className="ref">{t('co.s.mama.d', { n: relsOf('MAMA').length })}</span></h4><RelList rels={relsOf('MAMA')} /></div>
          <div><h4 className="sub-h">{t('co.s.einspeise')} <span className="ref">{t('co.s.einspeise.d', { n: relsOf('EINSPEISE_MEMA').length })}</span></h4><RelList rels={relsOf('EINSPEISE_MEMA')} /></div>
        </div>
      ) },
    { key: 'ueb', n: 6, title: t('co.s.uebergabe'), ref: '§5', sub: t('co.s.uebergabe.d', { n: outbox.length }), tone: tone('UEBERGABE'),
      detail: <Handover events={outbox} rels={rels} constructId={constructId} /> },
  ];

  const attention = cases.filter((x) => NEEDS_ATTENTION.includes(x.status));
  const finished = cases.filter((x) => x.status === 'DONE');
  const rest = cases.filter((x) => !NEEDS_ATTENTION.includes(x.status) && x.status !== 'DONE');

  return (
    <>
      <button className="crumb" onClick={() => go('/')}><ArrowLeft size={14} />{t('co.back')}</button>
      <div className="page-head">
        <div>
          <h1>{c.city} <span className="muted" style={{ fontWeight: 400 }}>· {c.constructId}</span></h1>
          <div className="facts">
            <span>{t('common.reststrom')} <b className="mono">{c.reststromMaloId}</b></span>
            <span>{t('common.stichtag')} <b>{fmtDate(lang, c.stichtag)}</b></span>
            <span>{c.streetAddress}</span>
          </div>
        </div>
        <button className="btn secondary" onClick={cont} disabled={busy}>{busy ? <span className="spin" /> : <Play size={15} />}{t('co.continue')}</button>
      </div>

      <div className="co-layout">
        <section className="card timeline" aria-label={t('co.timeline')}>
          <div className="plist-group" style={{ padding: '12px 20px 4px' }}><span>{t('co.timeline')}</span><a href="#/ablauf">{t('stages.title')} →</a></div>
          {steps.map(({ key, ...s }, i) => <TimelineStep key={key} i={i} {...s} linkOk={s.tone === 'ok' && steps[i + 1]?.tone === 'ok'} />)}
        </section>
        <section className="card plist" aria-label={t('co.participants')}>
          {[{ title: t('co.needs'), list: attention }, { title: t('co.done'), list: finished }, { title: t('co.other'), list: rest }].filter((g) => g.list.length).map((g) => (
            <div key={g.title}>
              <div className="plist-group"><span>{g.title}</span><span>{g.list.length}</span></div>
              {g.list.map((x, i) => <ParticipantRow key={x.caseId} c={x} i={i} onOpen={() => openCase(x.caseId)} />)}
            </div>
          ))}
          <div className="plist-group" style={{ borderTop: '1px solid var(--line)', marginTop: 8 }}><span>{t('log.construct')}</span><a href={`#/protokoll?k=${constructId}`}>{t('log.all')}</a></div>
          <HistoryList events={data.events.filter((e) => eventConstructs(e, data).includes(constructId))} limit={6} />
        </section>
      </div>
    </>
  );
}

function TimelineStep({ i, n, title, ref, sub, tone, detail, linkOk }: { i: number; n: number; title: string; ref?: string; sub: string; tone: StepTone; detail?: ReactNode; linkOk: boolean }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(tone === 'act' || tone === 'wait');
  return (
    <div className={`tl-step ${tone} ${linkOk ? 'link-ok' : ''}`} style={{ ['--i' as string]: i }}>
      <div><div className="tl-icon"><StateIcon state={tone} size={28} /></div></div>
      <div className="tl-body">
        <div className="tl-head" onClick={() => detail && setOpen(!open)} role={detail ? 'button' : undefined} aria-expanded={detail ? open : undefined}>
          <div>
            <h3><span className="stage-no">{n}</span>{title}{ref && <span className="ref">{ref}</span>}</h3>
            <div className="tl-sub">{sub}</div>
            <div className="tl-what">{t(`stage.${n}.what`)}</div>
          </div>
          {detail && <ChevronDown size={18} className={`chev ${open ? 'open' : ''}`} />}
        </div>
        {open && detail && <div className="tl-detail">{detail}</div>}
      </div>
    </div>
  );
}

export function ParticipantRow({ c, i, onOpen }: { c: Case; i: number; onOpen: () => void }) {
  const { t } = useI18n();
  const head = caseHeadline(t, c);
  const Icon = c.role === 'Solaranlage' ? Sun : c.role === 'Windkraftanlage' ? Wind : Home;
  return (
    <div className="prow" style={{ ['--i' as string]: i }} onClick={onOpen} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onOpen()}>
      <span className={`avatar ${c.kind === 'GENERATOR' ? 'gen' : ''}`}><Icon size={15} /></span>
      <div className="who">
        <b className="mono">{c.maloId}</b>
        <small>{NEEDS_ATTENTION.includes(c.status) ? head.title : t(`role.${c.role}`)}</small>
      </div>
      <StatusChip c={c} />
    </div>
  );
}

function PrereqList({ cases }: { cases: Case[] }) {
  const { t } = useI18n();
  const { openCase } = useApp();
  return (
    <div className="rel-list">
      {cases.map((x) => {
        const st = x.steps.find((s) => s.id === 'PREREQ')?.state ?? 'SKIP';
        const ui = stepUi('PREREQ', st);
        return (
          <button key={x.caseId} className="rel-row" style={{ gridTemplateColumns: 'minmax(0,1fr) auto', textAlign: 'left' }} onClick={() => openCase(x.caseId)}>
            <span><span className="mono">{x.maloId}</span> · {t(`role.${x.role}`)}{['WAIT', 'FAIL'].includes(st) ? ` · ${caseHeadline(t, x).title}` : ''}</span>
            <StateChip state={ui} />
          </button>
        );
      })}
    </div>
  );
}

function IssueList({ items }: { items: WorkItem[] }) {
  const { t } = useI18n();
  const { openCase } = useApp();
  return (
    <div className="rel-list">
      {items.map((w) => (
        <button key={w.issue?.ID ?? w.c.caseId} className="rel-row" style={{ gridTemplateColumns: 'minmax(0,1fr) auto', textAlign: 'left' }} onClick={() => openCase(w.c.caseId)}>
          <span><span className="mono">{w.issue?.ruleId === 'V14' && w.c.feedInMaloId ? w.c.feedInMaloId : w.c.maloId}</span> · {caseHeadline(t, w.c, w.issue).title}</span>
          <StateChip state={w.category === 'CORRECTION' ? 'err' : 'act'} />
        </button>
      ))}
    </div>
  );
}

function RelList({ rels }: { rels: Relationship[] }) {
  const { t, lang } = useI18n();
  if (!rels.length) return <p className="subtle">—</p>;
  return (
    <div className="rel-list">
      {rels.map((r) => (
        <div key={r.ID} className={`rel-row ${r.validToExclusive ? 'closed' : ''}`}>
          <span className="mono">{r.fromLocationId}</span><span className="arrow">→</span>
          <span className="mono" title={r.toLocationId} style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.toLocationId}</span>
          <span className="when">{fmtDate(lang, r.validFrom)} – {r.validToExclusive ? fmtDate(lang, r.validToExclusive) : '31.12.9999'}{r.validToExclusive ? ` · ${t('co.rel.closed')}` : ''}</span>
        </div>
      ))}
    </div>
  );
}

const VSZ_UI: Record<string, UiState> = { DONE: 'ok', CHECKED: 'ok', CONFIRMED: 'ok', PARTIAL: 'partial', UNKNOWN: 'todo', MISSING: 'err' };

function VszDetail({ items, onConfirm }: { items: { ID: string; itemCode: string; step: string; label: string; status: string; confirmedBy: string | null; pdfPage: string; note: string | null; evidence: string | null }[]; onConfirm: (evidence: string) => Promise<void> }) {
  const { t } = useI18n();
  const { toast } = useApp();
  const [evidence, setEvidence] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);
  const open = items.some((i) => ['UNKNOWN', 'MISSING'].includes(i.status));
  const by = (who: string | null) => (!who ? '' : who === 'Pipeline (Simulation)' ? t('vsz.by.pipeline') : who === 'Datenprüfung' ? t('vsz.by.data') : who === 'DSO-DP (Simulation)' ? t('vsz.by.dsodp') : who);
  return (
    <>
      <p className="sim-note">{t('vsz.simnote')}</p>
      <div className="checklist">
        {items.map((v) => (
          <div key={v.ID} className="check-item">
            <span className="step">{v.step}</span>
            <div>
              <b className="ci-title">{t(`vsz.${v.itemCode}`) === `vsz.${v.itemCode}` ? v.label : t(`vsz.${v.itemCode}`)}</b>
              {v.evidence && v.status !== 'UNKNOWN' ? <span className="ci-result">{evidenceText(t, v.evidence)}</span> : <span className="ci-result muted">{v.status === 'UNKNOWN' && !v.confirmedBy ? t('vsz.notrun') : evidenceText(t, v.evidence)}</span>}
              <small>{t('vsz.page', { p: v.pdfPage })}{v.confirmedBy ? ` · ${t('vsz.via', { who: by(v.confirmedBy) })}` : ''}</small>
            </div>
            <StateChip state={VSZ_UI[v.status] ?? 'todo'} label={t(`vsz.s.${v.status}`)} />
          </div>
        ))}
      </div>
      {open && (
        <div className="inline-form">
          <label className={`field ${err ? 'invalid' : ''}`} style={{ flex: 1, minWidth: 240 }}>{t('co.s.vsz.evidence')}
            <input value={evidence} onChange={(e) => { setEvidence(e.target.value); setErr(false); }} placeholder={t('co.s.vsz.evidence.ph')} />
            {err && <span className="err-text">{t('common.reason.required')}</span>}
          </label>
          <button className="btn primary" disabled={busy} onClick={async () => {
            if (!evidence.trim()) { setErr(true); return; }
            setBusy(true);
            try { await onConfirm(evidence.trim()); setEvidence(''); } catch (e) { toast(errorText(t, e), 'err'); }
            setBusy(false);
          }}>{busy ? <span className="spin" /> : null}{t('co.s.vsz.confirm')}</button>
        </div>
      )}
    </>
  );
}

function Handover({ events, rels, constructId }: { events: { ID: string; eventType: string; targetProcess: string; objectId: string }[]; rels: Relationship[]; constructId: string }) {
  const { t } = useI18n();
  const csv = () => {
    const header = 'constructId;kind;context;from;to;validFrom;validTo;provenance';
    const lines = rels.map((r) => [r.buildingId, r.kind, r.context, r.fromLocationId, r.toLocationId, r.validFrom, r.validToExclusive ?? '9999-12-31', r.provenance].join(';'));
    const url = URL.createObjectURL(new Blob([[header, ...lines].join('\n')], { type: 'text/csv' }));
    const a = document.createElement('a'); a.href = url; a.download = `beziehungen_${constructId}.csv`; a.click(); URL.revokeObjectURL(url);
  };
  const groups = Object.entries(events.reduce<Record<string, number>>((acc, e) => ({ ...acc, [e.targetProcess]: (acc[e.targetProcess] ?? 0) + 1 }), {}));
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div className="rel-list">
        {groups.map(([target, n]) => (
          <div key={target} className="rel-row" style={{ gridTemplateColumns: 'minmax(0,1fr) auto' }}><span>{n}× {target}</span><span className="chip neutral">NOT_IMPLEMENTED</span></div>
        ))}
      </div>
      <div><button className="btn sm secondary" onClick={csv} disabled={!rels.length}><Download size={14} />{t('co.s.csv')}</button></div>
    </div>
  );
}
