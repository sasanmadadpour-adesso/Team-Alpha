const { calculate } = require('./energy-calculator');
const { detect, summarize, worstSeverity, SEVERITY } = require('./data-quality');
const { TOTAL_STEPS, stepLabel } = require('./switchover');

const round = (value, digits = 3) => Number((Number(value) || 0).toFixed(digits));
const sum = (rows, field) => rows.reduce((total, row) => total + (Number(row[field]) || 0), 0);
const key = (value) => String(value || '').replace(/[^A-Za-z0-9_-]/g, '_');
const average = (rows, field) => rows.length ? round(sum(rows, field) / rows.length) : 0;

function latest24(rows, end) {
  const valid = rows.filter(row => row.startTime && !Number.isNaN(new Date(row.startTime).valueOf()));
  const latest = end || valid.map(row => new Date(row.startTime)).sort((a, b) => b - a)[0];
  if (!latest) return [];
  const from = new Date(latest.valueOf() - 23 * 60 * 60 * 1000);
  return valid.filter(row => { const date = new Date(row.startTime); return date >= from && date <= latest; });
}

function averageGrouped(rows, field) {
  const buckets = new Map();
  for (const row of rows) {
    const timestamp = row.startTime;
    if (!timestamp) continue;
    buckets.set(timestamp, (buckets.get(timestamp) || 0) + (Number(row[field]) || 0));
  }
  return buckets.size ? round([...buckets.values()].reduce((total, value) => total + value, 0) / buckets.size) : 0;
}

function latestTimestamp(rows) {
  return rows.map(row => row.startTime).filter(value => value && !Number.isNaN(new Date(value).valueOf())).sort().at(-1) || null;
}

function rowsInWindow(rows, latest) {
  if (!latest) return [];
  const end = new Date(latest);
  const start = new Date(end.valueOf() - 23 * 60 * 60 * 1000);
  return rows.filter(row => row.startTime && new Date(row.startTime) >= start && new Date(row.startTime) <= end);
}

// The building owner is the producer (plant operator) whose onboarding record belongs to the building.
// Several producers on one building would be joined with " · "; today every building has exactly one.
const NO_OWNER = { ownerFirstName: '', ownerLastName: '', ownerName: '' };
function ownersByBuilding(snapshot) {
  const groups = new Map();
  for (const row of snapshot.producerOnboardings) {
    if (!row.buildingId || !(row.firstName || row.lastName)) continue;
    if (!groups.has(row.buildingId)) groups.set(row.buildingId, []);
    groups.get(row.buildingId).push(row);
  }
  const owners = new Map();
  for (const [buildingId, rows] of groups) {
    const unique = values => [...new Set(values.filter(Boolean))].join(' · ');
    const ownerFirstName = unique(rows.map(row => row.firstName));
    const ownerLastName = unique(rows.map(row => row.lastName));
    owners.set(buildingId, { ownerFirstName, ownerLastName, ownerName: [ownerLastName, ownerFirstName].filter(Boolean).join(', ') });
  }
  return owners;
}

function direction(role) {
  if (role === 'Household Consumption') return ['CONSUMPTION', 'Verbrauch / Consumption'];
  if (role === 'Residual Supply Market Location') return ['RESIDUAL', 'Reststrom / Residual supply'];
  return ['GENERATION', 'Erzeugung / Generation'];
}

