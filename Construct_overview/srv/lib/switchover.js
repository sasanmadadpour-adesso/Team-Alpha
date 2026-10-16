// The energy concept is an eight-step onboarding process for every participating household,
// driven by a single step number stored in the workbook (no per-milestone flags).
const TOTAL_STEPS = 8;

const STEP_LABELS = {
  de: [
    'Erstkontakt',
    'Objektdaten erfasst',
    'Datenprüfung abgeschlossen',
    'Angebot erstellt',
    'Vertrag unterschrieben',
    'Messkonzept abgestimmt',
    'Zähler eingebaut',
    'Belieferung aktiv'
  ],
  en: [
    'Initial contact',
    'Property data captured',
    'Data verification complete',
    'Offer created',
    'Contract signed',
    'Metering concept agreed',
    'Meter installed',
    'Supply active'
  ]
};

function languageOf(locale) {
  return String(locale || 'de').toLowerCase().startsWith('en') ? 'en' : 'de';
}

function stepLabel(step, locale) {
  const value = Number(step);
  if (!value || value < 1) return null;
  const labels = STEP_LABELS[languageOf(locale)];
  return labels[Math.min(value, TOTAL_STEPS) - 1] || null;
}

module.exports = { TOTAL_STEPS, STEP_LABELS, stepLabel, languageOf };
