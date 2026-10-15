const cds = require('@sap/cds');
const { createWorkbookRepository } = require('./lib/workbook-loader');
const { calculate } = require('./lib/energy-calculator');

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
  for (const [entity, property] of Object.entries(rawMappings)) {
    this.on('READ', entity, req => filterRows(repository.getSnapshot()[property], req));
  }
  for (const [entity, property] of Object.entries(derived)) {
    this.on('READ', entity, req => filterRows(calculate(repository.getSnapshot())[property], req));
  }
});
