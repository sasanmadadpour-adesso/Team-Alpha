const test = require('node:test');
const assert = require('node:assert/strict');
const { createWorkbookRepository } = require('../srv/lib/workbook-loader');
const { calculate } = require('../srv/lib/energy-calculator');

test('calculates the supplied workbook portfolio', () => {
  const result = calculate(createWorkbookRepository().getSnapshot());
  assert.equal(result.buildingOverviews.length, 3);
  assert.equal(result.portfolio[0].eligibleHouseholdCount, 10);
  assert.equal(result.portfolio[0].excludedHouseholdCount, 1);
   assert.ok(result.portfolio[0].totalConsumptionKwh > 10000);
   assert.ok(result.portfolio[0].totalGenerationKwh > 10000);
   assert.equal(result.hourlyBalances.length, 3 * 8760);
});

test('keeps negative market prices in hourly balances', () => {
  const result = calculate(createWorkbookRepository().getSnapshot());
  assert.ok(result.hourlyBalances.some(row => row.marketPriceEurKwh < 0));
});

test('does not allocate energy to excluded participants', () => {
  const result = calculate(createWorkbookRepository().getSnapshot());
  const excluded = result.participantOverviews.find(row => row.participation === 'nein');
  assert.equal(excluded.eligibleForSettlement, false);
  assert.equal(excluded.localEnergyAllocatedKwh, 0);
});
