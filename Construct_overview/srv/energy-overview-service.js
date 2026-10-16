const cds = require('@sap/cds');
const { createWorkbookRepository } = require('./lib/workbook-loader');
const { calculate } = require('./lib/energy-calculator');
const { project } = require('./lib/vnb-projector');
const { trends } = require('./lib/energy-trends');
const { apply } = require('./lib/query');
const { localize, summarize } = require('./lib/data-quality');
const { stepLabel } = require('./lib/switchover');
const { getLiveConstructSync } = require('./lib/live-construct-sync');

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
  const liveSync = getLiveConstructSync();
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
   this.on('READ', 'PendingConstructs', async req => {
     const key = parentKey(req);
     if (key) {
       const cached = liveSync.pending().find(row => row.ID === key || row.primaryMaLo === key);
       if (cached) return filterRows([await liveSync.detail('pending', cached.primaryMaLo)], req);
     }
     return filterRows(liveSync.pending(), req);
   });
   this.on('READ', 'ConstructLifecycleView', req => {
     const data = vnb();
     liveSync.seedRegistered(data.constructs);
     const registered = liveSync.registeredIsAuthoritative() ? liveSync.registered() : data.constructs;
     const registeredMaLos = new Set(registered.map(row => row.primaryMaLo));
     const registeredStatus = liveSync.statuses().find(row => row.ID === 'registered');
     const pendingStatus = liveSync.statuses().find(row => row.ID === 'pending');
     const rows = [
       ...registered.map(row => ({
         ID: `registered-${row.ID || row.primaryMaLo}`,
         primaryMaLo: row.primaryMaLo,
         meLo: row.meLo,
         displayName: row.displayName || row.primaryMaLo,
         roleLabel: row.roleLabel || row.roleCode,
         directionCode: row.directionCode,
         city: row.city,
         streetAddress: row.streetAddress || row.address,
         lifecycleStatus: 'UMGESTELLT',
         lifecycleCriticality: 3,
         sourceSystem: 'UMSTELLUNG',
         receivedAt: row.receivedAt || null,
         lastSyncedAt: registeredStatus?.lastSuccessAt,
         syncState: registeredStatus?.stale ? 'STALE' : 'CURRENT',
         detailHash: `#/Constructs('${encodeURIComponent(row.ID || `external-${row.primaryMaLo}`)}')`
       })),
       ...liveSync.pending()
         .filter(row => !registeredMaLos.has(row.primaryMaLo))
         .map(row => ({
           ID: `pending-${row.ID || row.primaryMaLo}`,
           primaryMaLo: row.primaryMaLo,
           meLo: row.meLo,
           displayName: row.displayName || row.primaryMaLo,
           roleLabel: row.roleLabel || row.roleCode,
           directionCode: row.directionCode,
           city: row.city,
           streetAddress: row.streetAddress,
           lifecycleStatus: 'PENDING',
           lifecycleCriticality: 2,
           sourceSystem: 'ANMELDEN',
           receivedAt: row.receivedAt,
           lastSyncedAt: pendingStatus?.lastSuccessAt,
           syncState: pendingStatus?.stale ? 'STALE' : 'CURRENT',
           detailHash: null
         }))
     ];
     return filterRows(rows, req);
   });
   this.on('READ', 'ConstructSyncStatus', req => filterRows(liveSync.statuses(), req));
   this.on('READ', 'ConstructSyncAudit', req => filterRows(liveSync.audit(), req));
   this.on('syncConstructs', async () => {
     await liveSync.syncNow();
     return liveSync.statuses();
   });

   for (const entity of ['Constructs', 'MaLoConnections', 'ConstructHourlyValues', 'Payments', 'DataQualityIssues', 'Buildings', 'BuildingConsumers', 'BuildingProducers', 'BuildingHourlyEnergy', 'ConstructEnergyTrends', 'BuildingEnergyTrends', 'ConstructTreeNodes']) {
     this.on('READ', entity, async req => {
       if (entity === 'ConstructEnergyTrends') return trendRows(req, 'construct');
       if (entity === 'BuildingEnergyTrends') return trendRows(req, 'building');
        const data = vnb();
        // Seed lazily so CAP can begin listening without projecting the full workbook.
        // Once Umstellung has answered (including an empty snapshot), it remains authoritative.
        liveSync.seedRegistered(data.constructs);
        const property = { Constructs: 'constructs', MaLoConnections: 'connections', ConstructHourlyValues: 'hourly', Payments: 'payments', DataQualityIssues: 'issues', Buildings: 'buildings', BuildingConsumers: 'consumers', BuildingProducers: 'producers', BuildingHourlyEnergy: 'buildingHourlyEnergy', ConstructTreeNodes: 'treeNodes' }[entity];
       const nav = requestedNavigation(req);
        let registeredConstructs = liveSync.registeredIsAuthoritative() ? liveSync.registered() : data.constructs;
        const requestedKey = parentKey(req);
        if (entity === 'Constructs' && requestedKey && liveSync.registeredIsAuthoritative()) {
          const cached = registeredConstructs.find(row => row.ID === requestedKey || row.primaryMaLo === requestedKey);
          if (cached) registeredConstructs = [await liveSync.detail('registered', cached.primaryMaLo)];
        }
         const externalTree = registeredConstructs.map(row => ({
          ID: row.ID || `external-${row.primaryMaLo}`,
          parentID: null,
          nodeType: row.nodeType || 'CONSTRUCT',
          displayName: row.displayName || row.primaryMaLo,
          malo: row.primaryMaLo,
          meLo: row.meLo,
          roleLabel: row.roleLabel || row.roleCode,
          city: row.city,
          streetAddress: row.streetAddress,
          participationMark: row.participationMark,
          participationCriticality: row.participationCriticality,
          totalConsumptionKwh: row.totalConsumptionKwh,
          totalGenerationKwh: row.totalGenerationKwh,
          localEnergyKwh: row.localEnergyKwh,
          residualGridKwh: row.residualGridKwh,
          exportKwh: row.exportKwh,
          hasDataWarning: row.hasDataWarning,
          warningCriticality: row.warningCriticality,
          detailHash: `#/Constructs('${encodeURIComponent(row.ID || `external-${row.primaryMaLo}`)}')`,
          ownerFirstName: row.ownerFirstName,
          ownerLastName: row.ownerLastName,
           ownerName: row.ownerName,
           lifecycleStatus: 'UMGESTELLT',
           lifecycleCriticality: 3,
           sourceSystem: 'UMSTELLUNG',
           syncState: liveSync.statuses().find(status => status.ID === 'registered')?.stale ? 'STALE' : 'CURRENT'
         }));
         const registeredMaLos = new Set(registeredConstructs.map(row => row.primaryMaLo));
         const registeredTree = (liveSync.registeredIsAuthoritative() ? externalTree : data.treeNodes).map(row => ({
           ...row,
           lifecycleStatus: 'UMGESTELLT',
           lifecycleCriticality: 3,
           sourceSystem: 'UMSTELLUNG',
           syncState: liveSync.statuses().find(status => status.ID === 'registered')?.stale ? 'STALE' : 'CURRENT'
         }));
         const pendingTree = liveSync.pending()
           .filter(row => !registeredMaLos.has(row.primaryMaLo))
           .map(row => ({
             ID: `pending-${row.ID || row.primaryMaLo}`,
             parentID: null,
             nodeType: 'PENDING',
             displayName: row.displayName || row.primaryMaLo,
             malo: row.primaryMaLo,
             meLo: row.meLo,
             roleLabel: row.roleLabel || row.roleCode,
             city: row.city,
             streetAddress: row.streetAddress,
             participationMark: null,
             participationCriticality: null,
             totalConsumptionKwh: null,
             totalGenerationKwh: null,
             localEnergyKwh: null,
             residualGridKwh: null,
             exportKwh: null,
             hasDataWarning: false,
             warningCriticality: null,
             detailHash: null,
             ownerFirstName: null,
             ownerLastName: null,
             ownerName: null,
             lifecycleStatus: 'PENDING',
             lifecycleCriticality: 2,
             sourceSystem: 'ANMELDEN',
             syncState: row.syncState
           }));
         const combinedTree = [...registeredTree, ...pendingTree];
         const source = nav === 'hourlyValues' ? data.hourly : nav === 'payments' ? data.payments : nav === 'sourceIssues' ? data.issues : nav === 'members' ? data.connections : nav === 'consumers' ? data.consumers : nav === 'solarProducers' ? data.producers.filter(row => row.productionType === 'Solar') : nav === 'windProducers' ? data.producers.filter(row => row.productionType === 'Wind') : nav === 'producers' ? data.producers : nav === 'hourlyEnergy' ? data.buildingHourlyEnergy : entity === 'Constructs' ? registeredConstructs : entity === 'ConstructTreeNodes' ? combinedTree : data[property];
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
