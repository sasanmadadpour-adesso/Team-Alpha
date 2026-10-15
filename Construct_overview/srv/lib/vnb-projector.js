const { calculate } = require('./energy-calculator');

const round = (value, digits = 3) => Number((Number(value) || 0).toFixed(digits));
const sum = (rows, field) => rows.reduce((total, row) => total + (Number(row[field]) || 0), 0);
const key = (value) => String(value || '').replace(/[^A-Za-z0-9_-]/g, '_');

function direction(role) {
  if (role === 'Household Consumption') return ['CONSUMPTION', 'Verbrauch / Consumption'];
  if (role === 'Residual Supply Market Location') return ['RESIDUAL', 'Reststrom / Residual supply'];
  return ['GENERATION', 'Erzeugung / Generation'];
}

function project(snapshot) {
  const result = calculate(snapshot);
  const balances = result.hourlyBalances;
  const byBuilding = new Map(result.buildingOverviews.map(row => [row.buildingId, row]));
  const participantsByBuilding = new Map();
  for (const participant of snapshot.participants) {
    if (!participantsByBuilding.has(participant.buildingId)) participantsByBuilding.set(participant.buildingId, []);
    participantsByBuilding.get(participant.buildingId).push(participant);
  }
  const producerByIdentifier = new Map(snapshot.producerOnboardings.map(row => [row.marketLocationIdentifier, row]));
  const participantTotals = new Map(result.participantOverviews.map(row => [row.meteringLocationId, row]));
  const consumptionByMeterTime = new Map(snapshot.consumption.map(row => [`${row.meteringLocationId}-${row.startTime}`, row]));
  const generationByMarketTime = new Map(snapshot.generation.map(row => [`${row.marketLocationId}-${row.startTime}`, row]));
  const eligibleByBuildingTime = new Map();
  for (const row of snapshot.consumption) {
    const participant = snapshot.participants.find(p => p.meteringLocationId === row.meteringLocationId);
    if (participant?.role === 'Household Consumption' && participant.participation === 'Ja') { const bucket = `${row.buildingId}-${row.startTime}`; if (!eligibleByBuildingTime.has(bucket)) eligibleByBuildingTime.set(bucket, []); eligibleByBuildingTime.get(bucket).push(row); }
  }
  const constructById = new Map();
  const hourly = [];

  for (const participant of snapshot.participants) {
    const building = byBuilding.get(participant.buildingId) || {};
    const producer = producerByIdentifier.get(participant.ID);
    const [directionCode, directionLabel] = direction(participant.role);
    const importMaLo = participant.importMarketLocationId;
    const exportMaLo = participant.exportMarketLocationId;
    const totals = participantTotals.get(participant.meteringLocationId);
    const dual = Boolean(importMaLo && exportMaLo && importMaLo !== exportMaLo);
    const warning = snapshot.producerOnboardings.some(row => row.marketLocationIdentifier === participant.meteringLocationId);
    const displayName = `${participant.role} · ${participant.city || participant.buildingId}`;
    const construct = {
      ID: participant.ID,
      displayName,
      primaryMaLo: importMaLo || exportMaLo || producer?.marketLocationIdentifier || participant.meteringLocationId,
      importMaLo,
      exportMaLo,
      meLo: participant.meteringLocationId,
      city: participant.city,
      streetAddress: participant.streetAddress,
      meterNumber: participant.meterNumber,
      roleCode: participant.role === 'Household Consumption' ? 'HOUSEHOLD' : directionCode,
      roleLabel: participant.role,
      directionCode,
      participationCode: participant.participation === 'Ja' ? 'YES' : 'NO',
      participationLabel: participant.participation === 'Ja' ? 'Ja / Yes' : 'Nein / No',
      isEligible: participant.role === 'Household Consumption' && participant.participation === 'Ja',
      hasDualMaLo: dual,
      hasDataWarning: warning,
      warningCode: warning ? 'ID_SEMANTIC_CONFLICT' : null,
      warningText: warning ? `Identifier ${participant.meteringLocationId} is used as producer MaLo and participant MeLo.` : null,
      totalConsumptionKwh: totals?.totalConsumptionKwh || 0,
      totalGenerationKwh: 0,
      localEnergyKwh: totals?.localEnergyAllocatedKwh || 0,
      residualGridKwh: totals?.residualGridEnergyKwh || 0,
      exportKwh: 0,
      paymentBalanceEur: 0,
      meteringSystem: participant.meteringSystem,
      meteringOperator: participant.meteringOperator,
      mk7Operator: participant.operator,
      supplyStart: participant.supplyStartUtc,
      contractStart: participant.contractStartUtc,
      contractEnd: participant.contractEndUtc,
      sourceRow: participant.sourceRow,
      buildingID: participant.buildingId,
      energyConceptCurrentStep: participant.energyConceptCurrentStep,
      energyConceptContactCompleted: participant.energyConceptContactCompleted,
      energyConceptDataVerified: participant.energyConceptDataVerified,
      energyConceptAgreementSigned: participant.energyConceptAgreementSigned,
      energyConceptMeterReady: participant.energyConceptMeterReady,
      energyConceptActive: participant.energyConceptActive,
      participationCriticality: participant.participation === 'Ja' ? 3 : 2,
      warningCriticality: warning ? 2 : 3,
      directionLabel
    };
    if (producer) {
      const producerRows = snapshot.generation.filter(row => row.marketLocationId === producer.marketLocationIdentifier);
      const buildingBalances = balances.filter(row => row.buildingId === participant.buildingId);
      const generationTotal = sum(producerRows, 'generationKwh');
      const buildingGeneration = sum(buildingBalances, 'generationKwh');
      const share = buildingGeneration ? generationTotal / buildingGeneration : 0;
      construct.totalGenerationKwh = round(generationTotal);
      construct.localEnergyKwh = round(sum(buildingBalances, 'localEnergyKwh') * share);
      construct.exportKwh = round(sum(buildingBalances, 'exportEnergyKwh') * share);
      construct.contractStart = producer.contractStartUtc || construct.contractStart;
      construct.contractEnd = producer.contractEndUtc || construct.contractEnd;
    }
    constructById.set(construct.ID, construct);

    const participantConsumption = snapshot.consumption.filter(row => row.meteringLocationId === participant.meteringLocationId);
    const relevantBalances = balances.filter(row => row.buildingId === participant.buildingId);
    for (const balance of relevantBalances) {
      let row = { consumptionKwh: 0, generationKwh: 0, localAllocationKwh: 0, residualGridKwh: 0, exportKwh: 0 };
      if (participant.role === 'Household Consumption') {
        const consumption = consumptionByMeterTime.get(`${participant.meteringLocationId}-${balance.startTime}`);
        const eligibleAtHour = eligibleByBuildingTime.get(`${participant.buildingId}-${balance.startTime}`) || [];
        const total = sum(eligibleAtHour, 'consumptionKwh');
        const share = total ? (consumption?.consumptionKwh || 0) / total : 0;
        row = { consumptionKwh: consumption?.consumptionKwh || 0, generationKwh: 0, localAllocationKwh: balance.localEnergyKwh * share, residualGridKwh: balance.residualGridEnergyKwh * share, exportKwh: 0 };
      } else if (producer) {
        const generation = generationByMarketTime.get(`${producer.marketLocationIdentifier}-${balance.startTime}`);
        const share = balance.generationKwh ? (generation?.generationKwh || 0) / balance.generationKwh : 0;
        row = { consumptionKwh: 0, generationKwh: generation?.generationKwh || 0, localAllocationKwh: balance.localEnergyKwh * share, residualGridKwh: 0, exportKwh: balance.exportEnergyKwh * share };
      } else {
        row = { consumptionKwh: balance.eligibleConsumptionKwh, generationKwh: 0, localAllocationKwh: balance.localEnergyKwh, residualGridKwh: balance.residualGridEnergyKwh, exportKwh: 0 };
      }
      hourly.push({ ID: `${key(participant.ID)}-${key(balance.startTime)}`, constructID: participant.ID, startTime: balance.startTime, endTime: balance.endTime, hourLabel: new Date(balance.startTime).toISOString().slice(11, 16), consumptionKwh: round(row.consumptionKwh), generationKwh: round(row.generationKwh), localAllocationKwh: round(row.localAllocationKwh), residualGridKwh: round(row.residualGridKwh), exportKwh: round(row.exportKwh), marketPriceEurKwh: balance.marketPriceEurKwh });
    }
  }

  const payments = [];
  for (const construct of constructById.values()) {
    const prices = snapshot.prices;
    const rows = hourly.filter(row => row.constructID === construct.ID);
    const add = (code, payer, recipient, quantity, unit, rate, directionCode) => { const amount = round(quantity * (Number(rate) || 0), 2); payments.push({ ID: `${key(construct.ID)}-${code}`, constructID: construct.ID, paymentTypeCode: code, paymentTypeLabel: code, payer, recipient, quantity: round(quantity), unit, rate: round(rate, 6), amount, directionCode, amountCriticality: amount < 0 ? 2 : 3 }); construct.paymentBalanceEur = round(construct.paymentBalanceEur + amount, 2); };
    if (construct.roleCode === 'HOUSEHOLD') {
      add('PARTICIPANT_BILL', 'Participant', 'Operator', sum(rows, 'consumptionKwh'), 'kWh', prices[0]?.retailPriceEurKwh, 'INCOMING');
      add('LOCAL_PURCHASE', 'Operator', 'Producer', sum(rows, 'localAllocationKwh'), 'kWh', prices[0]?.plantPurchasePriceEurKwh, 'OUTGOING');
      add('RESIDUAL_PROCUREMENT', 'Operator', 'Supplier', sum(rows, 'residualGridKwh'), 'kWh', prices[0]?.marketPriceEurKwh, 'OUTGOING');
    } else if (construct.roleCode === 'GENERATION') {
      add('EXPORT_REMUNERATION', 'Operator', 'Producer', sum(rows, 'exportKwh'), 'kWh', prices[0]?.exportRemunerationEurKwh, 'OUTGOING');
      add('LOCAL_PURCHASE', 'Operator', 'Producer', sum(rows, 'localAllocationKwh'), 'kWh', prices[0]?.plantPurchasePriceEurKwh, 'OUTGOING');
      add('SOLAR_SUBSIDY', 'Operator', 'Producer', sum(rows, 'localAllocationKwh'), 'kWh', prices[0]?.mieterstromSubsidyEurKwh, 'OUTGOING');
    } else {
      add('RESIDUAL_PROCUREMENT', 'Operator', 'Supplier', sum(rows, 'residualGridKwh'), 'kWh', prices[0]?.marketPriceEurKwh, 'OUTGOING');
    }
    add('METERING_SERVICE', 'Operator', 'Metering operator', 1, 'meter/24h', prices[0]?.meteringFeeEurPerMeter24h, 'OUTGOING');
  }
  const issues = [];
  for (const construct of constructById.values()) if (construct.hasDataWarning) issues.push({ ID: `${key(construct.ID)}-ID_SEMANTIC_CONFLICT`, constructID: construct.ID, severityCode: 'WARNING', fieldName: 'market_location_identifier', sourceValue: construct.meLo, issueText: construct.warningText, severityCriticality: 2 });
  const consumers = [...constructById.values()].filter(row => row.roleCode === 'HOUSEHOLD').map(row => ({
    ID: row.ID, buildingID: row.buildingID, meLo: row.meLo, importMaLo: row.importMaLo, exportMaLo: row.exportMaLo,
    participationCode: row.participationCode, participationLabel: row.participationLabel, isEligible: row.isEligible,
    energyConceptCurrentStep: row.energyConceptCurrentStep || 1, energyConceptTotalSteps: 5,
    energyConceptContactCompleted: Boolean(row.energyConceptContactCompleted), energyConceptDataVerified: Boolean(row.energyConceptDataVerified),
    energyConceptAgreementSigned: Boolean(row.energyConceptAgreementSigned), energyConceptMeterReady: Boolean(row.energyConceptMeterReady), energyConceptActive: Boolean(row.energyConceptActive),
    totalConsumptionKwh: row.totalConsumptionKwh, localEnergyKwh: row.localEnergyKwh, residualGridKwh: row.residualGridKwh,
    localEnergySharePercent: row.totalConsumptionKwh ? round(row.localEnergyKwh / row.totalConsumptionKwh * 100, 1) : 0
  }));
  const producers = snapshot.producerOnboardings.map(producer => {
    const construct = constructById.get(producer.marketLocationIdentifier);
    return { ID: producer.marketLocationIdentifier, buildingID: producer.buildingId, productionType: producer.productionType, marketLocationIdentifier: producer.marketLocationIdentifier, installedCapacityKw: producer.plantCapacityKw, generationKwh: construct?.totalGenerationKwh || 0, localEnergyKwh: construct?.localEnergyKwh || 0, exportKwh: construct?.exportKwh || 0, localUtilizationPercent: construct?.totalGenerationKwh ? round(construct.localEnergyKwh / construct.totalGenerationKwh * 100, 1) : 0 };
  });
  const buildingHourlyEnergy = balances.map(row => ({ ID: row.ID, buildingID: row.buildingId, startTime: row.startTime, endTime: row.endTime, hourLabel: new Date(row.startTime).toISOString().slice(11, 16), consumptionKwh: row.eligibleConsumptionKwh, generationKwh: row.generationKwh, localEnergyKwh: row.localEnergyKwh, residualGridKwh: row.residualGridEnergyKwh, exportKwh: row.exportEnergyKwh, marketPriceEurKwh: row.marketPriceEurKwh }));
  const buildings = result.buildingOverviews.map(building => {
    const buildingConsumers = consumers.filter(row => row.buildingID === building.buildingId);
    const progress = buildingConsumers.length ? sum(buildingConsumers, 'energyConceptCurrentStep') / buildingConsumers.length : 0;
    return { ID: building.buildingId, city: building.city, postalCode: snapshot.participants.find(row => row.buildingId === building.buildingId)?.cityPostalCode?.match(/\b\d{5}\b/)?.[0] || null, streetAddress: building.address, operatorName: building.operator, latitude: snapshot.producerOnboardings.find(row => row.buildingId === building.buildingId)?.latitude || null, longitude: snapshot.producerOnboardings.find(row => row.buildingId === building.buildingId)?.longitude || null, productionTypes: building.productionTypes, installedCapacityKw: building.installedCapacityKw, consumerCount: buildingConsumers.length, participatingConsumerCount: buildingConsumers.filter(row => row.isEligible).length, activeConsumerCount: buildingConsumers.filter(row => row.energyConceptActive).length, averageEnergyConceptStep: round(progress, 1), totalEnergyConceptSteps: 5, totalConsumptionKwh: building.totalConsumptionKwh, totalGenerationKwh: building.totalGenerationKwh, localEnergyKwh: building.localEnergyKwh, residualGridKwh: building.residualGridEnergyKwh, exportKwh: building.exportEnergyKwh, selfSufficiencyPercent: building.selfSufficiencyPercent };
  });
  return { constructs: [...constructById.values()], hourly, payments, issues, buildings, consumers, producers, buildingHourlyEnergy, portfolio: [{ ID: 'ALL', buildingCount: result.portfolio[0].buildingCount, constructCount: constructById.size, eligibleMeterCount: result.portfolio[0].eligibleHouseholdCount, warningCount: issues.length, consumptionKwh: result.portfolio[0].totalConsumptionKwh, generationKwh: result.portfolio[0].totalGenerationKwh, localEnergyKwh: result.portfolio[0].localEnergyKwh, residualGridKwh: result.portfolio[0].residualGridEnergyKwh, exportKwh: result.portfolio[0].exportEnergyKwh, localCoveragePercent: result.portfolio[0].totalConsumptionKwh ? round(result.portfolio[0].localEnergyKwh / result.portfolio[0].totalConsumptionKwh * 100, 1) : 0 }], buildingsById: new Map(buildings.map(row => [row.ID, row])) };
}

module.exports = { project };
