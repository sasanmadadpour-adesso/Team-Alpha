using EnergyOverviewService as service from './energy-overview-service';

annotate service.Constructs with @(
  cds.search: { primaryMaLo, importMaLo, exportMaLo, meLo, displayName, city, streetAddress, buildingID },
  UI.HeaderInfo: { TypeName: '{i18n>CONSTRUCT}', TypeNamePlural: '{i18n>CONSTRUCTS}', Title: { Value: primaryMaLo }, Description: { Value: displayName }, TypeImageUrl: 'sap-icon://connected' },
  UI.SelectionFields: [primaryMaLo, meLo, participationCode, city, buildingID, hasDataWarning],
  UI.LineItem: [
    { Value: primaryMaLo, Label: '{i18n>MALO}' },
    { Value: meLo, Label: '{i18n>MELO}' },
    { Value: roleLabel, Label: '{i18n>ROLE}' },
    { Value: city, Label: '{i18n>CITY}' },
    { Value: buildingID, Label: '{i18n>BUILDING}' },
    { Value: participationLabel, Label: '{i18n>MK7_PARTICIPATION}', Criticality: participationCriticality },
    { Value: totalConsumptionKwh, Label: '{i18n>CONSUMPTION_KWH}' },
    { Value: totalGenerationKwh, Label: '{i18n>GENERATION_KWH}' },
    { Value: warningText, Label: '{i18n>DATA_QUALITY}', Criticality: warningCriticality, CriticalityRepresentation: #WithIcon }
  ],
  UI.FieldGroup #Identity: { Data: [
    { Value: primaryMaLo, Label: '{i18n>PRIMARY_MALO}' }, { Value: meLo, Label: '{i18n>MELO}' },
    { Value: roleLabel, Label: '{i18n>ROLE}' }, { Value: directionLabel, Label: '{i18n>DIRECTION}' },
    { Value: participationLabel, Label: '{i18n>MK7_PARTICIPATION}', Criticality: participationCriticality }, { Value: buildingID, Label: '{i18n>BUILDING}' }
  ] },
  UI.FieldGroup #Topology: { Data: [
    { Value: importMaLo, Label: '{i18n>IMPORT_MALO}' }, { Value: meLo, Label: '{i18n>SHARED_MELO}' },
    { Value: exportMaLo, Label: '{i18n>EXPORT_MALO}' }, { Value: hasDualMaLo, Label: '{i18n>DUAL_MALO}' },
    { Value: meteringSystem, Label: '{i18n>METERING_SYSTEM}' }, { Value: meteringOperator, Label: '{i18n>METERING_OPERATOR}' }
  ] },
  UI.FieldGroup #Contract: { Data: [
    { Value: mk7Operator, Label: '{i18n>MK7_OPERATOR}' }, { Value: supplyStart, Label: '{i18n>SUPPLY_START}' },
    { Value: contractStart, Label: '{i18n>CONTRACT_START}' }, { Value: contractEnd, Label: '{i18n>CONTRACT_END}' }, { Value: sourceRow, Label: '{i18n>SOURCE_ROW}' }
  ] },
  UI.DataPoint #Consumption: { Title: '{i18n>CONSUMPTION_KWH}', Value: totalConsumptionKwh },
  UI.DataPoint #Generation: { Title: '{i18n>GENERATION_KWH}', Value: totalGenerationKwh },
  UI.DataPoint #LocalEnergy: { Title: '{i18n>LOCAL_ENERGY_KWH}', Value: localEnergyKwh },
  UI.DataPoint #Residual: { Title: '{i18n>RESIDUAL_GRID_KWH}', Value: residualGridKwh },
  UI.DataPoint #Export: { Title: '{i18n>EXPORT_KWH}', Value: exportKwh },
  UI.DataPoint #Balance: { Title: '{i18n>PAYMENT_BALANCE}', Value: paymentBalanceEur },
  UI.HeaderFacets: [
    { $Type: 'UI.ReferenceFacet', ID: 'ConsumptionKpi', Target: '@UI.DataPoint#Consumption' },
    { $Type: 'UI.ReferenceFacet', ID: 'GenerationKpi', Target: '@UI.DataPoint#Generation' },
    { $Type: 'UI.ReferenceFacet', ID: 'LocalEnergyKpi', Target: '@UI.DataPoint#LocalEnergy' },
    { $Type: 'UI.ReferenceFacet', ID: 'ResidualKpi', Target: '@UI.DataPoint#Residual' },
    { $Type: 'UI.ReferenceFacet', ID: 'ExportKpi', Target: '@UI.DataPoint#Export' },
    { $Type: 'UI.ReferenceFacet', ID: 'BalanceKpi', Target: '@UI.DataPoint#Balance' }
  ],
  UI.Facets: [
    { $Type: 'UI.CollectionFacet', ID: 'Overview', Label: '{i18n>OVERVIEW}', Facets: [
      { $Type: 'UI.ReferenceFacet', ID: 'Identity', Label: '{i18n>GENERAL}', Target: '@UI.FieldGroup#Identity' },
      { $Type: 'UI.ReferenceFacet', ID: 'Topology', Label: '{i18n>TOPOLOGY}', Target: '@UI.FieldGroup#Topology' }
    ] },
    { $Type: 'UI.ReferenceFacet', ID: 'Payments', Label: '{i18n>PAYMENTS}', Target: 'payments/@UI.LineItem' },
    { $Type: 'UI.ReferenceFacet', ID: 'Warnings', Label: '{i18n>DATA_QUALITY}', Target: 'sourceIssues/@UI.LineItem' },
    { $Type: 'UI.ReferenceFacet', ID: 'Contract', Label: '{i18n>CONTRACT_SOURCE}', Target: '@UI.FieldGroup#Contract' }
  ]
);

