const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const XLSX = require('xlsx');

const root = path.resolve(__dirname, '../..');

test('both workbooks contain the same eight-step participant switch-over column', () => {
  const english = XLSX.readFile(path.join(root, 'Dataset_English.xlsx'));
  const german = XLSX.readFile(path.join(root, 'Datensatz_Deutsch.xlsx'));
  const enRows = XLSX.utils.sheet_to_json(english.Sheets['MK7 Participants'], { defval: null });
  const deRows = XLSX.utils.sheet_to_json(german.Sheets['MK7 Teilnehmer'], { defval: null });
  assert.equal(enRows.length, deRows.length);
  const obsolete = ['energy_concept_contact_completed', 'energy_concept_data_verified', 'energy_concept_agreement_signed', 'energy_concept_meter_ready', 'energy_concept_active'];
  assert.ok(Object.hasOwn(enRows[0], 'participant_switchover_step'));
  assert.ok(Object.hasOwn(deRows[0], 'teilnehmer_umstellung_schritt'));
  assert.ok(obsolete.every(field => !Object.hasOwn(enRows[0], field)));

  const enHouseholds = enRows.filter(row => row.mk7_role === 'Household Consumption');
  const deHouseholds = deRows.filter(row => row.mk7_rolle === 'Haushaltsverbrauch');
  assert.ok(enHouseholds.length > 0);
  assert.equal(enHouseholds.length, deHouseholds.length);
  for (const row of enHouseholds) assert.ok(row.participant_switchover_step >= 1 && row.participant_switchover_step <= 8);
  for (const row of deHouseholds) assert.ok(row.teilnehmer_umstellung_schritt >= 1 && row.teilnehmer_umstellung_schritt <= 8);

  // Most participating households have completed the eight-step concept; only a minority have not.
  const participating = enHouseholds.filter(row => row['Teilnahme MK7'] === 'Ja');
  const finished = participating.filter(row => row.participant_switchover_step === 8);
  assert.ok(finished.length > participating.length / 2);
  assert.ok(finished.length < participating.length);
  const notParticipating = enHouseholds.filter(row => row['Teilnahme MK7'] !== 'Ja');
  assert.ok(notParticipating.every(row => row.participant_switchover_step < 8));
});
