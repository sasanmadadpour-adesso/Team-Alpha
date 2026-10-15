const test = require('node:test');
const assert = require('node:assert/strict');
const { createWorkbookRepository } = require('../srv/lib/workbook-loader');
const { trends, granularity } = require('../srv/lib/energy-trends');

test('uses hour, day, and week trend buckets for the configured ranges', () => {
  assert.equal(granularity(new Date('2026-01-01T00:00:00Z'), new Date('2026-01-07T00:00:00Z')), 'hour');
  assert.equal(granularity(new Date('2026-01-01T00:00:00Z'), new Date('2026-01-30T00:00:00Z')), 'day');
  assert.equal(granularity(new Date('2026-01-01T00:00:00Z'), new Date('2026-06-01T00:00:00Z')), 'week');
});

test('aggregates building energy while preserving the energy identities', () => {
  const snapshot = createWorkbookRepository().getSnapshot();
  const rows = trends(snapshot, { parentType: 'building', parentId: 'B-FRA-01', from: '2026-10-01T00:00:00Z', to: '2026-10-08T00:00:00Z' });
  assert.equal(rows.length, 168);
  for (const row of rows) {
    assert.ok(Math.abs(row.consumptionKwh - row.localEnergyKwh - row.residualGridKwh) < 0.01);
    assert.ok(Math.abs(row.generationKwh - row.localEnergyKwh - row.exportKwh) < 0.01);
  }
});

test('rejects trend ranges longer than one year', () => {
  assert.throws(() => trends(createWorkbookRepository().getSnapshot(), { parentType: 'building', parentId: 'B-FRA-01', from: '2026-01-01T00:00:00Z', to: '2027-01-02T00:00:00Z' }), /365 days/);
});

test('day buckets hold the average kWh per hourly interval, including partial edge buckets', () => {
  const snapshot = createWorkbookRepository().getSnapshot();
  const hourly = trends(snapshot, { parentType: 'building', parentId: 'B-FRA-01', from: '2026-10-01T12:00:00Z', to: '2026-10-02T00:00:00Z' });
  assert.equal(hourly.length, 12);
  const days = trends(snapshot, { parentType: 'building', parentId: 'B-FRA-01', from: '2026-10-01T12:00:00Z', to: '2026-10-09T00:00:00Z' });
  assert.equal(days[0].granularity, 'day');
  assert.equal(days[0].intervalCount, 12);
  const sum = field => hourly.reduce((total, row) => total + row[field], 0);
  for (const field of ['consumptionKwh', 'generationKwh', 'localEnergyKwh', 'residualGridKwh', 'exportKwh']) {
    assert.ok(Math.abs(days[0][field] - sum(field) / 12) < 0.002, field);
  }
});

test('full day buckets report 24 intervals and stay within the range of their hours', () => {
  const snapshot = createWorkbookRepository().getSnapshot();
  const days = trends(snapshot, { parentType: 'building', parentId: 'B-FRA-01', from: '2026-10-01T00:00:00Z', to: '2026-10-09T00:00:00Z' });
  assert.ok(days.slice(0, -1).every(row => row.intervalCount === 24));
  assert.ok(days.every(row => row.consumptionKwh >= 0 && row.generationKwh >= 0));
});
