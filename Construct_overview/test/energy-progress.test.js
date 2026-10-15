const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const XLSX = require('xlsx');

const root = path.resolve(__dirname, '../..');

test('both workbooks contain equivalent five-step energy concept progress fields', () => {
  const english = XLSX.readFile(path.join(root, 'Dataset_English.xlsx'));
  const german = XLSX.readFile(path.join(root, 'Datensatz_Deutsch.xlsx'));
  const enRows = XLSX.utils.sheet_to_json(english.Sheets['MK7 Participants'], { defval: null });
  const deRows = XLSX.utils.sheet_to_json(german.Sheets['MK7 Teilnehmer'], { defval: null });
  assert.equal(enRows.length, deRows.length);
  const englishSteps = ['energy_concept_current_step', 'energy_concept_contact_completed', 'energy_concept_data_verified', 'energy_concept_agreement_signed', 'energy_concept_meter_ready', 'energy_concept_active'];
  const germanSteps = ['energiekonzept_aktueller_schritt', 'energiekonzept_kontakt_abgeschlossen', 'energiekonzept_daten_geprueft', 'energiekonzept_vereinbarung_unterschrieben', 'energiekonzept_messung_bereit', 'energiekonzept_aktiv'];
  assert.ok(englishSteps.every(field => Object.hasOwn(enRows[0], field)));
  assert.ok(germanSteps.every(field => Object.hasOwn(deRows[0], field)));
  for (const row of enRows.filter(item => item.mk7_role === 'Household Consumption')) {
    assert.ok(row.energy_concept_current_step >= 1 && row.energy_concept_current_step <= 5);
    const completed = englishSteps.slice(1).map(field => row[field] === true || row[field] === 'true');
    assert.ok(completed.every((value, index) => !value || completed.slice(0, index).every(Boolean)));
  }
});
