import { useMemo, useState } from 'react';
import { Check, GitFork } from 'lucide-react';
import { EmptyState, Field, PageHeader } from '@/components/app/patterns';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import type { ApiCall, AuditEvent, Snapshot } from '../api';
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

/** Operations whose `reason` is text a person typed (everything else is system-generated and not shown). */
const HUMAN_REASON = new Set(['RESOLVE_ISSUE', 'CONFIRM_VSZ', 'REACTIVATE', 'REMOVE_FROM_CONSTRUCT', 'CORRECT_TRANSITION', 'REVERSE_TRANSITION']);
export const humanReason = (e: AuditEvent) => (HUMAN_REASON.has(e.operation) ? e.reason ?? '' : '');

const tone = (op: string): 'ok' | 'act' | 'neutral' => (['SET_DORMANT', 'MAINTAIN_EINSPEISE_MEMA', 'CONFIRM_VSZ'].includes(op) ? 'ok' : ['RESOLVE_ISSUE', 'SAP_STATE_UPDATE', 'REACTIVATE', 'REMOVE_FROM_CONSTRUCT', 'CORRECT_TRANSITION', 'REVERSE_TRANSITION'].includes(op) ? 'act' : 'neutral');

export type FeedItem = { id: string; at: string; kind: 'event'; event: AuditEvent } | { id: string; at: string; kind: 'call'; call: ApiCall };
export const buildFeed = (data: Snapshot): FeedItem[] => {
  const events: FeedItem[] = data.events.filter((e) => e.operation !== 'VALIDATE').map((event) => ({ id: event.ID, at: event.eventTime, kind: 'event' as const, event }));
  const calls: FeedItem[] = data.calls.map((call) => ({ id: call.ID, at: call.at, kind: 'call' as const, call }));
  return [...events, ...calls].sort((a, b) => b.at.localeCompare(a.at));
};


