const test = require('node:test');
const assert = require('node:assert/strict');
const { createWorkbookRepository, timestamp } = require('../srv/lib/workbook-loader');

test('loads all seven English workbook sheets into normalized collections', () => {
  const snapshot = createWorkbookRepository().getSnapshot();
  assert.equal(snapshot.producerOnboardings.length, 3);
  assert.equal(snapshot.participants.length, 17);
  assert.equal(snapshot.consumption.length, 264);
  assert.equal(snapshot.generation.length, 72);
  assert.equal(snapshot.prices.length, 24);
  assert.equal(snapshot.fieldDescriptions.length, 39);
  assert.equal(snapshot.financialRules.length, 19);
});

test('converts Excel serial dates to UTC', () => {
  assert.equal(timestamp(46296), '2026-10-01T00:00:00.000Z');
});
