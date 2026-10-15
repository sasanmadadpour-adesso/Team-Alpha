const { calculate } = require('./energy-calculator');
const { detect, summarize, worstSeverity, SEVERITY } = require('./data-quality');

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
const syntheticScenarios = [
  ['EDGE-MULTI-CONSUMER', 'Many consumer MaLos on one MeLo', 3, 0, 'Household + commercial', 'complete'],
  ['EDGE-MULTI-DIRECTION', 'Multiple import and export MaLos', 2, 2, 'Prosumer + solar', 'complete'],
  ['EDGE-SUPPLIER-OVERLAP', 'Overlapping supplier contracts', 2, 0, 'Household + suppliers', 'complete'],
  ['EDGE-BATTERY', 'Battery with bidirectional metering', 1, 1, 'Battery', 'zero and negative generation'],
  ['EDGE-WIND', 'Wind export exceeds local use', 0, 1, 'Wind', 'export-heavy'],
  ['EDGE-COMMERCIAL', 'Commercial consumer', 4, 0, 'Commercial', 'complete'],
  ['EDGE-MISSING-READINGS', 'Missing hourly readings', 2, 1, 'Household + solar', 'partial'],
  ['EDGE-INVALID', 'Invalid and ambiguous source values', 3, 2, 'All roles', 'invalid timestamps and prices']
];

function syntheticData() {
  const constructs = [], hourly = [], issues = [], connections = [], scenarios = [];
  syntheticScenarios.forEach(([code, title, imports, exports, roles, readings], index) => {
    const id = `TEST-${code}`;
    const meLo = `DE999999999999999999999999${String(index + 1).padStart(4, '0')}`;
    const malos = [];
    for (let i = 0; i < imports; i += 1) malos.push([`599${index}1${String(i + 1).padStart(6, '0')}`, 'IMPORT']);
    for (let i = 0; i < exports; i += 1) malos.push([`599${index}2${String(i + 1).padStart(6, '0')}`, 'EXPORT']);
    const warning = ['EDGE-SUPPLIER-OVERLAP', 'EDGE-MISSING-READINGS', 'EDGE-INVALID'].includes(code);
     constructs.push({ ID: id, displayName: `TEST · ${title}`, primaryMaLo: malos[0]?.[0] || '', importMaLo: malos.find(row => row[1] === 'IMPORT')?.[0] || '', exportMaLo: malos.find(row => row[1] === 'EXPORT')?.[0] || '', meLo, city: 'Teststadt', streetAddress: 'Edgeweg 1', meterNumber: `TEST-METER-${index + 1}`, hasSolar: code !== 'EDGE-WIND' && exports > 0, hasWind: code === 'EDGE-WIND', averageConsumption24hKwh: imports ? 1 : 0, averageSolarGeneration24hKwh: code !== 'EDGE-WIND' && exports > 0 ? 3 : 0, averageWindGeneration24hKwh: code === 'EDGE-WIND' ? 3 : 0, measurementIntervalCount24h: 24, latestMeasurementTime: '2026-11-01T23:00:00Z', roleCode: exports ? 'GENERATION' : 'HOUSEHOLD', roleLabel: roles, directionCode: imports && exports ? 'BIDIRECTIONAL' : exports ? 'GENERATION' : 'CONSUMPTION', participationCode: 'YES', participationLabel: 'Ja / Yes', participationMark: '', isEligible: !exports, hasDualMaLo: Boolean(imports && exports), hasDataWarning: warning, warningCode: warning ? 'SYNTHETIC_EDGE_CASE' : null, warningText: warning ? `Synthetic edge case: ${title}.` : null, totalConsumptionKwh: imports ? 24 : 2.4, totalGenerationKwh: exports ? 36 : 0, localEnergyKwh: exports ? 6 : 0, residualGridKwh: imports ? 18 : 0, exportKwh: exports ? 30 : 0, paymentBalanceEur: 0, meteringSystem: 'iMS/TF', meteringOperator: 'Synthetic Metering', mk7Operator: 'Synthetic VNB', supplyStart: '2026-11-01T00:00:00Z', contractStart: '2026-11-01T00:00:00Z', contractEnd: '2026-11-03T00:00:00Z', sourceRow: -index - 1, buildingID: 'B-EDGE-01', address: 'Edgeweg 1, Teststadt', sharedMeterMaLo: '', sharedMeterMeLo: '', sharedMeterIsReal: false, sharedMeterConstructID: '', isSharedMeter: false, buildingMemberCount: 0, buildingLink: '', hasBuildingLink: false, hasNoBuildingLink: true, participationCriticality: 3, warningCriticality: warning ? 2 : 3, directionLabel: 'Synthetic / Test', isSynthetic: true, testScenario: code });
     malos.forEach(([malo, directionCode], maloIndex) => connections.push({ ID: `${id}-${malo}`, malo, meLo, directionCode, roleCode: constructs.at(-1).roleCode, validFrom: '2026-11-01T00:00:00Z', validTo: maloIndex === 1 && code === 'EDGE-SUPPLIER-OVERLAP' ? '2026-11-04T00:00:00Z' : '2026-11-03T00:00:00Z', supplier: `Test Supplier ${maloIndex + 1}`, contractReference: `${code}-${maloIndex + 1}`, isSynthetic: true, hasDataWarning: warning || code === 'EDGE-SUPPLIER-OVERLAP', warningText: warning ? `Synthetic edge case: ${title}.` : null, scenarioCode: code, constructID: id, targetConstructID: null }));
    for (let hour = 0; hour < 24; hour += 1) { const missing = code === 'EDGE-MISSING-READINGS' && [5, 6, 17].includes(hour); hourly.push({ ID: `${id}-${hour}`, constructID: id, startTime: missing ? null : `2026-11-01T${String(hour).padStart(2, '0')}:00:00Z`, endTime: null, hourLabel: `${String(hour).padStart(2, '0')}:00`, consumptionKwh: missing ? null : imports ? 1 : 0, generationKwh: missing ? null : exports ? 3 : 0, localAllocationKwh: missing ? null : 1, residualGridKwh: missing ? null : 0, exportKwh: missing ? null : exports ? 2 : 0, marketPriceEurKwh: missing ? null : code === 'EDGE-INVALID' && hour === 10 ? -0.05 : 0.12 }); }
    if (warning) issues.push({ ID: `${id}-SYNTHETIC_EDGE_CASE`, constructID: id, severityCode: 'WARNING', severityCriticality: SEVERITY.WARNING.criticality, issueCode: 'SYNTHETIC_EDGE_CASE', fieldName: 'scenario', sourceValue: code, params: { scenario: title } });
    scenarios.push({ ID: code, title, description: `Synthetic dataset scenario: ${title}.`, relationshipShape: `${imports} import + ${exports} export MaLos → 1 MeLo`, roleCoverage: roles, readingCoverage: readings, warningCount: warning ? 1 : 0, isSynthetic: true });
  });
  for (const construct of constructs) {
    const rows = hourly.filter(row => row.constructID === construct.ID);
    construct.totalConsumptionKwh = sum(rows, 'consumptionKwh');
    construct.totalGenerationKwh = sum(rows, 'generationKwh');
    construct.localEnergyKwh = sum(rows, 'localAllocationKwh');
    construct.residualGridKwh = sum(rows, 'residualGridKwh');
    construct.exportKwh = sum(rows, 'exportKwh');
  }
  return { constructs, hourly, issues, connections, scenarios };
}

