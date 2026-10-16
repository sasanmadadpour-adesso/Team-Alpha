const cds = require('@sap/cds');
const { createWorkbookRepository } = require('./lib/workbook-loader');
const { calculate } = require('./lib/energy-calculator');
const { project } = require('./lib/vnb-projector');
const { trends } = require('./lib/energy-trends');
const { apply } = require('./lib/query');
const { localize, summarize } = require('./lib/data-quality');
const { stepLabel } = require('./lib/switchover');

const issueIndex = new WeakMap();
function issuesByConstruct(data) {
  if (!issueIndex.has(data)) {
    const index = new Map();
    for (const issue of data.issues) index.set(issue.constructID, [...(index.get(issue.constructID) || []), issue]);
    issueIndex.set(data, index);
  }
  return issueIndex.get(data);
}

function filterRows(rows, req) {
  return apply(rows, req);
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

function trendFilters(req) {
  const where = req.query?.SELECT?.where || [];
  const filters = {};
  for (let i = 0; i < where.length - 2; i += 1) {
    const field = where[i]?.ref?.[0];
    const operator = typeof where[i + 1] === 'string' ? where[i + 1] : where[i + 1]?.val;
    const value = where[i + 2]?.val;
    if (field && value !== undefined) filters[`${field}:${operator}`] = value;
  }
  const parentID = filters['parentID:='];
  const from = filters['bucketStart:>='];
  const to = filters['bucketStart:<'];
  if (!parentID || !from || !to) throw Object.assign(new Error('Trend requests require parentID, bucketStart >=, and bucketStart < filters'), { status: 400 });
  const start = new Date(from);
  const end = new Date(to);
  if (Number.isNaN(start.valueOf()) || Number.isNaN(end.valueOf()) || end <= start) throw Object.assign(new Error('Invalid trend date range'), { status: 400 });
  if ((end - start) / 86400000 > 365) throw Object.assign(new Error('Trend range cannot exceed 365 days'), { status: 400 });
  return { parentId: String(parentID), from, to };
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
     const { parentId, from, to } = trendFilters(req);
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
   for (const entity of ['Constructs', 'MaLoConnections', 'ConstructHourlyValues', 'Payments', 'DataQualityIssues', 'Buildings', 'BuildingConsumers', 'BuildingProducers', 'BuildingHourlyEnergy', 'ConstructEnergyTrends', 'BuildingEnergyTrends', 'ConstructTreeNodes']) {
     this.on('READ', entity, req => {
       if (entity === 'ConstructEnergyTrends') return trendRows(req, 'construct');
       if (entity === 'BuildingEnergyTrends') return trendRows(req, 'building');
       const data = vnb();
        const property = { Constructs: 'constructs', MaLoConnections: 'connections', ConstructHourlyValues: 'hourly', Payments: 'payments', DataQualityIssues: 'issues', Buildings: 'buildings', BuildingConsumers: 'consumers', BuildingProducers: 'producers', BuildingHourlyEnergy: 'buildingHourlyEnergy', ConstructTreeNodes: 'treeNodes' }[entity];
       const nav = requestedNavigation(req);
        const source = nav === 'hourlyValues' ? data.hourly : nav === 'payments' ? data.payments : nav === 'sourceIssues' ? data.issues : nav === 'members' ? data.connections : nav === 'consumers' ? data.consumers : nav === 'solarProducers' ? data.producers.filter(row => row.productionType === 'Solar') : nav === 'windProducers' ? data.producers.filter(row => row.productionType === 'Wind') : nav === 'producers' ? data.producers : nav === 'hourlyEnergy' ? data.buildingHourlyEnergy : data[property];
       const parentId = parentKey(req);
       const childEntity = ['BuildingConsumers', 'BuildingProducers', 'BuildingHourlyEnergy'].includes(entity);
       let rows = parentId ? source.filter(row => row.constructID === parentId || row.buildingID === parentId || row.ID === parentId) : source;
       if (source === data.issues) rows = rows.map(row => localize(row, req.locale));
       if (source === data.constructs) {
         const byConstruct = issuesByConstruct(data);
         rows = rows.map(row => (byConstruct.has(row.ID) ? { ...row, warningText: summarize(byConstruct.get(row.ID), req.locale) } : row));
       }
       if (source === data.constructs || source === data.consumers || source === data.treeNodes) {
         rows = rows.map(row => ('switchoverStep' in row ? { ...row, switchoverStepLabel: stepLabel(row.switchoverStep, req.locale) } : row));
       }
       return filterRows(rows, req);
     });
   }
});
