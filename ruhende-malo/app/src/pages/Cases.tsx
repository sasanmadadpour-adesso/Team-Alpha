import { useMemo, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { PageHeader } from '@/components/app/patterns';
import { Card } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { relTime, useI18n } from '../i18n';
import { StatusChip, ToneIcon, caseHeadline, openItems, useApp, type WorkItem } from '../ui';

const CATEGORIES = ['DECISION', 'CORRECTION', 'STATUS', 'VSZ'] as const;
type Cat = (typeof CATEGORIES)[number];

export function CasesPage() {
  const { data, openCase } = useApp();
  const { t, lang } = useI18n();
  const [filter, setFilter] = useState<Cat | 'ALL'>('ALL');

  const cases = useMemo(() => openItems(data.cases), [data.cases]);
  const byCat = (cat: Cat) => cases.filter((w) => w.category === cat);
  const shown = filter === 'ALL' ? CATEGORIES : [filter];

  return (
    <>
      <PageHeader title={t('cases.title')} description={t('cases.sub')} />

      {cases.length === 0 ? (
        <Card className="items-center gap-2 px-6 py-12 text-center">
          <svg viewBox="0 0 72 72" aria-hidden="true" className="size-[72px]"><circle cx="36" cy="36" r="34" fill="var(--ok-soft)" /><path d="M22 37l9 9 19-20" fill="none" stroke="var(--ok)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="60" strokeDashoffset="60" style={{ animation: 'draw 600ms var(--ease) 200ms forwards' }} /></svg>
          <h2>{t('cases.empty.title')}</h2>
          <p className="text-muted-foreground">{t('cases.empty.body')}</p>
        </Card>
      ) : (
        <>
          <Tabs value={filter} onValueChange={(v) => setFilter(v as Cat | 'ALL')} className="mb-5">
            <TabsList className="h-auto flex-wrap justify-start gap-1 bg-transparent p-0">
              {(['ALL', ...CATEGORIES.filter((c) => byCat(c).length)] as const).map((c) => (
                <TabsTrigger key={c} value={c} className="h-8 flex-none rounded-full border border-input bg-card px-3.5 text-[13.5px] font-medium text-muted-foreground data-[state=active]:border-primary data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-none">
                  {c === 'ALL' ? t('cases.filter.all') : t(`cases.cat.${c}`)} <small className="ml-1 opacity-70">{c === 'ALL' ? cases.length : byCat(c).length}</small>
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          {shown.filter((cat) => byCat(cat).length).map((cat) => (
            <section key={cat} className="mb-7">
              <h2 className="mb-3 text-[15px] text-muted-foreground">{t(`cases.cat.${cat}`)} <span className="ml-1 text-[13px] font-normal">{byCat(cat).length}</span></h2>
              <div className="grid gap-2.5">
                {byCat(cat).map((w, i) => <CaseCard key={w.issue?.ID ?? w.c.caseId} w={w} i={i} onOpen={() => openCase(w.c.caseId)} lang={lang} />)}
              </div>
            </section>
          ))}
        </>
      )}
    </>
  );
}

const BAR: Record<string, string> = { wait: 'bg-wait', err: 'bg-err', act: 'bg-act' };
const ICON: Record<string, string> = { wait: 'text-wait', err: 'text-err', act: 'text-act' };

function CaseCard({ w, i, onOpen, lang }: { w: WorkItem; i: number; onOpen: () => void; lang: 'de' | 'en' }) {
  const { t } = useI18n();
  const { c, issue } = w;
  const head = caseHeadline(t, c, issue);
  const tone = head.tone === 'wait' || head.tone === 'err' ? head.tone : 'act';
  const constructs = issue?.constructIds.split(',') ?? [c.constructId];
  const since = issue?.createdAt ?? c.since;
  return (
    <Card style={{ animationDelay: `${Math.min(i, 10) * 40}ms` }} onClick={onOpen} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onOpen()}
      className="relative animate-rise cursor-pointer flex-row items-center gap-4 overflow-hidden px-5 py-4 shadow-card transition duration-200 hover:border-input hover:shadow-lift">
      <span className={cn('absolute inset-y-0 left-0 w-1', BAR[tone])} />
      <div className="min-w-0 flex-1">
        <h3 className="flex items-center gap-2"><span className={cn('inline-flex', ICON[tone])}><ToneIcon tone={head.tone} size={16} /></span>{head.title}</h3>
        <p className="mt-0.5 text-sm text-muted-foreground">{head.text}</p>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-0.5 text-[12.5px] text-muted-foreground">
          <span className="font-mono">{issue?.ruleId === 'V14' && c.feedInMaloId ? c.feedInMaloId : c.maloId}</span>
          <span>{constructs.join(' · ')}{constructs.length === 1 && c.city ? ` · ${c.city}` : ''}</span>
          <span>{t(`role.${c.role}`)}</span>
          {since && <span>{t('cases.age', { d: relTime(lang, since) })}</span>}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-3"><StatusChip c={c} /><ChevronRight size={18} className="text-muted-foreground" /></div>
    </Card>
  );
}
