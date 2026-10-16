// Data quality rules for the workbook. Each rule produces issues with a stable code and plain parameters;
// the wording is resolved per request language in `localize`, so the UI can switch language at runtime.

const SEVERITY = {
  ERROR: { criticality: 1, rank: 3 },
  WARNING: { criticality: 2, rank: 2 },
  INFO: { criticality: 5, rank: 1 }
};

const FIELDS = {
  import_malo: { de: 'Bezugs-MaLo', en: 'Import MaLo' },
  export_malo: { de: 'Einspeise-MaLo', en: 'Export MaLo' },
  participation: { de: 'Teilnahme MK7', en: 'MK7 participation' },
  postal_code: { de: 'Postleitzahl', en: 'Postcode' }
};

const SEVERITY_LABELS = {
  ERROR: { de: 'Fehler', en: 'Error' },
  WARNING: { de: 'Warnung', en: 'Warning' },
  INFO: { de: 'Hinweis', en: 'Info' }
};

const TEXTS = {
  POSTCODE_MISMATCH: {
    de: {
      title: 'Postleitzahl passt nicht zum Gebäude',
      text: 'Die Postleitzahl {zip} in Zeile {row} (Gebäude {building}, {city}) weicht von der Postleitzahl {expected} ab, die für das Gebäude bei der Erzeugungsanlage hinterlegt ist. Alle Teilnehmer eines Gebäudes haben dieselbe Adresse.',
      action: 'Korrigieren Sie die Postleitzahl des Teilnehmers auf {expected}.'
    },
    en: {
      title: 'Postcode does not match the building',
      text: 'The postcode {zip} in row {row} (building {building}, {city}) differs from the postcode {expected} stored for the building at the generation plant. All participants of a building share the same address.',
      action: 'Correct the participant postcode to {expected}.'
    }
  },
  DUPLICATE_IMPORT_MALO: {
    de: {
      title: 'Bezugs-MaLo mehrfach vergeben',
      text: 'Die Bezugs-MaLo {malo} ist in Zeile {row} (Gebäude {building}) eingetragen, aber auch bei {others}. Eine MaLo darf nur zu einem Anschluss gehören, sonst lassen sich Verbräuche nicht eindeutig zuordnen.',
      action: 'Klären Sie, welchem Haushalt die MaLo gehört, und tragen Sie beim anderen Haushalt die richtige MaLo ein.'
    },
    en: {
      title: 'Import MaLo assigned more than once',
      text: 'The import MaLo {malo} is listed in row {row} (building {building}), but also for {others}. A MaLo may only belong to one connection, otherwise consumption cannot be assigned unambiguously.',
      action: 'Clarify which household the MaLo belongs to and enter the correct MaLo for the other household.'
    }
  },
  SHARED_EXPORT_MALO: {
    de: {
      title: 'Einspeise-MaLo von mehreren Anlagen genutzt',
      text: 'Die Einspeise-MaLo {malo} ist bei der Anlage in Zeile {row} (Gebäude {building}) eingetragen, aber auch bei {others}. Einspeisungen lassen sich so nicht eindeutig einer Anlage zuordnen.',
      action: 'Prüfen Sie, ob jede Erzeugungsanlage eine eigene Einspeise-MaLo erhalten muss.'
    },
    en: {
      title: 'Export MaLo shared by several plants',
      text: 'The export MaLo {malo} is listed for the plant in row {row} (building {building}), but also for {others}. Feed-in cannot be assigned unambiguously to one plant.',
      action: 'Check whether every generation plant needs its own export MaLo.'
    }
  },
  EXCLUDED_WITH_READINGS: {
    de: {
      title: 'Nicht teilnehmender Haushalt mit Messwerten',
      text: 'Der Haushalt in Zeile {row} (Gebäude {building}) hat „Teilnahme MK7 = nein“, es liegen aber {hours} Stundenwerte vor. Diese Werte werden bei der lokalen Energieabrechnung nicht berücksichtigt.',
      action: 'Kein Eingriff nötig. Prüfen Sie nur, ob die Teilnahme noch aktuell ist.'
    },
    en: {
      title: 'Non-participating household has readings',
      text: 'The household in row {row} (building {building}) has “MK7 participation = nein”, but {hours} hourly readings exist. These readings are ignored in the local energy settlement.',
      action: 'No action required. Only check whether the participation status is still current.'
    }
  },
  UNRECOGNIZED_PARTICIPATION: {
    de: {
      title: 'Teilnahme MK7 nicht erkennbar',
      text: 'Der Wert „{value}“ in „Teilnahme MK7“ (Zeile {row}, Gebäude {building}) ist weder „Ja“ noch „nein“. Der Teilnehmer wird deshalb als nicht teilnehmend behandelt.',
      action: 'Tragen Sie genau „Ja“ oder „nein“ ein.'
    },
    en: {
      title: 'MK7 participation not recognised',
      text: 'The value “{value}” in “MK7 participation” (row {row}, building {building}) is neither “Ja” nor “nein”. The participant is therefore treated as not participating.',
      action: 'Enter exactly “Ja” or “nein”.'
    }
  }
};

const place = (row, language) => language === 'en' ? `building ${row.buildingId} (row ${row.sourceRow})` : `Gebäude ${row.buildingId} (Zeile ${row.sourceRow})`;