annotate service.ConstructHourlyValues with @UI.LineItem: [
  { Value: hourLabel, Label: '{i18n>HOUR}' }, { Value: consumptionKwh, Label: '{i18n>CONSUMPTION_KWH}' },
  { Value: generationKwh, Label: '{i18n>GENERATION_KWH}' }, { Value: localAllocationKwh, Label: '{i18n>LOCAL_ENERGY_KWH}' },
  { Value: residualGridKwh, Label: '{i18n>RESIDUAL_GRID_KWH}' }, { Value: exportKwh, Label: '{i18n>EXPORT_KWH}' }
];

annotate service.Payments with @UI.LineItem: [
  { Value: paymentTypeLabel, Label: '{i18n>PAYMENT_TYPE}' }, { Value: payer, Label: '{i18n>PAYER}' },
  { Value: recipient, Label: '{i18n>RECIPIENT}' }, { Value: quantity, Label: '{i18n>QUANTITY}' },
  { Value: unit, Label: '{i18n>UNIT}' }, { Value: rate, Label: '{i18n>RATE}' }, { Value: amount, Label: '{i18n>AMOUNT}', Criticality: amountCriticality }
];

annotate service.DataQualityIssues with @UI.LineItem: [
  { Value: severityCode, Label: '{i18n>SEVERITY}', Criticality: severityCriticality },
  { Value: fieldName, Label: '{i18n>FIELD}' }, { Value: sourceValue, Label: '{i18n>SOURCE_VALUE}' }, { Value: issueText, Label: '{i18n>NOTICE}' }
];

annotate service.PortfolioSummary with @(
  UI.HeaderInfo: { TypeName: '{i18n>PORTFOLIO}', TypeNamePlural: '{i18n>PORTFOLIO}' },
  UI.LineItem: [
    { Value: buildingCount, Label: '{i18n>BUILDINGS}' }, { Value: constructCount, Label: '{i18n>CONSTRUCTS}' },
    { Value: eligibleMeterCount, Label: '{i18n>ELIGIBLE_METERS}' }, { Value: consumptionKwh, Label: '{i18n>CONSUMPTION_KWH}' },
    { Value: generationKwh, Label: '{i18n>GENERATION_KWH}' }, { Value: localCoveragePercent, Label: '{i18n>LOCAL_COVERAGE}' }
  ]
);

annotate service.Buildings with @(
  UI.HeaderInfo: { TypeName: '{i18n>BUILDING}', TypeNamePlural: '{i18n>BUILDINGS}', Title: { Value: ID }, Description: { Value: streetAddress } },
  UI.SelectionFields: [ID, city, operatorName, productionTypes],
  UI.PresentationVariant: { SortOrder: [{ Property: city, Descending: false }], Visualizations: ['@UI.LineItem'] },
  UI.LineItem: [
    { Value: ID, Label: '{i18n>BUILDING}' }, { Value: city, Label: '{i18n>CITY}' },
    { Value: streetAddress, Label: '{i18n>ADDRESS}' }, { Value: productionTypes, Label: '{i18n>PRODUCTION}' },
    { Value: participatingConsumerCount, Label: '{i18n>PARTICIPATING_CONSUMERS}' },
    { Value: averageEnergyConceptStep, Label: '{i18n>PROGRESS}' },
    { Value: totalConsumptionKwh, Label: '{i18n>CONSUMPTION_KWH}' },
    { Value: totalGenerationKwh, Label: '{i18n>GENERATION_KWH}' },
    { Value: selfSufficiencyPercent, Label: '{i18n>SELF_SUFFICIENCY}' }
  ],
  UI.FieldGroup #BuildingSummary: { Data: [
    { Value: ID, Label: '{i18n>BUILDING}' }, { Value: city, Label: '{i18n>CITY}' },
    { Value: streetAddress, Label: '{i18n>ADDRESS}' }, { Value: operatorName, Label: '{i18n>OPERATOR}' },
    { Value: productionTypes, Label: '{i18n>PRODUCTION}' }, { Value: installedCapacityKw, Label: '{i18n>CAPACITY_KW}' }
  ] },
  UI.FieldGroup #EnergySummary: { Data: [
    { Value: consumerCount, Label: '{i18n>CONSUMERS}' }, { Value: participatingConsumerCount, Label: '{i18n>PARTICIPATING_CONSUMERS}' },
    { Value: averageEnergyConceptStep, Label: '{i18n>PROGRESS}' }, { Value: totalConsumptionKwh, Label: '{i18n>CONSUMPTION_KWH}' },
    { Value: totalGenerationKwh, Label: '{i18n>GENERATION_KWH}' }, { Value: localEnergyKwh, Label: '{i18n>LOCAL_ENERGY_KWH}' },
    { Value: residualGridKwh, Label: '{i18n>RESIDUAL_GRID_KWH}' }, { Value: exportKwh, Label: '{i18n>EXPORT_KWH}' },
    { Value: selfSufficiencyPercent, Label: '{i18n>SELF_SUFFICIENCY}' }
  ] },
  UI.Facets: [
    { $Type: 'UI.ReferenceFacet', ID: 'BuildingSummary', Label: '{i18n>GENERAL}', Target: '@UI.FieldGroup#BuildingSummary' },
    { $Type: 'UI.ReferenceFacet', ID: 'EnergySummary', Label: '{i18n>ENERGY_SUMMARY}', Target: '@UI.FieldGroup#EnergySummary' },
    { $Type: 'UI.ReferenceFacet', ID: 'Consumers', Label: '{i18n>CONSUMERS}', Target: 'consumers/@UI.LineItem' },
     { $Type: 'UI.ReferenceFacet', ID: 'Producers', Label: '{i18n>PRODUCERS}', Target: 'producers/@UI.LineItem' }
  ]
);

