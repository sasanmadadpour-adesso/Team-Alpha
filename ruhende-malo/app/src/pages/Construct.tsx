import { useState, type ReactNode } from 'react';
import { ArrowLeft, ChevronDown, Download, Loader2, Play, Sun, Wind, Home } from 'lucide-react';
import { Gate, useAuth } from '../auth';
import { confirmVsz, processConstruct, type Case, type Relationship } from '../api';
import { evidenceText, fmtDate, useI18n } from '../i18n';
import { NEEDS_ATTENTION, StateChip, StateIcon, StatusChip, caseHeadline, constructRail, errorText, findingsText, stepUi, useApp, type UiState, type WorkItem } from '../ui';
import { HistoryList, eventConstructs } from './Protokoll';
import { Banner, Field, PageHeader } from '@/components/app/patterns';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

type StepTone = UiState;

export function ConstructPage({ constructId }: { constructId: string }) {
  const { data, refresh, toast, openCase, go } = useApp();
  const { t, lang } = useI18n();
  const auth = useAuth();
  const [busy, setBusy] = useState(false);
  const c = data.constructs.find((x) => x.constructId === constructId);
  if (!c) return <Banner tone="err">{t('err.CONSTRUCT_NOT_FOUND', { construct: constructId })}</Banner>;

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
        <div className="grid gap-3.5">
          {([['co.s.mema', 'co.s.mema.d', 'HOUSEHOLD_MEMA'], ['co.s.mama', 'co.s.mama.d', 'MAMA'], ['co.s.einspeise', 'co.s.einspeise.d', 'EINSPEISE_MEMA']] as const).map(([h, d, ctx]) => (
            <div key={ctx}><h4 className="mb-1.5 text-[13.5px] font-semibold">{t(h)} <span className="ml-1.5 font-normal text-muted-foreground">{t(d, { n: relsOf(ctx).length })}</span></h4><RelList rels={relsOf(ctx)} /></div>
          ))}
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
      <Button variant="quiet" size="sm" className="-ml-2 mb-2" onClick={() => go('/')}><ArrowLeft />{t('co.back')}</Button>
      <PageHeader
        title={<>{c.city} <span className="font-normal text-muted-foreground">· {c.constructId}</span></>}
        description={<span className="flex flex-wrap gap-x-4 text-sm"><span>{t('common.reststrom')} <b className="font-mono text-[0.86em] font-medium text-foreground">{c.reststromMaloId}</b></span><span>{t('common.stichtag')} <b className="font-medium text-foreground">{fmtDate(lang, c.stichtag)}</b></span><span>{c.streetAddress}</span></span>}
        actions={<Button variant="outline" onClick={cont} disabled={busy || !auth.write}>{busy ? <Loader2 className="animate-spin" /> : <Play />}{t('co.continue')}</Button>}
      />

      <div className="grid grid-cols-[minmax(0,1fr)_380px] items-start gap-5 max-[1100px]:grid-cols-1">
        <Card aria-label={t('co.timeline')} className="gap-0 overflow-hidden py-0 shadow-card">
          <GroupHead left={t('co.timeline')} right={<a href="/ablauf">{t('stages.title')} →</a>} />
          {steps.map(({ key, ...s }, i) => <TimelineStep key={key} i={i} {...s} linkOk={s.tone === 'ok' && steps[i + 1]?.tone === 'ok'} />)}
        </Card>
        <Card aria-label={t('co.participants')} className="gap-0 py-1.5 shadow-card">
          {[{ title: t('co.needs'), list: attention }, { title: t('co.done'), list: finished }, { title: t('co.other'), list: rest }].filter((g) => g.list.length).map((g) => (
            <div key={g.title}>
              <GroupHead left={g.title} right={g.list.length} />
              {g.list.map((x, i) => <ParticipantRow key={x.caseId} c={x} i={i} onOpen={() => openCase(x.caseId)} />)}
            </div>
          ))}
          <GroupHead className="mt-2 border-t" left={t('log.construct')} right={<a href={`/protokoll?k=${constructId}`}>{t('log.all')}</a>} />
          <HistoryList events={data.events.filter((e) => eventConstructs(e, data).includes(constructId))} limit={6} />
        </Card>
      </div>
    </>
  );
}

