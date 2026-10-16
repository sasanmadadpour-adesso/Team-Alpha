import { useState, type ReactNode } from 'react';
import { ArrowLeft, Check, ChevronDown, Clock, Download, GitFork, Play, Sun, Wind, Home } from 'lucide-react';
import { confirmVsz, processConstruct, type Case, type Relationship } from '../api';
import { fmtDate, useI18n } from '../i18n';
import { NEEDS_ATTENTION, StatusChip, caseHeadline, errorText, useApp } from '../ui';
import { HistoryList, eventConstructs } from './Protokoll';

type StepTone = 'ok' | 'wait' | 'act' | 'todo';

export function ConstructPage({ constructId }: { constructId: string }) {
  const { data, refresh, toast, openCase, go } = useApp();
  const { t, lang } = useI18n();
  const [busy, setBusy] = useState(false);
  const c = data.constructs.find((x) => x.constructId === constructId);
  if (!c) return <div className="banner err">Konstrukt {constructId} nicht gefunden.</div>;

  const cases = data.cases.filter((x) => x.constructId === constructId);
  const rels = data.relationships.filter((r) => r.buildingId === constructId);
  const vsz = data.vsz.filter((v) => v.constructId === constructId);
  const outbox = data.outbox.filter((e) => e.constructId === constructId);
  const households = cases.filter((x) => x.kind === 'HOUSEHOLD');
  const participating = households.filter((x) => !['EXCLUDED', 'NOT_PARTICIPATING'].includes(x.status));
  const done = participating.filter((x) => x.status === 'DONE').length;
  const generators = cases.filter((x) => x.kind === 'GENERATOR' && x.status !== 'EXCLUDED');
  const findings = new Set(cases.flatMap((x) => x.issues.map((i) => i.ID))).size;
  const relsOf = (ctx: string) => rels.filter((r) => r.context === ctx);
  const memaTone = (n: number, expected: number): StepTone => (n === 0 ? 'todo' : n >= expected ? 'ok' : 'wait');

  const cont = async () => {
    setBusy(true);
    try { await processConstruct(constructId); await refresh(); } catch (e) { toast(errorText(t, e), 'err'); }
    setBusy(false);
  };

  const steps: { key: string; title: string; ref?: string; sub: string; tone: StepTone; detail?: ReactNode }[] = [
    { key: 'anm', title: t('co.s.anmeldung'), sub: t('co.s.anmeldung.d', { rows: cases.length + 1, src: 'MK7 Teilnehmer', hh: households.length, part: participating.length }), tone: 'ok' },
    { key: 'pru', title: t('co.s.pruefung'), sub: !c.validatedAt ? t('co.s.pruefung.not') : findings ? t('co.s.pruefung.open', { n: findings }) : t('co.s.pruefung.ok'), tone: !c.validatedAt ? 'todo' : findings ? 'act' : 'ok',
      detail: findings ? <IssueList cases={cases.filter((x) => x.issues.length)} /> : undefined },
    { key: 'vsz', title: t('co.s.vsz'), ref: 'PDF 1–4.7', sub: t('co.s.vsz.d', { done: c.vszConfirmed, total: c.vszTotal }), tone: c.vszConfirmed === c.vszTotal ? 'ok' : 'wait',
      detail: <VszDetail items={vsz} onConfirm={async (ev) => { await confirmVsz(constructId, ev); await refresh(); toast(t('toast.vsz')); }} /> },
    { key: 'mema', title: t('co.s.mema'), ref: '§6.1', sub: t('co.s.mema.d', { n: relsOf('HOUSEHOLD_MEMA').length }), tone: memaTone(relsOf('HOUSEHOLD_MEMA').length, participating.length), detail: <RelList rels={relsOf('HOUSEHOLD_MEMA')} /> },
    { key: 'mama', title: t('co.s.mama'), ref: '§6.2', sub: t('co.s.mama.d', { n: relsOf('MAMA').length }), tone: memaTone(relsOf('MAMA').length, participating.length), detail: <RelList rels={relsOf('MAMA')} /> },
    { key: 'ein', title: t('co.s.einspeise'), ref: '§6.3', sub: t('co.s.einspeise.d', { n: relsOf('EINSPEISE_MEMA').length }), tone: generators.length === 0 ? 'ok' : generators.every((g) => g.status === 'DONE') ? 'ok' : relsOf('EINSPEISE_MEMA').length ? 'wait' : generators.some((g) => NEEDS_ATTENTION.includes(g.status)) ? 'act' : 'todo', detail: <RelList rels={relsOf('EINSPEISE_MEMA')} /> },
    { key: 'ruh', title: t('co.s.ruhend'), sub: t('co.s.ruhend.d', { done, total: participating.length }), tone: participating.length && done === participating.length ? 'ok' : done ? 'wait' : 'todo' },
    { key: 'ueb', title: t('co.s.uebergabe'), ref: '§5', sub: t('co.s.uebergabe.d', { n: outbox.length }), tone: outbox.length ? (done === participating.length ? 'ok' : 'wait') : 'todo',
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

function TimelineStep({ i, title, ref, sub, tone, detail, linkOk }: { i: number; title: string; ref?: string; sub: string; tone: StepTone; detail?: ReactNode; linkOk: boolean }) {
  const [open, setOpen] = useState(tone === 'act' || tone === 'wait');
  const icon = tone === 'ok' ? <Check size={14} strokeWidth={3} /> : tone === 'act' ? <GitFork size={13} /> : tone === 'wait' ? <Clock size={13} /> : null;
  return (
    <div className={`tl-step ${tone} ${linkOk ? 'link-ok' : ''}`} style={{ ['--i' as string]: i }}>
      <div><div className="tl-icon">{icon}</div></div>
      <div className="tl-body">
        <div className="tl-head" onClick={() => detail && setOpen(!open)} role={detail ? 'button' : undefined} aria-expanded={detail ? open : undefined}>
          <div>
            <h3>{title}{ref && <span className="ref">{ref}</span>}</h3>
            <div className="tl-sub">{sub}</div>
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

function IssueList({ cases }: { cases: Case[] }) {
  const { t } = useI18n();
  const { openCase } = useApp();
  return (
    <div className="rel-list">
      {cases.map((c) => (
        <button key={c.caseId} className="rel-row" style={{ gridTemplateColumns: 'minmax(0,1fr) auto', textAlign: 'left' }} onClick={() => openCase(c.caseId)}>
          <span><span className="mono">{c.maloId}</span> · {caseHeadline(t, c).title}</span>
          <StatusChip c={c} />
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

function VszDetail({ items, onConfirm }: { items: { ID: string; step: string; label: string; status: string; confirmedBy: string | null; pdfPage: string; note: string | null }[]; onConfirm: (evidence: string) => Promise<void> }) {
  const { t } = useI18n();
  const { toast } = useApp();
  const [evidence, setEvidence] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);
  const open = items.some((i) => i.status !== 'CONFIRMED');
  return (
    <>
      <div className="checklist">
        {items.map((v) => (
          <div key={v.ID} className="check-item">
            <span className="step">{v.step}</span>
            <div>{v.label}<small>PDF S. {v.pdfPage}{v.note ? ` · ${v.note}` : ''}{v.confirmedBy ? ` · ${v.confirmedBy}` : ''}</small></div>
            {v.status === 'CONFIRMED' ? <span className="chip ok"><Check size={12} strokeWidth={3} /></span> : <span className="chip wait">?</span>}
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
