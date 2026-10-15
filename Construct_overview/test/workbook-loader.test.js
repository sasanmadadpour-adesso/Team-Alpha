const test = require('node:test');
const assert = require('node:assert/strict');
const { createWorkbookRepository, timestamp } = require('../srv/lib/workbook-loader');

test('loads all seven English workbook sheets into normalized collections', () => {
  const snapshot = createWorkbookRepository().getSnapshot();
  assert.equal(snapshot.producerOnboardings.length, 3);
  assert.equal(snapshot.participants.length, 17);
   assert.equal(snapshot.consumption.length, 96360);
   assert.equal(snapshot.generation.length, 26280);
   assert.equal(snapshot.prices.length, 8760);
   assert.equal(new Set(snapshot.consumption.map(row => row.startTime)).size, 8760);
   assert.equal(snapshot.consumption[0].startTime, '2025-10-16T00:00:00.000Z');
   assert.equal(snapshot.prices.at(-1).endTime, '2026-10-16T00:00:00.000Z');
  assert.equal(snapshot.fieldDescriptions.length, 39);
  assert.equal(snapshot.financialRules.length, 19);
});

test('converts Excel serial dates to UTC', () => {
  assert.equal(timestamp(46296), '2026-10-01T00:00:00.000Z');
});
