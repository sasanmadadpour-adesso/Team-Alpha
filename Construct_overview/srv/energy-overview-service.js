const cds = require('@sap/cds');
const { createWorkbookRepository } = require('./lib/workbook-loader');
const { calculate } = require('./lib/energy-calculator');
const { project } = require('./lib/vnb-projector');

function filterRows(rows, req) {
  const where = req.query?.SELECT?.where;
  if (!where) return rows;
  const filters = [];
  for (let i = 0; i < where.length - 2; i += 1) {
    const field = where[i]?.ref?.[0];
    const operator = typeof where[i + 1] === 'string' ? where[i + 1] : where[i + 1]?.val;
    const expected = where[i + 2]?.val;
    if (field && operator === '=' && expected !== undefined) filters.push([field, expected]);
  }
  return filters.length ? rows.filter(row => filters.every(([key, expected]) => String(row[key]) === String(expected))) : rows;
}

function requestedNavigation(req) {
  const ref = req.query?.SELECT?.from?.ref || [];
  return ref[ref.length - 1];
}

module.exports = cds.service.impl(function () {
  const repository = createWorkbookRepository();
  const rawMappings = {
    ProducerOnboardings: 'producerOnboardings',
    Mk7Participants: 'participants',
    ConsumptionReadings: 'consumption',
    GenerationReadings: 'generation',
    EnergyPrices: 'prices',
    FieldDescriptions: 'fieldDescriptions',
    FinancialRules: 'financialRules'
  };
  const derived = {
    BuildingOverviews: 'buildingOverviews',
    ParticipantOverviews: 'participantOverviews',
    HourlyEnergyBalances: 'hourlyBalances',
    BuildingFinancialSummaries: 'financial',
    PortfolioSummary: 'portfolio'
  };
  const vnb = () => project(repository.getSnapshot());
  for (const [entity, property] of Object.entries(rawMappings)) {
    this.on('READ', entity, req => filterRows(repository.getSnapshot()[property], req));
  }
  for (const [entity, property] of Object.entries(derived)) {
    this.on('READ', entity, req => filterRows(calculate(repository.getSnapshot())[property], req));
  }
  for (const entity of ['Constructs', 'ConstructHourlyValues', 'Payments', 'DataQualityIssues', 'Buildings', 'MaLoConnections', 'TestScenarios']) {
    this.on('READ', entity, req => {
      const data = vnb();
       const property = { Constructs: 'constructs', ConstructHourlyValues: 'hourly', Payments: 'payments', DataQualityIssues: 'issues', Buildings: 'buildings', MaLoConnections: 'connections', TestScenarios: 'scenarios' }[entity];
      const nav = requestedNavigation(req);
       const source = nav === 'hourlyValues' ? data.hourly : nav === 'payments' ? data.payments : nav === 'sourceIssues' ? data.issues : data[property];
      const parentId = req.query?.SELECT?.from?.ref?.find(item => typeof item === 'object' && item.where)?.where?.find(item => item?.val)?.val;
      const rows = parentId ? source.filter(row => row.constructID === parentId || row.ID === parentId) : source;
      return filterRows(rows, req);
    });
  }
});