function groupBy(rows, keyOf) {
  const groups = new Map();
  for (const row of rows) {
    const key = keyOf(row);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return groups;
}

function issue(constructID, severityCode, issueCode, field, sourceValue, params) {
  return { ID: `${constructID}-${issueCode}`, constructID, severityCode, severityCriticality: SEVERITY[severityCode].criticality, issueCode, fieldName: field, sourceValue: String(sourceValue ?? ''), params };
}

// Finds data problems in the snapshot. `others` parameters are given as row descriptors and rendered per language later.
function detect(snapshot) {
  const issues = [];
  const participants = snapshot.participants;
  // The postcode stored at the generation plant is the reference for all participants of the building.
  const postcodeOf = row => String(row.cityPostalCode || '').match(/\b\d{5}\b/)?.[0] || '';
  const expectedPostcode = new Map();
  for (const producer of snapshot.producerOnboardings) if (producer.deliveryZipCode) expectedPostcode.set(producer.buildingId, String(producer.deliveryZipCode));
  for (const participant of participants) {
    const expected = expectedPostcode.get(participant.buildingId);
    const zip = postcodeOf(participant);
    if (expected && zip !== expected) {
      issues.push(issue(participant.ID, 'WARNING', 'POSTCODE_MISMATCH', 'postal_code', zip, { zip: zip || '–', expected, row: participant.sourceRow, building: participant.buildingId, city: participant.city }));
    }
  }

  for (const [malo, group] of groupBy(participants, row => row.importMarketLocationId)) {
    if (group.length < 2) continue;
    for (const row of group) {
      issues.push(issue(row.ID, 'ERROR', 'DUPLICATE_IMPORT_MALO', 'import_malo', malo, { malo, row: row.sourceRow, building: row.buildingId, others: group.filter(other => other !== row).map(other => ({ buildingId: other.buildingId, sourceRow: other.sourceRow })) }));
    }
  }

  const exporters = participants.filter(row => row.exportMarketLocationId);
  for (const [malo, group] of groupBy(exporters, row => row.exportMarketLocationId)) {
    if (group.length < 2) continue;
    for (const row of group) {
      issues.push(issue(row.ID, 'WARNING', 'SHARED_EXPORT_MALO', 'export_malo', malo, { malo, row: row.sourceRow, building: row.buildingId, others: group.filter(other => other !== row).map(other => ({ buildingId: other.buildingId, sourceRow: other.sourceRow })) }));
    }
  }

  const readingHours = new Map();
  for (const reading of snapshot.consumption) readingHours.set(reading.meteringLocationId, (readingHours.get(reading.meteringLocationId) || 0) + 1);
  for (const participant of participants) {
    if (participant.role !== 'Household Consumption') continue;
    const value = String(participant.participation ?? '');
    if (value === 'nein' && readingHours.get(participant.meteringLocationId)) {
      issues.push(issue(participant.ID, 'INFO', 'EXCLUDED_WITH_READINGS', 'participation', value, { row: participant.sourceRow, building: participant.buildingId, hours: readingHours.get(participant.meteringLocationId) }));
    } else if (value !== 'Ja' && value !== 'nein') {
      issues.push(issue(participant.ID, 'ERROR', 'UNRECOGNIZED_PARTICIPATION', 'participation', value, { value, row: participant.sourceRow, building: participant.buildingId }));
    }
  }
  return issues.sort((a, b) => SEVERITY[b.severityCode].rank - SEVERITY[a.severityCode].rank || a.issueCode.localeCompare(b.issueCode) || a.ID.localeCompare(b.ID));
}

function interpolate(template, params, language) {
  return template.replace(/\{(\w+)\}/g, (match, name) => {
    const value = params?.[name];
    if (value === undefined) return match;
    if (name === 'others') return value.map(row => place(row, language)).join(language === 'en' ? ' and ' : ' und ');
    return String(value);
  });
}

function languageOf(locale) {
  return String(locale || 'de').toLowerCase().startsWith('en') ? 'en' : 'de';
}

// Returns a copy of the issue with all user-facing texts in the requested language.
function localize(row, locale) {
  const language = languageOf(locale);
  const texts = TEXTS[row.issueCode]?.[language] || { title: row.issueCode, text: row.issueText || '', action: '' };
  const { params, ...rest } = row;
  return {
    ...rest,
    severityLabel: SEVERITY_LABELS[row.severityCode]?.[language] || row.severityCode,
    fieldLabel: FIELDS[row.fieldName]?.[language] || row.fieldName,
    title: texts.title,
    issueText: interpolate(texts.text, row.params, language),
    recommendation: interpolate(texts.action, row.params, language)
  };
}

function summarize(issues, locale) {
  if (!issues.length) return null;
  const ranked = [...issues].sort((a, b) => SEVERITY[b.severityCode].rank - SEVERITY[a.severityCode].rank);
  const titles = ranked.map(row => localize(row, locale).title);
  return titles.length === 1 ? titles[0] : `${titles[0]} (+${titles.length - 1})`;
}

function worstSeverity(issues) {
  return issues.reduce((worst, row) => (!worst || SEVERITY[row.severityCode].rank > SEVERITY[worst].rank ? row.severityCode : worst), null);
}

module.exports = { detect, localize, summarize, worstSeverity, languageOf, SEVERITY, TEXTS };
