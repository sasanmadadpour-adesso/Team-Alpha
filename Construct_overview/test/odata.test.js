const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');

const port = 4010;
const base = `http://localhost:${port}/odata/v4/energy-overview`;
const rangeFilter = (parentID, from = '2026-10-09T00:00:00Z', to = '2026-10-16T00:00:00Z') => `$filter=${encodeURIComponent(`parentID eq '${parentID}' and bucketStart ge ${from} and bucketStart lt ${to}`)}&$orderby=bucketStart`;

async function waitForServer() {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try { const response = await fetch(`${base}/Constructs`); if (response.ok) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw new Error('CAP server did not start');
}

test('serves VNB compatibility entities and navigation over OData', async t => {
  const server = spawn(process.execPath, ['node_modules/@sap/cds/bin/serve.js'], {
    env: {
      ...process.env,
      PORT: String(port),
      SYNC_DB_PATH: ':memory:',
      REGISTERED_API_URL: 'http://127.0.0.1:1/api/constructs',
      REGISTERED_FALLBACK_API_URL: '',
      PENDING_API_URL: 'http://127.0.0.1:1/api/constructs/pending',
      WHITE_LABEL_ONLY: 'false'
    },
    stdio: 'ignore'
  });
  t.after(() => server.kill());
  await waitForServer();
  const constructs = await (await fetch(`${base}/Constructs`)).json();
  assert.equal(constructs.value.length, 17);
  const id = constructs.value[0].ID;
  const hourly = await (await fetch(`${base}/Constructs('${id}')/hourlyValues`)).json();
  const payments = await (await fetch(`${base}/Constructs('${id}')/payments`)).json();
  const countResponse = await fetch(`${base}/Constructs?$count=true&$top=2`);
  const counted = await countResponse.json();
  assert.equal(counted['@odata.count'], 17);
  assert.equal(counted.value.length, 2);
  assert.equal(await (await fetch(`${base}/Buildings/$count`)).text(), '3');
  assert.equal((await fetch(`${base}/TestScenarios`)).status, 404);
  const members = await (await fetch(`${base}/Constructs('${id}')/members`)).json();
   assert.equal(hourly.value.length, 8760);
  assert.ok(payments.value.length > 0);
  const buildings = await (await fetch(`${base}/Buildings`)).json();
  assert.equal(buildings.value.length, 3);
  const buildingId = buildings.value[0].ID;
  const consumers = await (await fetch(`${base}/Buildings('${buildingId}')/consumers`)).json();
  const producers = await (await fetch(`${base}/Buildings('${buildingId}')/producers`)).json();
  const buildingHourly = await (await fetch(`${base}/Buildings('${buildingId}')/hourlyEnergy`)).json();
  const building = await (await fetch(`${base}/Buildings('${buildingId}')`)).json();
  const solarProducers = await (await fetch(`${base}/Buildings('${buildingId}')/solarProducers`)).json();
  const windProducers = await (await fetch(`${base}/Buildings('${buildingId}')/windProducers`)).json();
  assert.ok(consumers.value.length > 0);
  assert.ok(Array.isArray(members.value));
  assert.ok(typeof building.averageConsumption24hKwh === 'number');
  assert.ok(typeof building.consumptionIntervalCount24h === 'number');
  assert.ok(Array.isArray(solarProducers.value));
  assert.ok(Array.isArray(windProducers.value));
  assert.equal(producers.value.length, 1);
  assert.equal(buildingHourly.value.length, 8760);
  const buildingResponse = await fetch(`${base}/BuildingEnergyTrends?${rangeFilter(buildingId)}`, { signal: AbortSignal.timeout(15000) });
  assert.equal(buildingResponse.status, 200);
  const buildingRows = (await buildingResponse.json()).value;
  assert.equal(buildingRows.length, 168);
  assert.ok(buildingRows.every(row => row.parentID === buildingId && row.granularity === 'hour' && row.intervalCount === 1));

  const constructID = constructs.value[0].ID;
  const constructResponse = await fetch(`${base}/ConstructEnergyTrends?${rangeFilter(constructID)}`, { signal: AbortSignal.timeout(15000) });
  assert.equal(constructResponse.status, 200);
  const constructRows = (await constructResponse.json()).value;
  assert.equal(constructRows.length, 168);
  assert.ok(constructRows.every(row => row.parentID === constructID && row.granularity === 'hour'));

  const treeNodes = await (await fetch(`${base}/ConstructTreeNodes`)).json();
  assert.equal(treeNodes.value.filter(row => row.nodeType === 'BUILDING').length, 3);
  assert.ok(treeNodes.value.filter(row => row.nodeType === 'HOUSEHOLD').length > 0);
  assert.ok(treeNodes.value.every(row => row.parentID !== undefined));
});
