const test = require('node:test');
const assert = require('node:assert/strict');
const { createWorkbookRepository } = require('../srv/lib/workbook-loader');
const { project } = require('../srv/lib/vnb-projector');

test('projects the workbook into the VNB construct model', () => {
  const snapshot = createWorkbookRepository().getSnapshot();
  const snapshotPlantIds = new Set(snapshot.participants.filter(row => row.exportMarketLocationId).map(row => row.ID));
  const result = project(snapshot);
  const sourceConstructs = result.constructs.filter(row => !row.isSynthetic);
  const sourceHourly = result.hourly.filter(row => !row.constructID.startsWith('TEST-'));
  assert.equal(sourceConstructs.length, 17);
  assert.equal(sourceHourly.length, 17 * 8760);
  assert.equal(result.constructs.length, 17 + 8);
  assert.equal(result.hourly.length, 17 * 8760 + 8 * 24);
  assert.equal(result.buildings.length, 3);
  assert.equal(result.issues.filter(row => row.issueCode !== 'SYNTHETIC_EDGE_CASE').length, 3);
  assert.equal(result.portfolio[0].eligibleMeterCount, 10);
  assert.equal(result.consumers.length, 11);
  assert.equal(result.producers.length, 3);
  assert.equal(result.buildingHourlyEnergy.length, 3 * 8760);
  assert.ok(result.consumers.every(row => row.energyConceptCurrentStep >= 1 && row.energyConceptCurrentStep <= 5));
  assert.ok(result.constructs.some(row => row.roleCode === 'HOUSEHOLD'));
  assert.ok(result.constructs.some(row => row.roleCode === 'GENERATION'));
  assert.ok(result.constructs.some(row => row.roleCode === 'RESIDUAL'));
  assert.ok(result.connections.length > 0);
  assert.ok(result.connections.every(row => row.constructID && row.malo));
  assert.ok(result.constructs.every(row => typeof row.hasSolar === 'boolean' && typeof row.hasWind === 'boolean'));
  assert.ok(result.constructs.every(row => row.measurementIntervalCount24h >= 0));
  assert.ok(result.buildings.every(row => typeof row.hasSolar === 'boolean' && typeof row.hasWind === 'boolean'));
  assert.ok(result.buildings.every(row => row.consumptionIntervalCount24h >= 0));
  assert.ok(result.buildings.every(row => row.solarProducerCount >= 0 && row.windProducerCount >= 0));
  assert.ok(result.consumers.every(row => row.targetConstructID === row.ID));
  assert.ok(result.producers.every(row => /^\d{11}$/.test(row.ID) && snapshotPlantIds.has(row.targetConstructID)));
});

test('preserves hourly allocation identities in the VNB projection', () => {
  const result = project(createWorkbookRepository().getSnapshot());
  const household = result.constructs.find(row => row.roleCode === 'HOUSEHOLD' && row.isEligible);
  const rows = result.hourly.filter(row => row.constructID === household.ID);
   assert.equal(rows.length, 8760);
  // Values are rounded to 3 decimals, so each component may deviate by one rounding step (0.001).
  for (const row of rows) assert.ok(Math.abs(row.consumptionKwh - row.localAllocationKwh - row.residualGridKwh) <= 0.0011);
});

test('creates payment records and stable data quality records', () => {
  const repository = createWorkbookRepository();
  const first = project(repository.getSnapshot());
  const second = project(repository.getSnapshot());
  assert.ok(first.payments.length >= 24);
  assert.ok(first.payments.some(row => row.paymentTypeCode === 'PARTICIPANT_BILL'));
  assert.ok(first.payments.some(row => row.paymentTypeCode === 'METERING_SERVICE'));
  assert.deepEqual(first.issues.map(row => row.ID), second.issues.map(row => row.ID));
  assert.ok(first.constructs.filter(row => row.hasDataWarning && !row.isSynthetic).every(row => row.warningCode && row.dataQualityIssueCount > 0));
});

test('projects synthetic many-to-one MaLo/MeLo edge cases', () => {
  const result = project(createWorkbookRepository().getSnapshot());
  assert.equal(result.scenarios.length, 8);
  assert.equal(result.constructs.filter(row => row.isSynthetic).length, 8);
  assert.ok(result.connections.length >= 20);
  assert.ok(result.connections.some(row => row.scenarioCode === 'EDGE-MULTI-DIRECTION' && row.directionCode === 'IMPORT'));
  assert.ok(result.connections.some(row => row.scenarioCode === 'EDGE-MULTI-DIRECTION' && row.directionCode === 'EXPORT'));
  assert.ok(result.issues.some(row => row.sourceValue === 'EDGE-INVALID'));
});

test('projects 24h grid import/export averages and construct building links', () => {
  const { calculate } = require('../srv/lib/energy-calculator');
  const snapshot = createWorkbookRepository().getSnapshot();
  const result = project(snapshot);
  const balances = calculate(snapshot).hourlyBalances;
  for (const building of result.buildings) {
    const latest = new Date(building.latestMeasurementTime);
    const rows = balances.filter(row => row.buildingId === building.ID && new Date(row.startTime) > new Date(latest - 24 * 3600000) && new Date(row.startTime) <= latest);
    assert.equal(rows.length, 24);
    const mean = field => rows.reduce((total, row) => total + row[field], 0) / rows.length;
    assert.ok(Math.abs(building.averageGridImport24hKwh - mean('residualGridEnergyKwh')) < 0.002, `${building.ID} import`);
    assert.ok(Math.abs(building.averageGridExport24hKwh - mean('exportEnergyKwh')) < 0.002, `${building.ID} export`);
  }
  for (const construct of result.constructs) {
    if (construct.isSynthetic) assert.equal(construct.buildingLink, '');
    else assert.equal(construct.buildingLink, `#/Buildings('${construct.buildingID}')`);
    assert.equal(construct.hasBuildingLink, !construct.isSynthetic);
    assert.equal(construct.hasNoBuildingLink, Boolean(construct.isSynthetic));
  }
});
