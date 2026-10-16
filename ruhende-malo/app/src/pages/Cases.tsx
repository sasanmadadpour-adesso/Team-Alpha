import { useMemo, useState } from 'react';
import { ChevronRight } from 'lucide-react';

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
      <div className="page-head">
        <div>
          <h1>{t('cases.title')}</h1>
          <p>{t('cases.sub')}</p>
        </div>
      </div>

      {cases.length === 0 ? (
        <div className="card all-clear">
          <svg viewBox="0 0 72 72" aria-hidden="true"><circle cx="36" cy="36" r="34" fill="var(--ok-soft)" /><path className="draw" d="M22 37l9 9 19-20" fill="none" stroke="var(--ok)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" /></svg>
          <h2>{t('cases.empty.title')}</h2>
          <p className="muted">{t('cases.empty.body')}</p>
        </div>
      ) : (
        <>
          <div className="filters" role="tablist">
            <button className={`filter ${filter === 'ALL' ? 'on' : ''}`} onClick={() => setFilter('ALL')}>{t('cases.filter.all')} <small>{cases.length}</small></button>
            {CATEGORIES.filter((c) => byCat(c).length).map((c) => (
              <button key={c} className={`filter ${filter === c ? 'on' : ''}`} onClick={() => setFilter(c)}>{t(`cases.cat.${c}`)} <small>{byCat(c).length}</small></button>
            ))}
          </div>
          {shown.filter((cat) => byCat(cat).length).map((cat) => (
            <section key={cat} className="case-group">
              <h2>{t(`cases.cat.${cat}`)} <span className="subtle">{byCat(cat).length}</span></h2>
              <div className="case-cards">
                {byCat(cat).map((w, i) => <CaseCard key={w.issue?.ID ?? w.c.caseId} w={w} i={i} onOpen={() => openCase(w.c.caseId)} lang={lang} />)}
              </div>
            </section>
          ))}
        </>
      )}
    </>
  );
}

function CaseCard({ w, i, onOpen, lang }: { w: WorkItem; i: number; onOpen: () => void; lang: 'de' | 'en' }) {
  const { t } = useI18n();
  const { c, issue } = w;
  const head = caseHeadline(t, c, issue);
  const tone = head.tone;
  const constructs = issue?.constructIds.split(',') ?? [c.constructId];
  const since = issue?.createdAt ?? c.since;
  return (
    <article className="card case-card" style={{ ['--i' as string]: i }} onClick={onOpen} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onOpen()}>
      <div className={`bar ${tone === 'wait' ? 'wait' : tone === 'err' ? 'err' : ''}`} />
      <div className="content">
        <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ color: `var(--${tone === 'err' ? 'err' : tone === 'wait' ? 'wait' : 'act'})`, display: 'inline-flex' }}><ToneIcon tone={tone} size={16} /></span>{head.title}</h3>
        <p>{head.text}</p>
        <div className="meta">
          <span className="mono">{issue?.ruleId === 'V14' && c.feedInMaloId ? c.feedInMaloId : c.maloId}</span>
          <span>{constructs.join(' · ')}{constructs.length === 1 && c.city ? ` · ${c.city}` : ''}</span>
          <span>{t(`role.${c.role}`)}</span>
          {since && <span>{t('cases.age', { d: relTime(lang, since) })}</span>}
        </div>
      </div>
      <div className="side"><StatusChip c={c} /><ChevronRight size={18} className="muted" /></div>
    </article>
  );
}
