import { useState } from 'react';
import { CheckCircle2, FlaskConical, Play, Terminal, XCircle } from 'lucide-react';
import { PageHeader } from '../components/AppShell';
import { Badge, Button, Callout, Card, Disclosure, EmptyState, StatusBadge } from '../components/primitives';
import { type ScenarioCase, type ScenarioResult, parseJson, runScenarioTests } from '../api/maloApi';
import { formatDateTime } from '../lib/domain';

/** Describes what each backend scenario ID actually asserts. */
const DESCRIPTIONS: Record<string, { title: string; text: string }> = {
  'APP-TC01': {
    title: 'Gültige Ruhendstellung wird freigegeben',
    text: 'Eine teilnehmende Haushalts-MaLo mit passendem Reststrom-Ziel und übereinstimmenden Beziehungen muss den Status READY erhalten.',
  },
  'APP-TC02': {
    title: 'Nichtteilnehmer wird übersprungen',
    text: 'Eine Quellzeile mit „Teilnahme MK7 = nein“ darf nicht verarbeitet werden und muss SKIPPED liefern.',
  },
  'APP-TC03': {
    title: 'Mehrdeutige MaLo wird blockiert',
    text: 'Eine MaLo, die zwei Gebäuden mit unterschiedlichen Reststrom-Zielen zugeordnet ist, muss REVIEW liefern — ohne jede Änderung.',
  },
};

/** Coverage that exists only in the Vitest CLI suite, not in the in-app runner. */
const CLI_ONLY = [
  'Fehlende und zusätzliche MeMa-/MaMa-Beziehungen',
  'Konfliktbehaftete MaMa-Ziele',
  'Ungültige und überlappende Zeitscheiben',
  'Blockierender Lieferanten-/Marktstatus (STRICT)',
  'Wiederholte Ausführung (ALREADY_DONE)',
  'Wiederaktivierung, Korrektur und Rücknahme',
  'Stapelverarbeitung und Zusammenfassungen',
  'Import der Arbeitsmappe und Datumskonvertierung',
];