/** Compact history list, used on the construct page. */
export function HistoryList({ events, limit = 8 }: { events: AuditEvent[]; limit?: number }) {
  const { t, lang } = useI18n();
  const { data, openCase } = useApp();
  const actor = (a: string) => (t(`actor.${a}`) === `actor.${a}` ? a : t(`actor.${a}`));
  const shown = events.filter((e) => e.operation !== 'VALIDATE').slice(0, limit);
  if (!shown.length) return <EmptyState>{t('log.empty')}</EmptyState>;
  return (
    <ul className="m-0 list-none p-0">
      {shown.map((e, i) => {
        const c = e.maloId ? data.cases.find((x) => x.maloId === e.maloId) : undefined;
        const tn = tone(e.operation);
        return (
          <li key={e.ID} style={{ animationDelay: `${i * 25}ms` }} onClick={() => c && openCase(c.caseId)} className={cn('grid animate-rise grid-cols-[22px_1fr] gap-2.5 px-5 py-2 text-sm', c && 'cursor-pointer hover:bg-accent/50')}>
            <span className={cn('grid size-[22px] place-items-center rounded-full bg-muted text-muted-foreground', tn === 'ok' && 'bg-ok-soft text-ok', tn === 'act' && 'bg-act-soft text-act')}>{tn === 'ok' ? <Check size={12} strokeWidth={3} /> : tn === 'act' ? <GitFork size={12} /> : <span className="size-[5px] rounded-full bg-current" />}</span>
            <div>
              <span className={cn(e.maloId && 'font-mono text-[0.86em]')}>{eventSubject(e, data)}</span> {t(`act.${e.operation}`)}
              <small className="block text-[12.5px] text-muted-foreground">{actor(e.actor)} · {relTime(lang, e.eventTime)}</small>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** Full audit log (FR-22): every recorded action and API call, with filters. Same feed as the activity panel. */
export function ProtokollPage({ initialConstruct }: { initialConstruct?: string }) {
  const { data, openCase } = useApp();
  const { t, lang } = useI18n();
  const [construct, setConstruct] = useState(initialConstruct ?? '');
  const [operation, setOperation] = useState('');
  const [query, setQuery] = useState('');
  const [showChecks, setShowChecks] = useState(false);
  const [source, setSource] = useState<'all' | 'actions' | 'api'>('all');
  const actor = (a: string) => (t(`actor.${a}`) === `actor.${a}` ? a : t(`actor.${a}`));

  const operations = useMemo(() => [...new Set(data.events.map((e) => e.operation))].sort(), [data.events]);
  const rows = buildFeed(data).filter((it) => {
    if (it.kind === 'call') {
      if (source === 'actions' || operation || construct) return false;
      return !query || `${it.call.path} ${it.call.actor}`.toLowerCase().includes(query.toLowerCase());
    }
    const e = it.event;
    if (source === 'api') return false;
    if (!showChecks && e.operation === 'VALIDATE') return false;
    if (operation && e.operation !== operation) return false;
    if (construct && !eventConstructs(e, data).includes(construct)) return false;
    if (query && !`${e.maloId ?? ''} ${eventSubject(e, data)} ${humanReason(e)} ${e.actor}`.toLowerCase().includes(query.toLowerCase())) return false;
    return true;
  });
  const ALL = '__all__';

  return (
    <>
      <PageHeader title={t('log.title')} description={t('log.sub')} />
      <Card className="mb-3.5 flex-row flex-wrap items-end gap-3.5 px-4 py-3.5 shadow-card">
        <Field label={t('log.f.construct')} className="min-w-[180px]">
          <Select value={construct || ALL} onValueChange={(v) => setConstruct(v === ALL ? '' : v)}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value={ALL}>{t('log.f.all')}</SelectItem>{data.constructs.map((c) => <SelectItem key={c.constructId} value={c.constructId}>{c.city} · {c.constructId}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        <Field label={t('log.f.action')} className="min-w-[180px]">
          <Select value={operation || ALL} onValueChange={(v) => setOperation(v === ALL ? '' : v)}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value={ALL}>{t('log.f.all')}</SelectItem>{operations.map((o) => <SelectItem key={o} value={o}>{t(`act.${o}`)}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        <Field label={t('log.f.source')} className="min-w-[160px]">
          <Select value={source} onValueChange={(v) => setSource(v as typeof source)}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">{t('log.f.all')}</SelectItem><SelectItem value="actions">{t('log.f.actions')}</SelectItem><SelectItem value="api">{t('log.f.api')}</SelectItem></SelectContent>
          </Select>
        </Field>
        <Field label={t('log.f.search')} className="min-w-[200px] flex-1"><Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="50539603921" /></Field>
        <Label className="h-9 gap-2 text-sm font-normal"><Checkbox checked={showChecks} onCheckedChange={(v) => setShowChecks(v === true)} />{t('log.f.checks')}</Label>
      </Card>
      <Card className="gap-0 overflow-hidden py-0 shadow-card">
        <Table>
          <TableHeader><TableRow className="bg-muted/50 hover:bg-muted/50">{(['when', 'what', 'object', 'who', 'why'] as const).map((k) => <TableHead key={k} className="h-10 px-4 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{t(`log.c.${k}`)}</TableHead>)}</TableRow></TableHeader>
          <TableBody>
            {rows.map((it) => {
              if (it.kind === 'call') {
                const c = it.call;
                return (
                  <TableRow key={it.id}>
                    <TableCell className="px-4 whitespace-nowrap" title={relTime(lang, it.at)}>{fmtDateTime(lang, it.at)}</TableCell>
                    <TableCell className="px-4"><Badge variant="info">API</Badge></TableCell>
                    <TableCell className="px-4 font-mono text-[0.86em]">{c.method} {c.path.replace('/api/v1', '')}</TableCell>
                    <TableCell className="px-4">{actor(c.actor)}</TableCell>
                    <TableCell className="px-4 text-muted-foreground"><span className={cn('font-semibold', c.status < 300 ? 'text-teal-ink' : 'text-err')}>{c.status}</span> · {c.durationMs} ms</TableCell>
                  </TableRow>
                );
              }
              const e = it.event;
              const c = e.maloId ? data.cases.find((x) => x.maloId === e.maloId) : undefined;
              return (
                <TableRow key={e.ID} onClick={() => c && openCase(c.caseId)} className={cn(c && 'cursor-pointer')}>
                  <TableCell className="px-4 whitespace-nowrap" title={relTime(lang, e.eventTime)}>{fmtDateTime(lang, e.eventTime)}</TableCell>
                  <TableCell className="px-4"><Badge variant={tone(e.operation)}>{t(`act.${e.operation}`)}</Badge></TableCell>
                  <TableCell className={cn('px-4', e.maloId && 'font-mono text-[0.86em]')}>{eventSubject(e, data)}</TableCell>
                  <TableCell className="px-4">{actor(e.actor)}</TableCell>
                  <TableCell className="max-w-[320px] px-4 whitespace-normal text-muted-foreground">{humanReason(e)}</TableCell>
                </TableRow>
              );
            })}
            {rows.length === 0 && <TableRow><TableCell colSpan={5}><EmptyState>{t('log.empty')}</EmptyState></TableCell></TableRow>}
          </TableBody>
        </Table>
      </Card>
    </>
  );
}
