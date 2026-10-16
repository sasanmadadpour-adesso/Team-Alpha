import { ArrowLeft, Bot, FileText, Flag, UserRound } from 'lucide-react';
import { PageHeader } from '@/components/app/patterns';
import { Button } from '@/components/ui/button';
import { useI18n } from '../i18n';
import { STAGES, useApp } from '../ui';

/** In-app documentation: exactly what happens in each of the six stages (DE/EN). */
export function StagesPage() {
  const { t } = useI18n();
  const { go } = useApp();
  const rows = (n: number) => [
    { icon: Bot, label: t('stages.auto'), body: <span className="flex flex-wrap gap-1.5">{t(`stage.${n}.auto`).split(' · ').map((x) => <span key={x} className="rounded-md bg-muted px-2 py-0.5 text-[13px]">{x}</span>)}</span> },
    { icon: UserRound, label: t('stages.manual'), body: t(`stage.${n}.manual`) },
    { icon: Flag, label: t('stages.out'), body: t(`stage.${n}.out`) },
    { icon: FileText, label: t('stages.basis'), body: <span className="text-[13px] text-accent-foreground">{t(`stage.${n}.basis`)}</span> },
  ];
  return (
    <>
      <Button variant="quiet" size="sm" className="-ml-2 mb-2" onClick={() => go('/')}><ArrowLeft />{t('nav.overview')}</Button>
      <PageHeader title={t('stages.title')} description={t('stages.sub')} />
      <ol className="m-0 grid list-none gap-3 p-0">
        {STAGES.map((id, i) => {
          const n = i + 1;
          return (
            <li key={id} style={{ animationDelay: `${i * 60}ms` }} className="grid animate-rise grid-cols-[40px_1fr] gap-4 rounded-xl border bg-card p-5 shadow-card">
                <div className="grid size-10 place-items-center rounded-xl bg-accent text-lg font-semibold text-primary">{n}</div>
                <div className="min-w-0">
                  <h2>{t(`stage.${id}`)}</h2>
                  <p className="mt-1 text-muted-foreground">{t(`stage.${n}.what`)}</p>
                  <dl className="mt-3.5 grid gap-3">
                    {rows(n).map((r) => (
                      <div key={r.label} className="grid gap-1 sm:grid-cols-[150px_1fr] sm:gap-4">
                        <dt className="flex items-center gap-2 text-[13px] font-semibold text-muted-foreground"><r.icon size={15} />{r.label}</dt>
                        <dd className="m-0 text-sm">{r.body}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
            </li>
          );
        })}
      </ol>
    </>
  );
}