annotate service.BuildingConsumers with @UI.LineItem: [
  { Value: meLo, Label: '{i18n>MELO}' }, { Value: importMaLo, Label: '{i18n>IMPORT_MALO}' },
  { Value: participationLabel, Label: '{i18n>MK7_PARTICIPATION}' }, { Value: energyConceptCurrentStep, Label: '{i18n>PROGRESS}' },
  { Value: totalConsumptionKwh, Label: '{i18n>CONSUMPTION_KWH}' }, { Value: localEnergyKwh, Label: '{i18n>LOCAL_ENERGY_KWH}' },
  { Value: residualGridKwh, Label: '{i18n>RESIDUAL_GRID_KWH}' }
];

annotate service.BuildingProducers with @UI.LineItem: [
  { Value: productionType, Label: '{i18n>PRODUCTION}' }, { Value: marketLocationIdentifier, Label: '{i18n>MALO}' },
  { Value: installedCapacityKw, Label: '{i18n>CAPACITY_KW}' }, { Value: generationKwh, Label: '{i18n>GENERATION_KWH}' },
  { Value: localEnergyKwh, Label: '{i18n>LOCAL_ENERGY_KWH}' }, { Value: exportKwh, Label: '{i18n>EXPORT_KWH}' }
];

annotate service.BuildingHourlyEnergy with @UI.LineItem: [
  { Value: hourLabel, Label: '{i18n>HOUR}' }, { Value: consumptionKwh, Label: '{i18n>CONSUMPTION_KWH}' },
  { Value: generationKwh, Label: '{i18n>GENERATION_KWH}' }, { Value: localEnergyKwh, Label: '{i18n>LOCAL_ENERGY_KWH}' },
  { Value: residualGridKwh, Label: '{i18n>RESIDUAL_GRID_KWH}' }, { Value: exportKwh, Label: '{i18n>EXPORT_KWH}' }
];

annotate service.ConstructHourlyValues with @UI.Chart #Trend: {
  ChartType: #Line,
  Title: '{i18n>ENERGY_TREND}',
  Dimensions: [startTime],
  DimensionAttributes: [{ Dimension: startTime, Role: #Category }],
  Measures: [consumptionKwh, generationKwh, localAllocationKwh, residualGridKwh, exportKwh],
  MeasureAttributes: [
    { Measure: consumptionKwh, Role: #Axis1 }, { Measure: generationKwh, Role: #Axis1 },
    { Measure: localAllocationKwh, Role: #Axis1 }, { Measure: residualGridKwh, Role: #Axis1 }, { Measure: exportKwh, Role: #Axis1 }
  ]
};

annotate service.BuildingHourlyEnergy with @UI.Chart #Trend: {
  ChartType: #Line,
  Title: '{i18n>ENERGY_TREND}',
  Dimensions: [startTime],
  DimensionAttributes: [{ Dimension: startTime, Role: #Category }],
  Measures: [consumptionKwh, generationKwh, localEnergyKwh, residualGridKwh, exportKwh],
  MeasureAttributes: [
    { Measure: consumptionKwh, Role: #Axis1 }, { Measure: generationKwh, Role: #Axis1 },
    { Measure: localEnergyKwh, Role: #Axis1 }, { Measure: residualGridKwh, Role: #Axis1 }, { Measure: exportKwh, Role: #Axis1 }
  ]
};