function direction(role) {
  if (role === 'Household Consumption') return ['CONSUMPTION', 'Verbrauch / Consumption'];
  if (role === 'Residual Supply Market Location') return ['RESIDUAL', 'Reststrom / Residual supply'];
  return ['GENERATION', 'Erzeugung / Generation'];
}

function project(snapshot) {
  const result = calculate(snapshot);
  const synthetic = syntheticData();
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
    const postalCode = participant.cityPostalCode?.match(/\b\d{5}\b/)?.[0] || '';
    const street = String(participant.streetAddress || '').replace(/\s+/g, ' ').trim();
    const construct = {
      address: [street, [postalCode, participant.city].filter(Boolean).join(' ')].filter(Boolean).join(', '),
      sharedMeterMaLo: sharedMeter?.importMarketLocationId || sharedMeter?.exportMarketLocationId || '',
      sharedMeterMeLo: sharedMeter?.meteringLocationId || '',
      sharedMeterIsReal: Boolean(sharedMeter?.meteringLocationId),
      sharedMeterConstructID: sharedMeter?.ID || '',
      isSharedMeter: participant.role === 'Residual Supply Market Location',
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
      energyConceptCurrentStep: participant.energyConceptCurrentStep,
      energyConceptContactCompleted: participant.energyConceptContactCompleted,
      energyConceptDataVerified: participant.energyConceptDataVerified,
      energyConceptAgreementSigned: participant.energyConceptAgreementSigned,
      energyConceptMeterReady: participant.energyConceptMeterReady,
      energyConceptActive: participant.energyConceptActive,
      participationCriticality: participant.participation === 'Ja' ? 3 : 1,
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

  const connections = [...synthetic.connections];
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
      connections.push({ ID: `${key(construct.ID)}-${key(malo)}`, malo, meLo: construct.meLo, directionCode, roleCode, validFrom: construct.supplyStart, validTo: construct.contractEnd, supplier: null, contractReference: null, isSynthetic: false, hasDataWarning: construct.hasDataWarning, warningText: construct.warningText, scenarioCode: null, constructID: construct.ID, targetConstructID: plantByExportMaLo.get(malo) || null });
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
    energyConceptCurrentStep: row.energyConceptCurrentStep || 1, energyConceptTotalSteps: 5,
    energyConceptContactCompleted: Boolean(row.energyConceptContactCompleted), energyConceptDataVerified: Boolean(row.energyConceptDataVerified),
    energyConceptAgreementSigned: Boolean(row.energyConceptAgreementSigned), energyConceptMeterReady: Boolean(row.energyConceptMeterReady), energyConceptActive: Boolean(row.energyConceptActive),
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
    const progress = buildingConsumers.length ? sum(buildingConsumers, 'energyConceptCurrentStep') / buildingConsumers.length : 0;
    return { ID: building.buildingId, city: building.city, postalCode: snapshot.participants.find(row => row.buildingId === building.buildingId)?.cityPostalCode?.match(/\b\d{5}\b/)?.[0] || null, streetAddress: building.address, operatorName: building.operator, latitude: snapshot.producerOnboardings.find(row => row.buildingId === building.buildingId)?.latitude || null, longitude: snapshot.producerOnboardings.find(row => row.buildingId === building.buildingId)?.longitude || null, productionTypes: building.productionTypes, installedCapacityKw: building.installedCapacityKw, consumerCount: buildingConsumers.length, participatingConsumerCount: buildingConsumers.filter(row => row.isEligible).length, activeConsumerCount: buildingConsumers.filter(row => row.energyConceptActive).length, averageEnergyConceptStep: round(progress, 1), totalEnergyConceptSteps: 5, totalConsumptionKwh: building.totalConsumptionKwh, totalGenerationKwh: building.totalGenerationKwh, localEnergyKwh: building.localEnergyKwh, residualGridKwh: building.residualGridEnergyKwh, exportKwh: building.exportEnergyKwh, selfSufficiencyPercent: building.selfSufficiencyPercent, sharedMeterMaLo: sharedMeter?.importMarketLocationId || sharedMeter?.exportMarketLocationId || '', sharedMeterMeLo: sharedMeter?.meteringLocationId || '', sharedMeterIsReal: Boolean(sharedMeter?.meteringLocationId), sharedMeterIsVirtual: Boolean(sharedMeter && !sharedMeter.meteringLocationId), hasSolar: producerRows.some(row => row.productionType === 'Solar'), hasWind: producerRows.some(row => row.productionType === 'Wind'), solarProducerCount: producerRows.filter(row => row.productionType === 'Solar').length, windProducerCount: producerRows.filter(row => row.productionType === 'Wind').length, averageConsumption24hKwh: averageGrouped(recentConsumption, 'consumptionKwh'), averageSolarGeneration24hKwh: averageGrouped(recentSolar, 'generationKwh'), averageWindGeneration24hKwh: averageGrouped(recentWind, 'generationKwh'), averageGridImport24hKwh: averageOf('residualGridEnergyKwh'), averageGridExport24hKwh: averageOf('exportEnergyKwh'), consumptionIntervalCount24h: new Set(recentConsumption.map(row => row.startTime)).size, solarIntervalCount24h: new Set(recentSolar.map(row => row.startTime)).size, windIntervalCount24h: new Set(recentWind.map(row => row.startTime)).size, latestMeasurementTime: latestIntervals.at(-1) || null };
  });
  const constructs = [...constructById.values(), ...synthetic.constructs];
  return { constructs, hourly: [...hourly, ...synthetic.hourly], payments, issues: [...issues, ...synthetic.issues], connections, scenarios: synthetic.scenarios, buildings, consumers, producers, buildingHourlyEnergy, portfolio: [{ ID: 'ALL', buildingCount: result.portfolio[0].buildingCount, constructCount: constructs.length, eligibleMeterCount: result.portfolio[0].eligibleHouseholdCount, warningCount: issues.length + synthetic.issues.length, consumptionKwh: result.portfolio[0].totalConsumptionKwh, generationKwh: result.portfolio[0].totalGenerationKwh, localEnergyKwh: result.portfolio[0].localEnergyKwh, residualGridKwh: result.portfolio[0].residualGridEnergyKwh, exportKwh: result.portfolio[0].exportEnergyKwh, localCoveragePercent: result.portfolio[0].totalConsumptionKwh ? round(result.portfolio[0].localEnergyKwh / result.portfolio[0].totalConsumptionKwh * 100, 1) : 0 }], buildingsById: new Map(buildings.map(row => [row.ID, row])) };
}

module.exports = { project };
