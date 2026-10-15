/**
 * Presentation-level vocabulary and formatting.
 * No business rules live here — only how backend values are labelled and toned.
 */

export type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

/* --------------------------------- Status --------------------------------- */

const STATUS: Record<string, { label: string; tone: Tone; explain: string }> = {
  SUCCESS: { label: 'Erfolgreich (simuliert)', tone: 'success', explain: 'Die Änderung wurde in SQLite geschrieben und zurückgelesen. Keine SAP-Bestätigung.' },
  SIMULATED_SUCCESS: { label: 'Erfolgreich (simuliert)', tone: 'success', explain: 'Die Änderung wurde in SQLite geschrieben und zurückgelesen. Keine SAP-Bestätigung.' },
  READY: { label: 'Bereit', tone: 'info', explain: 'Alle Prüfungen bestanden. Die Ausführung muss noch bestätigt werden.' },
  ALREADY_DONE: { label: 'Bereits erledigt', tone: 'info', explain: 'Dieser Vorgang wurde mit identischen Daten bereits durchgeführt.' },
  SKIPPED: { label: 'Übersprungen', tone: 'neutral', explain: 'Die MaLo ist kein gültiges Ziel für diesen Vorgang. Es wurde nichts geändert.' },
  BLOCKED: { label: 'Blockiert', tone: 'danger', explain: 'Mindestens eine Voraussetzung ist nicht erfüllt. Es wurde nichts geändert.' },
  REVIEW: { label: 'Prüfung nötig', tone: 'warning', explain: 'Die Identität oder Zuordnung ist mehrdeutig und muss manuell geklärt werden.' },
  ERROR: { label: 'Fehler', tone: 'danger', explain: 'Ein technischer Fehler ist aufgetreten. Es wurde kein Erfolg gemeldet.' },
  PROCESSING: { label: 'In Verarbeitung', tone: 'info', explain: 'Der Vorgang läuft.' },
  NEW: { label: 'Neu', tone: 'neutral', explain: 'Der Vorgang wurde angelegt.' },
};

export const statusMeta = (status: string | undefined) =>
  STATUS[status ?? ''] ?? { label: status ?? '—', tone: 'neutral' as Tone, explain: '' };

/* --------------------------- Check results -------------------------------- */

const CHECK_RESULT: Record<string, { label: string; tone: Tone }> = {
  PASSED: { label: 'PASS', tone: 'success' },
  FAILED: { label: 'FAIL', tone: 'danger' },
  UNKNOWN: { label: 'UNBEKANNT', tone: 'warning' },
  ASSUMED: { label: 'ANNAHME', tone: 'warning' },
};
export const checkResultMeta = (result: string) =>
  CHECK_RESULT[result] ?? { label: result, tone: 'neutral' as Tone };

const CONFIDENCE: Record<string, { label: string; tone: Tone; explain: string }> = {
  VERIFIED_SIMULATED: { label: 'SIMULIERT GEPRÜFT', tone: 'success', explain: 'Gegen die lokalen, aus der Arbeitsmappe abgeleiteten Daten geprüft.' },
  ASSUMED_DEMO: { label: 'ASSUMED_DEMO', tone: 'warning', explain: 'Bewusst für die Demo angenommen. Nicht in SAP verifiziert.' },
  UNKNOWN: { label: 'UNBEKANNT', tone: 'warning', explain: 'Es liegt kein belastbarer Nachweis vor. Keine Freigabe.' },
  FAILED: { label: 'FEHLGESCHLAGEN', tone: 'danger', explain: 'Die Prüfung ist fehlgeschlagen und blockiert den Vorgang.' },
};
export const confidenceMeta = (value: string) =>
  CONFIDENCE[value] ?? { label: value, tone: 'neutral' as Tone, explain: '' };

/** Human-readable German names for the backend check codes. */
export const CHECK_LABEL: Record<string, string> = {
  EFFECTIVE_DATE: 'Stichtag',
  IDENTITY: 'Eindeutige MaLo-Identität',
  PARTICIPATION: 'MK7-Teilnahme',
  RESTSTROM_TARGET: 'Reststrom-MaLo',
  LIFECYCLE_INTERVAL: 'Zeitscheiben',
  LIFECYCLE_STATE: 'Lebenszyklus-Status',
  RELATIONSHIP_RECONCILIATION: 'MeMa-/MaMa-Abgleich',
  VSZ_READINESS: 'vSZ-Bereitschaft',
  MASTER_DATA: 'Stammdaten',
  SUPPLIER_MARKET_STATUS: 'Lieferanten-/Marktstatus',
  LIFECYCLE_VALIDATION: 'Lebenszyklus-Validierung',
};
export const checkLabel = (code: string) => CHECK_LABEL[code] ?? code;

/* -------------------------------- Operations ------------------------------ */

export type OperationKey =
  | 'setDormant' | 'reactivate' | 'removeFromConstruct' | 'correctTransition' | 'reverseTransition';

export interface OperationMeta {
  key: OperationKey;
  label: string;
  verb: string;
  intent: string;
  requiresReference: boolean;
  requiresReason: boolean;
  usesPrerequisiteProfile: boolean;
  fromState?: 'ACTIVE' | 'RUHEND';
}

