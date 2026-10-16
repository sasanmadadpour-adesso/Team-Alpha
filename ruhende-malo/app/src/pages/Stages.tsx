import { ArrowLeft, Bot, FileText, Flag, UserRound } from 'lucide-react';
import { useI18n } from '../i18n';
import { STAGES, useApp } from '../ui';

/** In-app documentation: exactly what happens in each of the six stages (DE/EN). */
export function StagesPage() {
  const { t } = useI18n();
  const { go } = useApp();
  return (
    <>
      <button className="crumb" onClick={() => go('/')}><ArrowLeft size={14} />{t('nav.overview')}</button>
      <div className="page-head">
        <div>
          <h1>{t('stages.title')}</h1>
          <p>{t('stages.sub')}</p>
        </div>
      </div>
      <ol className="stages">
        {STAGES.map((id, i) => {
          const n = i + 1;
          return (
            <li key={id} className="card stage-card" style={{ ['--i' as string]: i }}>
              <div className="stage-num">{n}</div>
              <div className="stage-body">
                <h2>{t(`stage.${id}`)}</h2>
                <p className="stage-what">{t(`stage.${n}.what`)}</p>
                <dl>
                  <div><dt><Bot size={15} />{t('stages.auto')}</dt><dd>{t(`stage.${n}.auto`).split(' · ').map((x) => <span key={x}>{x}</span>)}</dd></div>
                  <div><dt><UserRound size={15} />{t('stages.manual')}</dt><dd>{t(`stage.${n}.manual`)}</dd></div>
                  <div><dt><Flag size={15} />{t('stages.out')}</dt><dd>{t(`stage.${n}.out`)}</dd></div>
                  <div><dt><FileText size={15} />{t('stages.basis')}</dt><dd className="basis">{t(`stage.${n}.basis`)}</dd></div>
                </dl>
              </div>
            </li>
          );
        })}
      </ol>
    </>
  );
}
