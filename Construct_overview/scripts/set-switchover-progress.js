// Ensures the participant switch-over step column (1-8) exists in both workbooks.
// Idempotent: a legacy column is renamed in place and existing values are kept; the example
// distribution is only generated when the column is missing entirely.
const fs = require('node:fs');
const path = require('node:path');
const XLSX = require('xlsx');

const root = path.resolve(__dirname, '../..');
const TOTAL_STEPS = 8;
// The last two participating households (in sheet order) are still in progress, so the UI has examples.
const UNFINISHED_STEPS = [5, 7];
const workbooks = [
  { file: 'Dataset_English.xlsx', sheet: 'MK7 Participants', column: 'participant_switchover_step', legacy: 'energy_concept_current_step', role: 'mk7_role', household: 'household' },
  { file: 'Datensatz_Deutsch.xlsx', sheet: 'MK7 Teilnehmer', column: 'teilnehmer_umstellung_schritt', legacy: 'energiekonzept_aktueller_schritt', role: 'mk7_rolle', household: 'haushalt' }
];

function updateWorkbook({ file, sheet, column, legacy, role, household }) {
  const workbookPath = path.join(root, file);
  const workbook = XLSX.readFile(workbookPath);
  const worksheet = workbook.Sheets[sheet];
  if (!worksheet) throw new Error(`Missing sheet ${sheet} in ${file}`);
  const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: null });
  const headers = rows[0] || [];
  if (headers.includes(legacy) && !headers.includes(column)) {
    headers[headers.indexOf(legacy)] = column;
    workbook.Sheets[sheet] = XLSX.utils.aoa_to_sheet(rows);
    XLSX.writeFile(workbook, workbookPath);
    console.log(`${file}: renamed column ${legacy} -> ${column} (values kept)`);
    return;
  }
  if (headers.includes(column)) {
    console.log(`${file}: column ${column} already present, nothing to do`);
    return;
  }
  // Fresh workbook without any step column: create it with the example distribution.
  headers.push(column);
  const roleIndex = headers.indexOf(role);
  const participationIndex = headers.indexOf('Teilnahme MK7');
  const stepIndex = headers.indexOf(column);
  rows[0] = headers;
  const householdRows = [];
  for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];
    while (row.length < headers.length) row.push(null);
    if (!String(row[roleIndex] || '').toLowerCase().includes(household)) continue;
    if (String(row[participationIndex] || '').toLowerCase() === 'ja') householdRows.push(rowIndex);
    else row[stepIndex] = 2;
  }
  const unfinishedFrom = householdRows.length - Math.min(UNFINISHED_STEPS.length, householdRows.length);
  householdRows.forEach((rowIndex, index) => {
    const position = index - unfinishedFrom;
    rows[rowIndex][stepIndex] = position >= 0 ? UNFINISHED_STEPS[position] : TOTAL_STEPS;
  });
  workbook.Sheets[sheet] = XLSX.utils.aoa_to_sheet(rows);
  XLSX.writeFile(workbook, workbookPath);
  console.log(`${file}: created column ${column} with example distribution`);
}

for (const workbook of workbooks) updateWorkbook(workbook);
