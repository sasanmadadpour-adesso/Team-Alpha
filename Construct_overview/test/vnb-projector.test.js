const test = require('node:test');
const assert = require('node:assert/strict');
const { createWorkbookRepository } = require('../srv/lib/workbook-loader');
const { project } = require('../srv/lib/vnb-projector');
const { TOTAL_STEPS } = require('../srv/lib/switchover');

test('projects the workbook into the VNB construct model', () => {
  const snapshot = createWorkbookRepository().getSnapshot();
  const snapshotPlantIds = new Set(snapshot.participants.filter(row => row.exportMarketLocationId).map(row => row.ID));
  const result = project(snapshot);
  assert.equal(result.constructs.length, 17);
  assert.equal(result.hourly.length, 17 * 8760);
  assert.equal(result.buildings.length, 3);
  assert.equal(result.issues.length, 3);
  assert.equal(result.portfolio[0].eligibleMeterCount, 10);
  assert.equal(result.consumers.length, 11);
  assert.equal(result.producers.length, 3);
  assert.equal(result.buildingHourlyEnergy.length, 3 * 8760);
  assert.ok(result.consumers.every(row => row.switchoverStep >= 1 && row.switchoverStep <= TOTAL_STEPS));
  assert.ok(result.consumers.every(row => row.switchoverTotalSteps === TOTAL_STEPS));
  // Most participating households have finished the eight-step energy concept; only a minority have not.
  const participating = result.consumers.filter(row => row.participationCode === 'YES');
  const finished = participating.filter(row => row.switchoverComplete);
  assert.ok(finished.length > participating.length / 2, 'most participating households should be finished');
  assert.ok(finished.length < participating.length, 'some participating households should still be unfinished');
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
  // Buildings have no switch-over progress of their own; the building-level step fields are gone.
  assert.ok(result.buildings.every(row => !('averageEnergyConceptStep' in row) && !('switchoverTotalSteps' in row)));
  assert.ok(result.consumers.every(row => row.targetConstructID === row.ID));
  assert.ok(result.producers.every(row => /^\d{11}$/.test(row.ID) && snapshotPlantIds.has(row.targetConstructID)));
});

// The three-state MK7 participation signal drives the check / exclamation / cross icons:
// not participating (1, red), participating but unfinished (2, yellow), finished (3, green).
test('derives three-state MK7 participation criticality from participation and switch-over progress', () => {
  const result = project(createWorkbookRepository().getSnapshot());
  const households = result.constructs.filter(row => row.roleCode === 'HOUSEHOLD');
  for (const row of households) {
    if (row.participationCode !== 'YES') assert.equal(row.participationCriticality, 1, row.ID);
    else if (row.switchoverComplete) assert.equal(row.participationCriticality, 3, row.ID);
    else assert.equal(row.participationCriticality, 2, row.ID);
  }
  assert.ok(households.some(row => row.participationCriticality === 1));
  assert.ok(households.some(row => row.participationCriticality === 2));
  assert.ok(households.some(row => row.participationCriticality === 3));
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
  assert.ok(first.constructs.filter(row => row.hasDataWarning).every(row => row.warningCode && row.dataQualityIssueCount > 0));
});

test('builds a single tree with one root per building and its members as children', () => {
  const result = project(createWorkbookRepository().getSnapshot());
  const roots = result.treeNodes.filter(row => row.nodeType === 'BUILDING');
  assert.equal(roots.length, 3);
  assert.ok(roots.every(row => row.parentID === null));
  const byParent = new Map();
  for (const row of result.treeNodes) {
    if (!row.parentID) continue;
    byParent.set(row.parentID, [...(byParent.get(row.parentID) || []), row]);
  }
  for (const root of roots) {
    const children = byParent.get(root.ID) || [];
    assert.ok(children.length > 0, `${root.ID} should have members`);
    assert.ok(children.some(row => row.nodeType === 'HOUSEHOLD'));
    assert.ok(children.some(row => row.nodeType === 'COUNTER'));
    assert.ok(children.some(row => row.nodeType === 'PRODUCER'));
  }
  assert.ok(result.treeNodes.every(row => row.detailHash === '' || row.detailHash.startsWith('#/')));
  assert.equal(result.treeNodes.filter(row => row.nodeType === 'HOUSEHOLD').length, result.consumers.length);
});