function GroupHead({ left, right, className }: { left: ReactNode; right?: ReactNode; className?: string }) {
  return <div className={cn('flex items-center justify-between px-5 py-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase [&_a]:font-medium [&_a]:normal-case', className)}><span>{left}</span><span>{right}</span></div>;
}

function TimelineStep({ i, n, title, ref, sub, tone, detail, linkOk }: { i: number; n: number; title: string; ref?: string; sub: string; tone: StepTone; detail?: ReactNode; linkOk: boolean }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(tone === 'act' || tone === 'wait');
  return (
    <div style={{ animationDelay: `${i * 60}ms` }} className="relative grid animate-rise grid-cols-[28px_minmax(0,1fr)] gap-3.5 border-t px-5 py-4">
      <div className="relative">
        <StateIcon state={tone} size={28} />
        <span className={cn('absolute top-[34px] -bottom-[22px] left-1/2 w-0.5 -translate-x-1/2 bg-border', linkOk && 'bg-ok')} />
      </div>
      <div className="min-w-0">
        <div className={cn('flex items-start justify-between gap-3', detail && 'cursor-pointer')} onClick={() => detail && setOpen(!open)} role={detail ? 'button' : undefined} aria-expanded={detail ? open : undefined}>
          <div>
            <h3 className="flex flex-wrap items-center gap-2"><span className="grid size-5 place-items-center rounded-md bg-muted text-xs font-semibold text-muted-foreground">{n}</span>{title}{ref && <span className="rounded bg-muted px-1.5 font-mono text-[11.5px] font-normal text-muted-foreground">{ref}</span>}</h3>
            <div className="mt-0.5 text-sm font-medium">{sub}</div>
            <div className="text-[13px] text-muted-foreground">{t(`stage.${n}.what`)}</div>
          </div>
          {detail && <ChevronDown size={18} className={cn('mt-1 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} />}
        </div>
        {open && detail && <div className="mt-3.5 animate-rise">{detail}</div>}
      </div>
    </div>
  );
}

export function ParticipantRow({ c, i, onOpen }: { c: Case; i: number; onOpen: () => void }) {
  const { t } = useI18n();
  const head = caseHeadline(t, c);
  const Icon = c.role === 'Solaranlage' ? Sun : c.role === 'Windkraftanlage' ? Wind : Home;
  return (
    <div style={{ animationDelay: `${Math.min(i, 8) * 30}ms` }} onClick={onOpen} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onOpen()}
      className="grid animate-rise cursor-pointer grid-cols-[32px_minmax(0,1fr)_auto] items-center gap-3 px-5 py-2.5 transition-colors hover:bg-accent/50">
      <span className={cn('grid size-8 place-items-center rounded-full bg-accent text-primary', c.kind === 'GENERATOR' && 'bg-secondary text-teal-ink')}><Icon size={15} /></span>
      <div className="min-w-0">
        <b className="block font-mono text-[0.86em] font-medium">{c.maloId}</b>
        <small className="block truncate text-[12.5px] text-muted-foreground">{NEEDS_ATTENTION.includes(c.status) ? head.title : t(`role.${c.role}`)}</small>
      </div>
      <StatusChip c={c} />
    </div>
  );
}

const ROW = 'grid w-full items-center gap-2.5 rounded-md border bg-card px-3 py-2 text-left text-[13.5px]';

function PrereqList({ cases }: { cases: Case[] }) {
  const { t } = useI18n();
  const { openCase } = useApp();
  return (
    <div className="grid gap-1.5">
      {cases.map((x) => {
        const st = x.steps.find((s) => s.id === 'PREREQ')?.state ?? 'SKIP';
        const ui = stepUi('PREREQ', st);
        return (
          <button key={x.caseId} className={cn(ROW, 'grid-cols-[minmax(0,1fr)_auto] transition-colors hover:bg-accent/50')} onClick={() => openCase(x.caseId)}>
            <span><span className="font-mono text-[0.86em]">{x.maloId}</span> · {t(`role.${x.role}`)}{['WAIT', 'FAIL'].includes(st) ? ` · ${caseHeadline(t, x).title}` : ''}</span>
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
    <div className="grid gap-1.5">
      {items.map((w) => (
        <button key={w.issue?.ID ?? w.c.caseId} className={cn(ROW, 'grid-cols-[minmax(0,1fr)_auto] transition-colors hover:bg-accent/50')} onClick={() => openCase(w.c.caseId)}>
          <span><span className="font-mono text-[0.86em]">{w.issue?.ruleId === 'V14' && w.c.feedInMaloId ? w.c.feedInMaloId : w.c.maloId}</span> · {caseHeadline(t, w.c, w.issue).title}</span>
          <StateChip state={w.category === 'CORRECTION' ? 'err' : 'act'} />
        </button>
      ))}
    </div>
  );
}

function RelList({ rels }: { rels: Relationship[] }) {
  const { t, lang } = useI18n();
  if (!rels.length) return <p className="text-[13px] text-muted-foreground">—</p>;
  return (
    <div className="grid gap-1.5">
      {rels.map((r) => (
        <div key={r.ID} className={cn(ROW, 'grid-cols-[auto_auto_minmax(0,1fr)_auto] max-[640px]:grid-cols-1', r.validToExclusive && 'opacity-60')}>
          <span className="font-mono text-[0.86em]">{r.fromLocationId}</span><span className="text-muted-foreground">→</span>
          <span className="truncate font-mono text-[0.86em]" title={r.toLocationId}>{r.toLocationId}</span>
          <span className="text-[12.5px] whitespace-nowrap text-muted-foreground">{fmtDate(lang, r.validFrom)} – {r.validToExclusive ? fmtDate(lang, r.validToExclusive) : '31.12.9999'}{r.validToExclusive ? ` · ${t('co.rel.closed')}` : ''}</span>
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
      <Banner tone="wait" className="mb-3 text-[13px]">{t('vsz.simnote')}</Banner>
      <div className="grid gap-1.5">
        {items.map((v) => (
          <div key={v.ID} className="grid grid-cols-[40px_minmax(0,1fr)_auto] items-start gap-3 rounded-md border bg-card px-3 py-2.5">
            <span className="pt-0.5 font-mono text-[12.5px] text-primary">{v.step}</span>
            <div className="min-w-0">
              <b className="block text-sm font-semibold">{t(`vsz.${v.itemCode}`) === `vsz.${v.itemCode}` ? v.label : t(`vsz.${v.itemCode}`)}</b>
              {v.evidence && v.status !== 'UNKNOWN' ? <span className="block text-[13px]">{evidenceText(t, v.evidence)}</span> : <span className="block text-[13px] text-muted-foreground">{v.status === 'UNKNOWN' && !v.confirmedBy ? t('vsz.notrun') : evidenceText(t, v.evidence)}</span>}
              <small className="text-xs text-muted-foreground">{t('vsz.page', { p: v.pdfPage })}{v.confirmedBy ? ` · ${t('vsz.via', { who: by(v.confirmedBy) })}` : ''}</small>
            </div>
            <StateChip state={VSZ_UI[v.status] ?? 'todo'} label={t(`vsz.s.${v.status}`)} />
          </div>
        ))}
      </div>
      {open && (
        <Gate>
          <div className="mt-3.5 flex flex-wrap items-end gap-3">
            <Field className="min-w-60 flex-1" label={t('co.s.vsz.evidence')} error={err ? t('common.reason.required') : undefined}>
              <Input value={evidence} aria-invalid={err} onChange={(e) => { setEvidence(e.target.value); setErr(false); }} placeholder={t('co.s.vsz.evidence.ph')} />
            </Field>
            <Button disabled={busy} onClick={async () => {
              if (!evidence.trim()) { setErr(true); return; }
              setBusy(true);
              try { await onConfirm(evidence.trim()); setEvidence(''); } catch (e) { toast(errorText(t, e), 'err'); }
              setBusy(false);
            }}>{busy && <Loader2 className="animate-spin" />}{t('co.s.vsz.confirm')}</Button>
          </div>
        </Gate>
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
    <div className="grid gap-2.5">
      <div className="grid gap-1.5">
        {groups.map(([target, n]) => (
          <div key={target} className={cn(ROW, 'grid-cols-[minmax(0,1fr)_auto]')}><span>{n}× {target}</span><Badge variant="neutral">NOT_IMPLEMENTED</Badge></div>
        ))}
      </div>
      <div><Button size="sm" variant="outline" onClick={csv} disabled={!rels.length}><Download />{t('co.s.csv')}</Button></div>
    </div>
  );
}