export function TestCenterPage({ onToast }: {
  onToast: (tone: 'success' | 'danger' | 'info' | 'warning', title: string, text?: string) => void;
}) {
  const [result, setResult] = useState<ScenarioResult>();
  const [running, setRunning] = useState(false);
  const [duration, setDuration] = useState<number>();
  const [failure, setFailure] = useState<string>();

  const run = async () => {
    setRunning(true); setFailure(undefined);
    const started = performance.now();
    try {
      const value = await runScenarioTests();
      setResult(value);
      setDuration(Math.round(performance.now() - started));
      onToast(value.failed === 0 ? 'success' : 'danger',
        `Szenarien ausgeführt: ${value.passed} bestanden, ${value.failed} fehlgeschlagen`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Die Szenarien konnten nicht ausgeführt werden.';
      setFailure(message);
      onToast('danger', 'Testlauf fehlgeschlagen', message);
    } finally {
      setRunning(false);
    }
  };

  const cases = parseJson<ScenarioCase[]>(result?.resultsJson, []);

  return (
    <div className="stack">
      <PageHeader
        title="Testcenter"
        description="Führt echte Zusicherungen gegen die gemeinsam genutzte Domänenlogik aus — auf isolierten Fixtures, ohne den Präsentationsstand zu verändern."
        actions={
          <Button variant="primary" icon={<Play size={15} />} busy={running} disabled={running} onClick={run}>
            Tests ausführen
          </Button>
        }
      />

      {failure ? <Callout tone="danger" title="Testlauf fehlgeschlagen">{failure}</Callout> : null}

      <Callout tone="info" title="Was hier ausgeführt wird">
        Der In-App-Runner ruft dieselbe Planungslogik auf, die auch Workbench und Stapellauf verwenden, allerdings
        mit isolierten Fixtures statt der Präsentationsdaten. Ergebnisse werden nie vorbelegt — ohne Klick auf
        „Tests ausführen“ gibt es kein Ergebnis.
      </Callout>

      {result ? (
        <section className="grid-metrics" aria-label="Testzusammenfassung">
          <div className={`metric${result.failed === 0 ? ' metric--success' : ' metric--danger'}`}>
            <span className="metric__label">Gesamtergebnis</span>
            <span className="metric__value">{result.failed === 0 ? 'PASS' : 'FAIL'}</span>
            <span className="metric__hint">{cases.length} Szenarien ausgeführt</span>
          </div>
          <div className="metric metric--success">
            <span className="metric__label">Bestanden</span>
            <span className="metric__value">{result.passed}</span>
          </div>
          <div className={`metric${result.failed > 0 ? ' metric--danger' : ''}`}>
            <span className="metric__label">Fehlgeschlagen</span>
            <span className="metric__value">{result.failed}</span>
          </div>
          <div className="metric">
            <span className="metric__label">Laufzeit</span>
            <span className="metric__value">{duration ?? '—'}<span style={{ fontSize: '1rem' }}> ms</span></span>
            <span className="metric__hint">{formatDateTime(result.executedAt)}</span>
          </div>
        </section>
      ) : null}

      <Card title="Szenarien" subtitle="Jede Zeile vergleicht eine erwartete mit der tatsächlich zurückgegebenen Einstufung." >
        {!result ? (
          <EmptyState
            icon={<FlaskConical size={20} />}
            title="Noch kein Testlauf"
            text="Starten Sie die Szenarien, um echte PASS-/FAIL-Ergebnisse aus der Domänenlogik zu sehen."
            action={<Button variant="primary" icon={<Play size={15} />} onClick={run} busy={running}>Tests ausführen</Button>}
          />
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 'var(--s-3)' }}>
            {cases.map((item) => {
              const info = DESCRIPTIONS[item.id];
              return (
                <li key={item.id} className="check-row" data-tone={item.passed ? 'success' : 'danger'}>
                  {item.passed
                    ? <CheckCircle2 size={16} className="check-row__icon" aria-hidden />
                    : <XCircle size={16} className="check-row__icon" aria-hidden />}
                  <div className="check-row__body">
                    <div className="check-row__title">
                      <span className="mono">{item.id}</span>
                      {info ? <span>{info.title}</span> : null}
                      <StatusBadge tone={item.passed ? 'success' : 'danger'} label={item.passed ? 'PASS' : 'FAIL'} />
                    </div>
                    {info ? <p className="check-row__text">{info.text}</p> : null}
                    <p className="check-row__text">
                      Erwartet: <Badge tone="info">{item.expected}</Badge>{' '}
                      Tatsächlich: <Badge tone={item.passed ? 'success' : 'danger'}>{item.actual}</Badge>
                    </p>
                    {!item.passed ? (
                      <p className="check-row__text strong">
                        Zusicherung fehlgeschlagen: erwartet „{item.expected}“, erhalten „{item.actual}“.
                      </p>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card title="Abdeckung außerhalb der Anwendung" subtitle="Ehrliche Einordnung des In-App-Runners.">
        <div className="stack--sm">
          <Callout tone="warning" title="Der In-App-Runner ist keine Oberfläche für die Vitest-CLI">
            Er führt eine Teilmenge der Domänenszenarien aus. Die vollständige, maßgebliche Suite läuft über
            die Kommandozeile — die Anwendung zeigt bewusst keine zwischengespeicherten CLI-Ergebnisse an.
          </Callout>
          <div className="row" style={{ gap: 'var(--s-2)' }}>
            <Terminal size={14} className="subtle" aria-hidden />
            <code className="mono small">npm test</code>
          </div>
          <Disclosure summary={`Nur in der CLI-Suite abgedeckt (${CLI_ONLY.length})`}>
            <ul className="small muted" style={{ margin: 0, paddingLeft: '1.1rem', display: 'grid', gap: 4 }}>
              {CLI_ONLY.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </Disclosure>
        </div>
      </Card>
    </div>
  );
}
