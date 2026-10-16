const test = require('node:test');
const assert = require('node:assert/strict');
const { aggregateHostedRows, hostedEnergy, portalRows } = require('../srv/lib/hosted-energy-client');

function response(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body) };
}

test('maps house-member portal points to the existing chart contract', () => {
  const rows = portalRows({ trends: { member: { granularity: 'day', points: [{ timestamp: '2026-10-15T00:00:00.000Z', intervalCount: 24, consumptionKwh: 4, localEnergyKwh: 1.5, gridImportKwh: 2.5 }] } } }, '50539603888', '7d');
  assert.deepEqual(rows[0], {
    ID: 'HOSTED_PORTAL-50539603888-7d-0', parentID: '50539603888',
    bucketStart: '2026-10-15T00:00:00.000Z', bucketEnd: '2026-10-16T00:00:00.000Z', bucketLabel: '2026-10-15T00:00:00.000Z', granularity: 'day',
    consumptionKwh: 4, generationKwh: 0, localEnergyKwh: 1.5, residualGridKwh: 2.5, exportKwh: 0, intervalCount: 24
  });
});

test('aggregates hosted hourly rows proportionally for the selected MaLo', () => {
  const consumption = [
    { startTime: '2026-10-15T00:00:00.000Z', maloId: 'M1', consumptionKwh: 2 },
    { startTime: '2026-10-15T00:00:00.000Z', maloId: 'M2', consumptionKwh: 6 }
  ];
  const rows = aggregateHostedRows(consumption, [{ startTime: '2026-10-15T00:00:00.000Z', generationKwh: 4 }], 'M1', '24h');
  assert.equal(rows[0].consumptionKwh, 2);
  assert.equal(rows[0].localEnergyKwh, 1);
  assert.equal(rows[0].residualGridKwh, 1);
});

test('maps a producer MaLo to its hosted generation and export flow', () => {
  const consumption = [{ startTime: '2026-10-15T00:00:00.000Z', maloId: 'H1', consumptionKwh: 2 }];
  const generation = [{ startTime: '2026-10-15T00:00:00.000Z', maloId: 'P1', generationKwh: 4 }];
  const rows = aggregateHostedRows(consumption, generation, 'P1', '24h', 'GENERATION');
  assert.equal(rows[0].generationKwh, 4);
  assert.equal(rows[0].localEnergyKwh, 2);
  assert.equal(rows[0].exportKwh, 2);
});

test('maps a residual-supply MaLo to whole-building hosted energy flow', () => {
  const consumption = [{ startTime: '2026-10-15T00:00:00.000Z', maloId: 'H1', consumptionKwh: 5 }];
  const generation = [{ startTime: '2026-10-15T00:00:00.000Z', maloId: 'P1', generationKwh: 2 }];
  const rows = aggregateHostedRows(consumption, generation, 'GRID1', '24h', 'RESIDUAL_SUPPLY');
  assert.equal(rows[0].consumptionKwh, 5);
  assert.equal(rows[0].generationKwh, 2);
  assert.equal(rows[0].residualGridKwh, 3);
});

test('falls back to hosted OData if the portal rejects the integration key', async () => {
  const calls = [];
  const fetchImpl = async url => {
    const value = String(url); calls.push(value);
    if (value.includes('house-member-portal')) return response({ error: { code: 'AUTH_REQUIRED', message: 'token required' } }, 401);
    if (decodeURIComponent(value).includes('$orderby=endTime desc')) return response({ value: [{ endTime: '2026-10-16T00:00:00.000Z' }] });
    if (value.includes('HourlyConsumption')) return response({ value: [{ startTime: '2026-10-15T23:00:00.000Z', endTime: '2026-10-16T00:00:00.000Z', maloId: 'M1', consumptionKwh: 2 }] });
    return response({ value: [{ startTime: '2026-10-15T23:00:00.000Z', endTime: '2026-10-16T00:00:00.000Z', generationKwh: 1 }] });
  };
  const result = await hostedEnergy({ malo: 'M1', building: 'B1', range: '7d', fetchImpl, urls: { portal: 'https://host/api/v1/house-member-portal', data: 'https://host/odata/v4/data' } });
  assert.equal(result.source, 'HOSTED_ODATA');
  assert.equal(result.portalStatus, 401);
  assert.equal(result.value[0].consumptionKwh, 2);
  assert.ok(calls.some(url => url.includes('HourlyConsumption')));
});

test('the Overview live-energy proxy uses a producer feed-in MaLo for detailed data', () => {
  const server = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'server.js'), 'utf8');
  assert.match(server, /member\?\.roleCode === 'GENERATION'/);
  assert.match(server, /member\.exportMaLo \|\| malo/);
  assert.match(server, /parentID: malo/);
});
