const cds = require('@sap/cds');
const { createWorkbookRepository } = require('./lib/workbook-loader');
const { calculate } = require('./lib/energy-calculator');
const { project } = require('./lib/vnb-projector');
const { trends } = require('./lib/energy-trends');

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

function parentKey(req) {
  const ref = req.query?.SELECT?.from?.ref || [];
  const parent = ref.find(item => item && typeof item === 'object' && item.where);
  const value = parent?.where?.find(item => item?.val !== undefined);
  return value?.val;
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
   let calculated;
   let projected;
   let projectedMtime;
   const getCalculated = () => {
     const snapshot = repository.getSnapshot();
     if (!calculated || calculated.snapshot !== snapshot) calculated = { snapshot, ...calculate(snapshot) };
     return calculated;
   };
   const vnb = () => {
     const snapshot = repository.getSnapshot();
     if (!projected || projectedMtime !== snapshot) { projected = project(snapshot); projectedMtime = snapshot; }
     return projected;
   };
  const trendRows = (req, parentType) => {
    const where = req.query?.SELECT?.where || [];
     const values = [];
     for (let i = 0; i < where.length; i += 1) {
       const field = where[i]?.ref?.[0];
       const operator = typeof where[i + 1] === 'string' ? where[i + 1] : where[i + 1]?.val;
       const value = where[i + 2]?.val;
       if (field && value !== undefined) values.push([field, operator, value]);
     }
     const valueFor = (field, operator) => values.find(([name, comparison]) => name === field && (!operator || comparison === operator))?.[2];
     const parentId = valueFor('parentID', '=');
     const from = valueFor('bucketStart', '>=') || valueFor('from', '=');
     const to = valueFor('bucketStart', '<') || valueFor('to', '=');
     const snapshot = repository.getSnapshot();
    if (parentType === 'construct') {
       const rows = vnb().hourly.filter(row => row.constructID === parentId).map(row => ({ startTime: row.startTime, eligibleConsumptionKwh: row.consumptionKwh, generationKwh: row.generationKwh, localEnergyKwh: row.localAllocationKwh, residualGridEnergyKwh: row.residualGridKwh, exportEnergyKwh: row.exportKwh }));
       return trends(snapshot, { parentType, parentId, from, to, sourceRows: rows });
     }
     return trends({ ...snapshot, hourlyBalances: getCalculated().hourlyBalances }, { parentType, parentId, from, to });
  };
  for (const [entity, property] of Object.entries(rawMappings)) {
    this.on('READ', entity, req => filterRows(repository.getSnapshot()[property], req));
  }
  for (const [entity, property] of Object.entries(derived)) {
     this.on('READ', entity, req => filterRows(getCalculated()[property], req));
  }
  for (const entity of ['Constructs', 'ConstructHourlyValues', 'Payments', 'DataQualityIssues', 'Buildings', 'BuildingConsumers', 'BuildingProducers', 'BuildingHourlyEnergy', 'ConstructEnergyTrends', 'BuildingEnergyTrends']) {
    this.on('READ', entity, req => {
      const data = vnb();
      if (entity === 'ConstructEnergyTrends') return trendRows(req, 'construct');
      if (entity === 'BuildingEnergyTrends') return trendRows(req, 'building');
      const property = { Constructs: 'constructs', ConstructHourlyValues: 'hourly', Payments: 'payments', DataQualityIssues: 'issues', Buildings: 'buildings', BuildingConsumers: 'consumers', BuildingProducers: 'producers', BuildingHourlyEnergy: 'buildingHourlyEnergy' }[entity];
      const nav = requestedNavigation(req);
      const source = nav === 'hourlyValues' ? data.hourly : nav === 'payments' ? data.payments : nav === 'sourceIssues' ? data.issues : nav === 'consumers' ? data.consumers : nav === 'producers' ? data.producers : nav === 'hourlyEnergy' ? data.buildingHourlyEnergy : data[property];
      const parentId = parentKey(req);
      const childEntity = ['BuildingConsumers', 'BuildingProducers', 'BuildingHourlyEnergy'].includes(entity);
      const rows = parentId ? source.filter(row => row.constructID === parentId || row.buildingID === parentId || row.ID === parentId) : source;
      return filterRows(rows, req);
    });
  }
});
