const fs = require('node:fs');
const path = require('node:path');
const XLSX = require('xlsx');

const root = path.resolve(__dirname, '../..');
const workbooks = [
  { file: 'Dataset_English.xlsx', sheet: 'MK7 Participants', columns: ['energy_concept_current_step', 'energy_concept_contact_completed', 'energy_concept_data_verified', 'energy_concept_agreement_signed', 'energy_concept_meter_ready', 'energy_concept_active'] },
  { file: 'Datensatz_Deutsch.xlsx', sheet: 'MK7 Teilnehmer', columns: ['energiekonzept_aktueller_schritt', 'energiekonzept_kontakt_abgeschlossen', 'energiekonzept_daten_geprueft', 'energiekonzept_vereinbarung_unterschrieben', 'energiekonzept_messung_bereit', 'energiekonzept_aktiv'] }
];

function updateWorkbook({ file, sheet, columns }) {
  const workbookPath = path.join(root, file);
  const workbook = XLSX.readFile(workbookPath);
  const worksheet = workbook.Sheets[sheet];
  if (!worksheet) throw new Error(`Missing sheet ${sheet} in ${file}`);
  const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: null });
  const headers = rows[0] || [];
  for (const column of columns) if (!headers.includes(column)) headers.push(column);
  const german = sheet === 'MK7 Teilnehmer';
  const roleIndex = headers.indexOf(german ? 'mk7_rolle' : 'mk7_role');
  const participationIndex = headers.indexOf('Teilnahme MK7');
  const stepIndex = headers.indexOf(columns[0]);
  const milestoneIndexes = columns.slice(1).map(column => headers.indexOf(column));
  rows[0] = headers;
  let householdIndex = 0;
  for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];
    while (row.length < headers.length) row.push(null);
    const role = String(row[roleIndex] || '');
    if (!role.toLowerCase().includes(german ? 'haushalt' : 'household')) {
      row[stepIndex] = null;
      for (const index of milestoneIndexes) row[index] = null;
      continue;
    }
    const participating = String(row[participationIndex] || '').toLowerCase() === 'ja';
    const step = participating ? [3, 4, 5][householdIndex % 3] : 2;
    householdIndex += 1;
    row[stepIndex] = step;
    milestoneIndexes.forEach((index, milestone) => { row[index] = milestone < step ? 'true' : 'false'; });
  }
  workbook.Sheets[sheet] = XLSX.utils.aoa_to_sheet(rows);
  XLSX.writeFile(workbook, workbookPath);
}

for (const workbook of workbooks) updateWorkbook(workbook);
console.log(`Updated energy-concept progress in ${workbooks.length} workbooks.`);
