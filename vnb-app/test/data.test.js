const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const dataDir = path.join(__dirname, '..', 'db', 'data');

function parseCsv(name) {
  const text = fs.readFileSync(path.join(dataDir, `vnb.network-${name}.csv`), 'utf8').replace(/^\uFEFF/, '');
  const records = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const character = text[i];
    if (character === '"') {
      if (quoted && text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === ',' && !quoted) {
      row.push(field);
      field = '';
    } else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && text[i + 1] === '\n') i += 1;
      row.push(field);
      if (row.some(Boolean)) records.push(row);
      row = [];
      field = '';
    } else {
      field += character;
    }
  }
  const [headers, ...values] = records;
  return values.map((entry) => Object.fromEntries(headers.map((header, index) => [header, entry[index] || ''])));
}

test('imports the complete construct topology', () => {
  const constructs = parseCsv('Constructs');
  assert.equal(constructs.length, 17);
  assert.equal(constructs.filter((row) => row.isEligible === 'true').length, 10);
  assert.equal(constructs.filter((row) => row.hasDualMaLo === 'true').length, 3);
  assert.equal(constructs.filter((row) => row.hasDataWarning === 'true').length, 3);
  assert.ok(constructs.some((row) => row.city === 'Köln'));
});

test('creates one hourly profile per construct and hour', () => {
  const hourly = parseCsv('ConstructHourlyValues');
  assert.equal(hourly.length, 17 * 24);
  assert.equal(new Set(hourly.map((row) => row.construct_ID)).size, 17);
});

test('settlement totals obey the workbook allocation identity', () => {
  const [summary] = parseCsv('PortfolioSummary');
  const consumption = Number(summary.consumptionKwh);
  const generation = Number(summary.generationKwh);
  const local = Number(summary.localEnergyKwh);
  const residual = Number(summary.residualGridKwh);
  const exported = Number(summary.exportKwh);
  assert.ok(Math.abs(consumption - local - residual) < 0.001);
  assert.ok(Math.abs(generation - local - exported) < 0.001);
  assert.equal(summary.buildingCount, '3');
});

test('creates expected payment classes and source issues', () => {
  const payments = parseCsv('Payments');
  const issues = parseCsv('DataQualityIssues');
  assert.equal(payments.length, 24);
  assert.deepEqual(
    new Set(payments.map((row) => row.paymentTypeCode)),
    new Set(['PARTICIPANT_BILL', 'RESIDUAL_PROCUREMENT', 'METERING_SERVICE', 'LOCAL_PURCHASE', 'EXPORT_REMUNERATION', 'SOLAR_SUBSIDY'])
  );
  assert.equal(issues.length, 3);
  assert.ok(issues.every((issue) => issue.severityCode === 'WARNING'));
});