// MK7 participation is a three-state signal: not participating (error/red), participating but the
// eight-step energy concept is not finished yet (warning/yellow), participating and finished (success/green).
function participationCriticality(participation, role, step) {
  if (participation !== 'Ja') return 1;
  if (role === 'Household Consumption' && step != null && step < TOTAL_STEPS) return 2;
  return 3;
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
  const owners = ownersByBuilding(snapshot);
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
  const detectedIssues = detect(snapshot);
  const issuesByConstruct = new Map();
  for (const found of detectedIssues) issuesByConstruct.set(found.constructID, [...(issuesByConstruct.get(found.constructID) || []), found]);

  for (const participant of snapshot.participants) {
    const building = byBuilding.get(participant.buildingId) || {};
    const producer = producerByIdentifier.get(participant.exportMarketLocationId);
    const [directionCode, directionLabel] = direction(participant.role);
    const importMaLo = participant.importMarketLocationId;
    const exportMaLo = participant.exportMarketLocationId;
    const totals = participantTotals.get(participant.meteringLocationId);
    const dual = Boolean(importMaLo && exportMaLo && importMaLo !== exportMaLo);
    const participantIssues = issuesByConstruct.get(participant.ID) || [];
    const warning = participantIssues.length > 0;
    const worst = worstSeverity(participantIssues);
    const displayName = `${participant.role} · ${participant.city || participant.buildingId}`;
    const sharedMeter = snapshot.participants.find(row => row.buildingId === participant.buildingId && row.role === 'Residual Supply Market Location');
    const isSharedMeterRole = participant.role === 'Residual Supply Market Location';
    const isHouseholdRole = participant.role === 'Household Consumption';
    const postalCode = participant.cityPostalCode?.match(/\b\d{5}\b/)?.[0] || '';
    const street = String(participant.streetAddress || '').replace(/\s+/g, ' ').trim();
    const construct = {
      ...(owners.get(participant.buildingId) || NO_OWNER),
      address: [street, [postalCode, participant.city].filter(Boolean).join(' ')].filter(Boolean).join(', '),
      sharedMeterMaLo: sharedMeter?.importMarketLocationId || sharedMeter?.exportMarketLocationId || '',
      sharedMeterMeLo: sharedMeter?.meteringLocationId || '',
      sharedMeterIsReal: Boolean(sharedMeter?.meteringLocationId),
      sharedMeterConstructID: sharedMeter?.ID || '',
      isSharedMeter: isSharedMeterRole,
      counterKpiHidden: isSharedMeterRole,
      switchoverHidden: !isHouseholdRole || participant.switchoverStep >= TOTAL_STEPS,
      switchoverStepLabel: stepLabel(participant.switchoverStep, 'en'),
      buildingMemberCount: snapshot.participants.filter(row => row.buildingId === participant.buildingId && row.role === 'Household Consumption').length,
      ID: participant.ID,
      displayName,
      primaryMaLo: importMaLo || exportMaLo || participant.meteringLocationId,
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
      participationMark: '',
      isEligible: participant.role === 'Household Consumption' && participant.participation === 'Ja',
      hasDualMaLo: dual,
      hasDataWarning: warning,
      warningCode: warning ? participantIssues[0].issueCode : null,
      warningText: warning ? summarize(participantIssues, 'en') : null,
      dataQualityIssueCount: participantIssues.length,
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
      buildingLink: `#/Buildings('${participant.buildingId}')`, hasBuildingLink: true, hasNoBuildingLink: false,
      switchoverStep: participant.switchoverStep,
      switchoverTotalSteps: TOTAL_STEPS,
      switchoverComplete: participant.switchoverStep != null && participant.switchoverStep >= TOTAL_STEPS,
      participationCriticality: participationCriticality(participant.participation, participant.role, participant.switchoverStep),
      warningCriticality: warning ? SEVERITY[worst].criticality : 3,
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

  const connections = [];
  const plantByExportMaLo = new Map(snapshot.participants.filter(row => row.exportMarketLocationId).map(row => [row.exportMarketLocationId, row.ID]));
  for (const construct of constructById.values()) {
    const participant = snapshot.participants.find(row => row.ID === construct.ID);
    const producerRows = snapshot.producerOnboardings.filter(row => row.buildingId === construct.buildingID);
    const members = [
      [participant?.importMarketLocationId, 'IMPORT', 'HOUSEHOLD'],
      [participant?.exportMarketLocationId, 'EXPORT', 'HOUSEHOLD'],
      ...producerRows.map(row => [row.marketLocationIdentifier, 'EXPORT', row.productionType === 'Wind' ? 'WIND' : 'SOLAR'])
    ].filter(row => row[0]);
    const seen = new Set();
    for (const [malo, directionCode, roleCode] of members) {
      if (seen.has(malo)) continue;
      seen.add(malo);
      connections.push({ ID: `${key(construct.ID)}-${key(malo)}`, malo, meLo: construct.meLo, directionCode, roleCode, validFrom: construct.supplyStart, validTo: construct.contractEnd, supplier: null, contractReference: null, hasDataWarning: construct.hasDataWarning, warningText: construct.warningText, constructID: construct.ID, targetConstructID: plantByExportMaLo.get(malo) || null });
    }
    const recent = latest24(hourly.filter(row => row.constructID === construct.ID));
    const recentGeneration = latest24(snapshot.generation.filter(row => row.buildingId === construct.buildingID));
    const solar = recentGeneration.filter(row => row.productionType === 'Solar');
    const wind = recentGeneration.filter(row => row.productionType === 'Wind');
    construct.hasSolar = solar.length > 0;
    construct.hasWind = wind.length > 0;
    construct.averageConsumption24hKwh = average(recent, 'consumptionKwh');
    construct.averageSolarGeneration24hKwh = averageGrouped(solar, 'generationKwh');
    construct.averageWindGeneration24hKwh = averageGrouped(wind, 'generationKwh');
    construct.measurementIntervalCount24h = recent.length;
    construct.latestMeasurementTime = recent.map(row => row.startTime).filter(Boolean).sort().at(-1) || null;
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
  const issues = detectedIssues;
  const consumers = [...constructById.values()].filter(row => row.roleCode === 'HOUSEHOLD').map(row => ({
    ID: row.ID, buildingID: row.buildingID, meLo: row.meLo, importMaLo: row.importMaLo, exportMaLo: row.exportMaLo,
    participationCode: row.participationCode, participationLabel: row.participationLabel, participationMark: '', participationCriticality: row.participationCriticality, isEligible: row.isEligible,
    switchoverStep: row.switchoverStep || null, switchoverTotalSteps: TOTAL_STEPS, switchoverComplete: row.switchoverComplete,
    switchoverStepLabel: stepLabel(row.switchoverStep, 'en'), switchoverHidden: Boolean(row.switchoverComplete),
    totalConsumptionKwh: row.totalConsumptionKwh, localEnergyKwh: row.localEnergyKwh, residualGridKwh: row.residualGridKwh,
    localEnergySharePercent: row.totalConsumptionKwh ? round(row.localEnergyKwh / row.totalConsumptionKwh * 100, 1) : 0,
    targetConstructID: row.ID
  }));
  const producers = snapshot.producerOnboardings.map(producer => {
    const target = snapshot.participants.find(row => row.exportMarketLocationId === producer.marketLocationIdentifier);
    const construct = target && constructById.get(target.ID);
    return { ID: producer.marketLocationIdentifier, buildingID: producer.buildingId, productionType: producer.productionType, marketLocationIdentifier: producer.marketLocationIdentifier, installedCapacityKw: producer.plantCapacityKw, generationKwh: construct?.totalGenerationKwh || 0, localEnergyKwh: construct?.localEnergyKwh || 0, exportKwh: construct?.exportKwh || 0, localUtilizationPercent: construct?.totalGenerationKwh ? round(construct.localEnergyKwh / construct.totalGenerationKwh * 100, 1) : 0, targetConstructID: target?.ID || null };
  });
  const buildingHourlyEnergy = balances.map(row => ({ ID: row.ID, buildingID: row.buildingId, startTime: row.startTime, endTime: row.endTime, hourLabel: new Date(row.startTime).toISOString().slice(11, 16), consumptionKwh: row.eligibleConsumptionKwh, generationKwh: row.generationKwh, localEnergyKwh: row.localEnergyKwh, residualGridKwh: row.residualGridEnergyKwh, exportKwh: row.exportEnergyKwh, marketPriceEurKwh: row.marketPriceEurKwh }));
  const buildings = result.buildingOverviews.map(building => {
    const buildingConsumers = consumers.filter(row => row.buildingID === building.buildingId);
    const buildingParticipants = snapshot.participants.filter(row => row.buildingId === building.buildingId);
    const sharedMeter = buildingParticipants.find(row => row.role === 'Residual Supply Market Location');
    const householdParticipants = buildingParticipants.filter(row => row.role === 'Household Consumption');
    const includeAllHouseholds = Boolean(sharedMeter?.meteringLocationId);
    const selectedHouseholds = householdParticipants.filter(row => includeAllHouseholds || row.participation === 'Ja');
    const consumptionRows = snapshot.consumption.filter(row => selectedHouseholds.some(participant => participant.meteringLocationId === row.meteringLocationId));
    const producerRows = snapshot.producerOnboardings.filter(row => row.buildingId === building.buildingId);
    const generationRows = snapshot.generation.filter(row => producerRows.some(producer => producer.marketLocationIdentifier === row.marketLocationId));
    const latest = latestTimestamp([...consumptionRows, ...generationRows]);
    const recentConsumption = rowsInWindow(consumptionRows, latest);
    const recentSolar = rowsInWindow(generationRows.filter(row => row.productionType === 'Solar'), latest);
    const recentWind = rowsInWindow(generationRows.filter(row => row.productionType === 'Wind'), latest);
    const recentBalances = rowsInWindow(balances.filter(row => row.buildingId === building.buildingId), latest);
    const balanceHours = new Set(recentBalances.map(row => row.startTime)).size;
    const averageOf = field => (balanceHours ? round(sum(recentBalances, field) / balanceHours) : 0);
    const latestIntervals = [...new Set([...recentConsumption, ...recentSolar, ...recentWind].map(row => row.startTime))].sort();
    const counterConstruct = sharedMeter && constructById.get(sharedMeter.ID);
    if (counterConstruct) {
      counterConstruct.residualGridKwh = round(building.residualGridEnergyKwh);
      counterConstruct.exportKwh = round(building.exportEnergyKwh);
    }
    return {
      ...(owners.get(building.buildingId) || NO_OWNER),
      ID: building.buildingId, city: building.city, postalCode: snapshot.participants.find(row => row.buildingId === building.buildingId)?.cityPostalCode?.match(/\b\d{5}\b/)?.[0] || null,
      streetAddress: building.address, operatorName: building.operator,
      latitude: snapshot.producerOnboardings.find(row => row.buildingId === building.buildingId)?.latitude || null,
      longitude: snapshot.producerOnboardings.find(row => row.buildingId === building.buildingId)?.longitude || null,
      productionTypes: building.productionTypes, installedCapacityKw: building.installedCapacityKw,
      consumerCount: buildingConsumers.length, participatingConsumerCount: buildingConsumers.filter(row => row.isEligible).length,
      switchoverFinishedCount: buildingConsumers.filter(row => row.switchoverComplete).length,
      totalConsumptionKwh: building.totalConsumptionKwh, totalGenerationKwh: building.totalGenerationKwh,
      localEnergyKwh: building.localEnergyKwh, residualGridKwh: building.residualGridEnergyKwh, exportKwh: building.exportEnergyKwh,
      selfSufficiencyPercent: building.selfSufficiencyPercent,
      sharedMeterMaLo: sharedMeter?.importMarketLocationId || sharedMeter?.exportMarketLocationId || '',
      sharedMeterMeLo: sharedMeter?.meteringLocationId || '',
      sharedMeterIsReal: Boolean(sharedMeter?.meteringLocationId),
      sharedMeterIsVirtual: Boolean(sharedMeter && !sharedMeter.meteringLocationId),
      sharedMeterConstructID: sharedMeter?.ID || '',
      solarGenerationKwh: round(sum(generationRows.filter(row => row.productionType === 'Solar'), 'generationKwh')),
      windGenerationKwh: round(sum(generationRows.filter(row => row.productionType === 'Wind'), 'generationKwh')),
      solarHidden: !producerRows.some(row => row.productionType === 'Solar'),
      windHidden: !producerRows.some(row => row.productionType === 'Wind'),
      hasSolar: producerRows.some(row => row.productionType === 'Solar'), hasWind: producerRows.some(row => row.productionType === 'Wind'),
      solarProducerCount: producerRows.filter(row => row.productionType === 'Solar').length,
      windProducerCount: producerRows.filter(row => row.productionType === 'Wind').length,
      averageConsumption24hKwh: averageGrouped(recentConsumption, 'consumptionKwh'),
      averageSolarGeneration24hKwh: averageGrouped(recentSolar, 'generationKwh'),
      averageWindGeneration24hKwh: averageGrouped(recentWind, 'generationKwh'),
      averageGridImport24hKwh: averageOf('residualGridEnergyKwh'), averageGridExport24hKwh: averageOf('exportEnergyKwh'),
      consumptionIntervalCount24h: new Set(recentConsumption.map(row => row.startTime)).size,
      solarIntervalCount24h: new Set(recentSolar.map(row => row.startTime)).size,
      windIntervalCount24h: new Set(recentWind.map(row => row.startTime)).size,
      latestMeasurementTime: latestIntervals.at(-1) || null
    };
  });
  const constructs = [...constructById.values()];

  // Single tree for the combined overview page: one root per building, expandable into its
  // household consumers, solar/wind producers, and shared energy counter.
  const treeNodes = [];
  for (const building of buildings) {
    treeNodes.push({
      ID: `BLD-${key(building.ID)}`, parentID: null, nodeType: 'BUILDING', displayName: building.ID,
      ownerFirstName: building.ownerFirstName, ownerLastName: building.ownerLastName, ownerName: building.ownerName,
      malo: '', meLo: '', roleLabel: 'Building', city: building.city, streetAddress: building.streetAddress,
      participationMark: '', participationCriticality: 3,
      switchoverStep: null, switchoverTotalSteps: TOTAL_STEPS,
      totalConsumptionKwh: building.totalConsumptionKwh, totalGenerationKwh: building.totalGenerationKwh,
      localEnergyKwh: building.localEnergyKwh, residualGridKwh: building.residualGridKwh, exportKwh: building.exportKwh,
      hasDataWarning: false, warningCriticality: 3, detailHash: `#/Buildings('${building.ID}')`
    });
    const members = constructs.filter(row => row.buildingID === building.ID && (row.roleCode === 'HOUSEHOLD' || row.isSharedMeter));
    for (const member of members) {
      treeNodes.push({
        ID: `MBR-${key(member.ID)}`, parentID: `BLD-${key(building.ID)}`,
        nodeType: member.isSharedMeter ? 'COUNTER' : 'HOUSEHOLD', displayName: member.primaryMaLo,
        malo: member.primaryMaLo, meLo: member.meLo, roleLabel: member.roleLabel, city: member.city, streetAddress: member.streetAddress,
        participationMark: '', participationCriticality: member.isSharedMeter ? 3 : member.participationCriticality,
        switchoverStep: member.isSharedMeter ? null : member.switchoverStep, switchoverTotalSteps: TOTAL_STEPS,
        totalConsumptionKwh: member.totalConsumptionKwh, totalGenerationKwh: member.totalGenerationKwh,
        localEnergyKwh: member.localEnergyKwh, residualGridKwh: member.residualGridKwh, exportKwh: member.exportKwh,
        hasDataWarning: member.hasDataWarning, warningCriticality: member.warningCriticality, detailHash: `#/Constructs('${member.ID}')`
      });
    }
    const buildingProducers = producers.filter(row => row.buildingID === building.ID);
    for (const producer of buildingProducers) {
      treeNodes.push({
        ID: `PRD-${key(producer.ID)}`, parentID: `BLD-${key(building.ID)}`, nodeType: 'PRODUCER', displayName: producer.marketLocationIdentifier,
        malo: producer.marketLocationIdentifier, meLo: '', roleLabel: producer.productionType, city: building.city, streetAddress: building.streetAddress,
        participationMark: '', participationCriticality: 3,
        switchoverStep: null, switchoverTotalSteps: TOTAL_STEPS,
        totalConsumptionKwh: 0, totalGenerationKwh: producer.generationKwh, localEnergyKwh: producer.localEnergyKwh, residualGridKwh: 0, exportKwh: producer.exportKwh,
        hasDataWarning: false, warningCriticality: 3, detailHash: producer.targetConstructID ? `#/Constructs('${producer.targetConstructID}')` : ''
      });
    }
  }

  return {
    constructs, hourly, payments, issues, connections, buildings, consumers, producers, buildingHourlyEnergy, treeNodes,
    portfolio: [{
      ID: 'ALL', buildingCount: result.portfolio[0].buildingCount, constructCount: constructs.length,
      eligibleMeterCount: result.portfolio[0].eligibleHouseholdCount, warningCount: issues.length,
      consumptionKwh: result.portfolio[0].totalConsumptionKwh, generationKwh: result.portfolio[0].totalGenerationKwh,
      localEnergyKwh: result.portfolio[0].localEnergyKwh, residualGridKwh: result.portfolio[0].residualGridEnergyKwh,
      exportKwh: result.portfolio[0].exportEnergyKwh,
      localCoveragePercent: result.portfolio[0].totalConsumptionKwh ? round(result.portfolio[0].localEnergyKwh / result.portfolio[0].totalConsumptionKwh * 100, 1) : 0
    }],
    buildingsById: new Map(buildings.map(row => [row.ID, row]))
  };
}

module.exports = { project };