export const OPERATIONS: OperationMeta[] = [
  {
    key: 'setDormant', label: 'Ruhendstellung', verb: 'Ruhendstellung ausführen',
    intent: 'Setzt die Marktlokation zum Stichtag von ACTIVE auf RUHEND (simuliert).',
    requiresReference: false, requiresReason: false, usesPrerequisiteProfile: true, fromState: 'ACTIVE',
  },
  {
    key: 'reactivate', label: 'Wiederaktivierung', verb: 'Wiederaktivierung ausführen',
    intent: 'Setzt eine ruhende Marktlokation zum Stichtag zurück auf ACTIVE. Frühere Zeitscheiben bleiben erhalten.',
    requiresReference: false, requiresReason: false, usesPrerequisiteProfile: false, fromState: 'RUHEND',
  },
  {
    key: 'removeFromConstruct', label: 'Herauslösung', verb: 'Herauslösung ausführen',
    intent: 'Beendet die MeMa-/MaMa-Beziehungen im MK7-Konstrukt zum Stichtag. Der Geschäftsstatus bleibt unverändert.',
    requiresReference: false, requiresReason: true, usesPrerequisiteProfile: false,
  },
  {
    key: 'correctTransition', label: 'Korrektur', verb: 'Korrektur ausführen',
    intent: 'Verschiebt den Stichtag eines bereits ausgeführten Vorgangs. Die Historie bleibt vollständig erhalten.',
    requiresReference: true, requiresReason: true, usesPrerequisiteProfile: false,
  },
  {
    key: 'reverseTransition', label: 'Rücknahme', verb: 'Rücknahme ausführen',
    intent: 'Gleicht einen früheren Vorgang durch eine gegenläufige Zustandsänderung aus. Nichts wird gelöscht.',
    requiresReference: true, requiresReason: true, usesPrerequisiteProfile: false,
  },
];

export const operationMeta = (key: OperationKey) =>
  OPERATIONS.find((item) => item.key === key) ?? OPERATIONS[0];

/** Backend operation codes as stored in ProcessRequests/AuditEvents. */
export const OPERATION_CODE_LABEL: Record<string, string> = {
  SET_DORMANT: 'Ruhendstellung',
  REACTIVATE: 'Wiederaktivierung',
  REMOVE_FROM_CONSTRUCT: 'Herauslösung',
  CORRECT_TRANSITION: 'Korrektur',
  REVERSE_TRANSITION: 'Rücknahme',
};
export const operationCodeLabel = (code: string) => OPERATION_CODE_LABEL[code] ?? code;

/* ---------------------------------- Roles --------------------------------- */

export const ROLE_HOUSEHOLD = 'Haushaltsverbrauch';
export const ROLE_RESTSTROM = 'Marktlokation Reststrom';
export const GENERATION_ROLES = new Set(['Solaranlage', 'Windkraftanlage']);

export const roleTone = (role: string): Tone =>
  role === ROLE_RESTSTROM ? 'info' : GENERATION_ROLES.has(role) ? 'success' : 'neutral';

export const businessStateMeta = (state: string | undefined): { label: string; tone: Tone } =>
  state === 'RUHEND'
    ? { label: 'RUHEND', tone: 'warning' }
    : state === 'ACTIVE'
      ? { label: 'ACTIVE', tone: 'success' }
      : { label: state ?? '—', tone: 'neutral' };

/* -------------------------------- Glossary -------------------------------- */

export const GLOSSARY: Record<string, string> = {
  MaLo: 'Marktlokation — der Ort, an dem Energie bilanziell entnommen oder eingespeist wird.',
  MeLo: 'Messlokation — der Ort, an dem Energie technisch gemessen wird.',
  'Reststrom-MaLo': 'Die Marktlokation, über die der verbleibende Netzbezug des MK7-Konstrukts abgewickelt wird.',
  MeMa: 'Beziehung zwischen einer Messlokation und einer Marktlokation.',
  MaMa: 'Beziehung zwischen zwei Marktlokationen, z. B. Haushalts-MaLo zur Reststrom-MaLo.',
  Zeitscheibe: 'Gültigkeitsintervall einer Beziehung oder eines Status, halboffen [von, bis).',
  Ruhendstellung: 'Vorgang, der eine Marktlokation zum Stichtag in den Status RUHEND versetzt.',
  Wiederaktivierung: 'Vorgang, der eine ruhende Marktlokation wieder auf ACTIVE setzt.',
  'Herauslösung': 'Vorgang, der eine Marktlokation aus dem MK7-Konstrukt löst und die Beziehungen beendet.',
  vSZ: 'Virtueller Summenzähler — das Messkonstrukt, auf dem MK7 aufbaut.',
  Stichtag: 'Das Datum, ab dem die Änderung fachlich gilt.',
  ASSUMED_DEMO: 'Für die Demo bewusst angenommene Voraussetzung. Kein SAP-Nachweis.',
};

/* ------------------------------- Formatting ------------------------------- */

export function formatDate(value: string | undefined | null): string {
  if (!value) return '—';
  const iso = value.slice(0, 10);
  const [y, m, d] = iso.split('-');
  return y && m && d ? `${d}.${m}.${y}` : value;
}

export function formatDateTime(value: string | undefined | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('de-DE', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).format(date);
}

export function relativeTime(value: string | undefined | null): string {
  if (!value) return '—';
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return '—';
  const diff = Math.round((then - Date.now()) / 1000);
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat('de-DE', { numeric: 'auto' });
  if (abs < 60) return rtf.format(Math.round(diff), 'second');
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour');
  return rtf.format(Math.round(diff / 86400), 'day');
}

export const todayIso = (): string => new Date().toISOString().slice(0, 10);

/** Half-open interval rendered the way the domain documents it. */
export function formatInterval(from?: string, toExclusive?: string): string {
  const start = from ? formatDate(from) : 'offen';
  return toExclusive ? `${start} – ${formatDate(toExclusive)} (exkl.)` : `ab ${start}`;
}
