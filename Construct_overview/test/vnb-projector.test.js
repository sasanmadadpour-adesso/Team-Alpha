const test = require('node:test');
const assert = require('node:assert/strict');
const { createWorkbookRepository } = require('../srv/lib/workbook-loader');
const { project } = require('../srv/lib/vnb-projector');

test('projects the workbook into the VNB construct model', () => {
  const result = project(createWorkbookRepository().getSnapshot());
  const sourceConstructs = result.constructs.filter(row => !row.isSynthetic);
  const sourceHourly = result.hourly.filter(row => !row.constructID.startsWith('TEST-'));
  assert.equal(sourceConstructs.length, 17);
  assert.equal(sourceHourly.length, 17 * 24);
  assert.equal(result.constructs.length, 17);
   assert.equal(result.hourly.length, 17 * 8760);
  assert.equal(result.buildings.length, 3);
  assert.equal(result.issues.filter(row => !row.sourceValue.startsWith('EDGE-')).length, 3);
  assert.equal(result.portfolio[0].eligibleMeterCount, 10);
  assert.equal(result.consumers.length, 11);
  assert.equal(result.producers.length, 3);
   assert.equal(result.buildingHourlyEnergy.length, 3 * 8760);
  assert.ok(result.consumers.every(row => row.energyConceptCurrentStep >= 1 && row.energyConceptCurrentStep <= 5));
  assert.ok(result.constructs.some(row => row.roleCode === 'HOUSEHOLD'));
  assert.ok(result.constructs.some(row => row.roleCode === 'GENERATION'));
  assert.ok(result.constructs.some(row => row.roleCode === 'RESIDUAL'));
});

test('preserves hourly allocation identities in the VNB projection', () => {
  const result = project(createWorkbookRepository().getSnapshot());
  const household = result.constructs.find(row => row.roleCode === 'HOUSEHOLD' && row.isEligible);
  const rows = result.hourly.filter(row => row.constructID === household.ID);
   assert.equal(rows.length, 8760);
  for (const row of rows) assert.ok(Math.abs(row.consumptionKwh - row.localAllocationKwh - row.residualGridKwh) < 0.001);
});

test('creates payment records and stable data quality records', () => {
  const repository = createWorkbookRepository();
  const first = project(repository.getSnapshot());
  const second = project(repository.getSnapshot());
  assert.ok(first.payments.length >= 24);
  assert.ok(first.payments.some(row => row.paymentTypeCode === 'PARTICIPANT_BILL'));
  assert.ok(first.payments.some(row => row.paymentTypeCode === 'METERING_SERVICE'));
  assert.deepEqual(first.issues.map(row => row.ID), second.issues.map(row => row.ID));
  assert.ok(first.constructs.filter(row => row.hasDataWarning && !row.isSynthetic).every(row => row.warningCode === 'ID_SEMANTIC_CONFLICT'));
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