// The shared energy counter shows the whole house's grid import (residual) and export; only those two KPIs remain.
test('the shared energy counter carries the house grid import and export and hides the other energy KPIs', () => {
  const result = project(createWorkbookRepository().getSnapshot());
  for (const building of result.buildings) {
    const counter = result.constructs.find(row => row.ID === building.sharedMeterConstructID);
    assert.equal(counter.isSharedMeter, true);
    assert.ok(Math.abs(counter.residualGridKwh - building.residualGridKwh) < 0.01, building.ID);
    assert.ok(Math.abs(counter.exportKwh - building.exportKwh) < 0.01, building.ID);
    assert.equal(counter.counterKpiHidden, true);
    assert.equal(counter.switchoverHidden, true);
  }
  for (const construct of result.constructs.filter(row => !row.isSharedMeter)) {
    assert.equal(construct.counterKpiHidden, false, construct.ID);
    assert.equal(construct.houseGridImportKwh, undefined, construct.ID);
  }
});

test('building header KPIs: consumption, grid import/export, and solar and wind generation split by type', () => {
  const { createWorkbookRepository: repo } = require('../srv/lib/workbook-loader');
  const snapshot = repo().getSnapshot();
  const result = project(snapshot);
  for (const building of result.buildings) {
    assert.ok(building.totalConsumptionKwh > 0, building.ID);
    assert.ok(Math.abs(building.solarGenerationKwh + building.windGenerationKwh - building.totalGenerationKwh) < 0.01, building.ID);
    assert.equal(building.solarHidden, building.solarGenerationKwh === 0, building.ID);
    assert.equal(building.windHidden, building.windGenerationKwh === 0, building.ID);
  }
  const solarOnly = result.buildings.find(row => row.ID === 'B-FRA-01');
  assert.equal(solarOnly.windHidden, true);
  assert.equal(solarOnly.solarHidden, false);
  const windOnly = result.buildings.find(row => row.ID === 'B-CGN-01');
  assert.equal(windOnly.solarHidden, true);
  assert.equal(windOnly.windHidden, false);
});

// Households that finished the switch-over hide the progress; unfinished ones keep it visible.
test('switch-over progress is hidden once a household reached the last step, and stays integer', () => {
  const result = project(createWorkbookRepository().getSnapshot());
  for (const consumer of result.consumers) {
    assert.equal(Number.isInteger(consumer.switchoverStep), true, consumer.ID);
    assert.equal(consumer.switchoverHidden, consumer.switchoverStep === TOTAL_STEPS, consumer.ID);
  }
  const unfinished = result.consumers.filter(row => !row.switchoverHidden);
  assert.ok(unfinished.length >= 1 && unfinished.length < result.consumers.length);
});

test('no synthetic test-scenario data is produced', () => {
  const result = project(createWorkbookRepository().getSnapshot());
  assert.equal(result.scenarios, undefined);
  assert.ok(result.constructs.every(row => !('isSynthetic' in row) && !('testScenario' in row)));
  assert.ok(result.issues.every(row => row.issueCode !== 'SYNTHETIC_EDGE_CASE'));
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
    assert.equal(construct.buildingLink, `#/Buildings('${construct.buildingID}')`);
    assert.equal(construct.hasBuildingLink, true);
    assert.equal(construct.hasNoBuildingLink, false);
  }
});

test('exposes the building owner (producer first and last name) on buildings, constructs and building rows', () => {
  const result = project(createWorkbookRepository().getSnapshot());
  for (const building of result.buildings) {
    assert.ok(building.ownerFirstName && building.ownerLastName, building.ID);
    assert.equal(building.ownerName, `${building.ownerLastName}, ${building.ownerFirstName}`);
  }
  const owner = result.buildings.find(row => row.ID === 'B-FRA-01');
  assert.equal(owner.ownerLastName, 'Koller');
  for (const construct of result.constructs) {
    const building = result.buildings.find(row => row.ID === construct.buildingID);
    assert.equal(construct.ownerName, building.ownerName, construct.ID);
  }
  for (const node of result.treeNodes) {
    if (node.nodeType === 'BUILDING') assert.ok(node.ownerName, node.ID);
    else assert.equal(node.ownerName, undefined, `${node.ID} must not repeat the owner`);
  }
});
