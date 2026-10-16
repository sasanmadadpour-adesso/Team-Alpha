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
    { Value: participationMark, Label: '{i18n>MK7_PARTICIPATION}', Criticality: participationCriticality, CriticalityRepresentation: #WithIcon },
    { Value: totalConsumptionKwh, Label: '{i18n>CONSUMPTION_KWH}' },
    { Value: totalGenerationKwh, Label: '{i18n>GENERATION_KWH}' },
    { Value: warningText, Label: '{i18n>DATA_QUALITY}', Criticality: warningCriticality, CriticalityRepresentation: #WithIcon }
  ],
  UI.FieldGroup #Identity: { Data: [
    { Value: roleLabel, Label: '{i18n>ROLE}' }, { Value: directionLabel, Label: '{i18n>DIRECTION}' },
    { Value: participationMark, Label: '{i18n>MK7_PARTICIPATION}', Criticality: participationCriticality, CriticalityRepresentation: #WithIcon },
    { Value: address, Label: '{i18n>ADDRESS}' },
    { Value: ownerFirstName, Label: '{i18n>OWNER_FIRST_NAME}' }, { Value: ownerLastName, Label: '{i18n>OWNER_LAST_NAME}' },
    { $Type: 'UI.DataFieldWithUrl', Value: buildingID, Url: buildingLink, Label: '{i18n>BUILDING}', ![@UI.Hidden]: hasNoBuildingLink },
    { Value: buildingID, Label: '{i18n>BUILDING}', ![@UI.Hidden]: hasBuildingLink }
  ] },
  UI.FieldGroup #Topology: { Data: [
    { Value: meLo, Label: '{i18n>MELO}' }, { Value: importMaLo, Label: '{i18n>IMPORT_MALO}' },
    { Value: exportMaLo, Label: '{i18n>EXPORT_MALO}' },
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
  UI.DataPoint #Switchover: { Title: '{i18n>SWITCHOVER}', Description: switchoverStepLabel, Value: switchoverStep, TargetValue: switchoverTotalSteps, Visualization: #Progress },
  // On the shared energy counter the residual and export values are the whole house's grid import and export;
  // all other energy KPIs are not meaningful there and are hidden.
  UI.HeaderFacets: [
    { $Type: 'UI.ReferenceFacet', ID: 'ConsumptionKpi', Target: '@UI.DataPoint#Consumption', ![@UI.Hidden]: counterKpiHidden },
    { $Type: 'UI.ReferenceFacet', ID: 'GenerationKpi', Target: '@UI.DataPoint#Generation', ![@UI.Hidden]: counterKpiHidden },
    { $Type: 'UI.ReferenceFacet', ID: 'LocalEnergyKpi', Target: '@UI.DataPoint#LocalEnergy', ![@UI.Hidden]: counterKpiHidden },
    { $Type: 'UI.ReferenceFacet', ID: 'ResidualKpi', Target: '@UI.DataPoint#Residual' },
    { $Type: 'UI.ReferenceFacet', ID: 'ExportKpi', Target: '@UI.DataPoint#Export' },
    { $Type: 'UI.ReferenceFacet', ID: 'BalanceKpi', Target: '@UI.DataPoint#Balance', ![@UI.Hidden]: counterKpiHidden },
    { $Type: 'UI.ReferenceFacet', ID: 'SwitchoverKpi', Target: '@UI.DataPoint#Switchover', ![@UI.Hidden]: switchoverHidden }
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

annotate service.DataQualityIssues with @(
  UI.HeaderInfo: { TypeName: '{i18n>DATA_QUALITY_ISSUE}', TypeNamePlural: '{i18n>DATA_QUALITY}' },
  UI.LineItem: [
    { Value: severityLabel, Label: '{i18n>SEVERITY}', Criticality: severityCriticality, CriticalityRepresentation: #WithIcon },
    { Value: title, Label: '{i18n>PROBLEM}' },
    { Value: fieldLabel, Label: '{i18n>FIELD}' },
    { Value: sourceValue, Label: '{i18n>SOURCE_VALUE}' },
    { Value: issueText, Label: '{i18n>DESCRIPTION}' },
    { Value: recommendation, Label: '{i18n>RECOMMENDATION}' }
  ]
);

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
  UI.DataPoint #Consumption: { Title: '{i18n>CONSUMPTION_KWH}', Value: totalConsumptionKwh },
  UI.DataPoint #Residual: { Title: '{i18n>RESIDUAL_GRID_KWH}', Value: residualGridKwh },
  UI.DataPoint #Export: { Title: '{i18n>EXPORT_KWH}', Value: exportKwh },
  UI.DataPoint #Solar: { Title: '{i18n>SOLAR_GENERATION_KWH}', Value: solarGenerationKwh },
  UI.DataPoint #Wind: { Title: '{i18n>WIND_GENERATION_KWH}', Value: windGenerationKwh },
  UI.HeaderFacets: [
    { $Type: 'UI.ReferenceFacet', ID: 'ConsumptionKpi', Target: '@UI.DataPoint#Consumption' },
    { $Type: 'UI.ReferenceFacet', ID: 'ResidualKpi', Target: '@UI.DataPoint#Residual' },
    { $Type: 'UI.ReferenceFacet', ID: 'ExportKpi', Target: '@UI.DataPoint#Export' },
    { $Type: 'UI.ReferenceFacet', ID: 'SolarKpi', Target: '@UI.DataPoint#Solar', ![@UI.Hidden]: solarHidden },
    { $Type: 'UI.ReferenceFacet', ID: 'WindKpi', Target: '@UI.DataPoint#Wind', ![@UI.Hidden]: windHidden }
  ],
  UI.LineItem: [
    { Value: ID, Label: '{i18n>BUILDING}' }, { Value: city, Label: '{i18n>CITY}' },
    { Value: streetAddress, Label: '{i18n>ADDRESS}' }, { Value: productionTypes, Label: '{i18n>PRODUCTION}' },
    { Value: participatingConsumerCount, Label: '{i18n>PARTICIPATING_CONSUMERS}' },
    { Value: totalConsumptionKwh, Label: '{i18n>CONSUMPTION_KWH}' },
    { Value: totalGenerationKwh, Label: '{i18n>GENERATION_KWH}' },
    { Value: selfSufficiencyPercent, Label: '{i18n>SELF_SUFFICIENCY}' }
  ],
  UI.FieldGroup #BuildingSummary: { Data: [
    { Value: ID, Label: '{i18n>BUILDING}' }, { Value: city, Label: '{i18n>CITY}' },
    { Value: streetAddress, Label: '{i18n>ADDRESS}' }, { Value: operatorName, Label: '{i18n>OPERATOR}' },
    { Value: ownerFirstName, Label: '{i18n>OWNER_FIRST_NAME}' }, { Value: ownerLastName, Label: '{i18n>OWNER_LAST_NAME}' },
    { Value: productionTypes, Label: '{i18n>PRODUCTION}' }, { Value: installedCapacityKw, Label: '{i18n>CAPACITY_KW}' }
  ] },
  UI.FieldGroup #EnergySummary: { Data: [
    { Value: consumerCount, Label: '{i18n>CONSUMERS}' }, { Value: participatingConsumerCount, Label: '{i18n>PARTICIPATING_CONSUMERS}' },
    { Value: totalConsumptionKwh, Label: '{i18n>CONSUMPTION_KWH}' },
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

annotate service.BuildingConsumers with @(
  UI.DataPoint #Switchover: { Title: '{i18n>SWITCHOVER}', Description: switchoverStepLabel, Value: switchoverStep, TargetValue: switchoverTotalSteps, Visualization: #Progress },
  UI.LineItem: [
    { Value: meLo, Label: '{i18n>MELO}' }, { Value: importMaLo, Label: '{i18n>IMPORT_MALO}' },
    { Value: participationMark, Label: '{i18n>MK7_PARTICIPATION}', Criticality: participationCriticality, CriticalityRepresentation: #WithIcon },
    { $Type: 'UI.DataFieldForAnnotation', Target: '@UI.DataPoint#Switchover', Label: '{i18n>SWITCHOVER}', ![@UI.Hidden]: switchoverHidden },
    { Value: totalConsumptionKwh, Label: '{i18n>CONSUMPTION_KWH}' }, { Value: localEnergyKwh, Label: '{i18n>LOCAL_ENERGY_KWH}' },
    { Value: residualGridKwh, Label: '{i18n>RESIDUAL_GRID_KWH}' }
  ]
);

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


// Field labels for the filter bar.
annotate service.Constructs with {
  primaryMaLo @title: '{i18n>MALO}';
  meLo @title: '{i18n>MELO}';
  participationCode @title: '{i18n>MK7_PARTICIPATION}';
  city @title: '{i18n>CITY}';
  buildingID @title: '{i18n>BUILDING}';
  hasDataWarning @title: '{i18n>DATA_QUALITY}';
};

annotate service.Buildings with {
  ID @title: '{i18n>BUILDING}';
  city @title: '{i18n>CITY}';
  operatorName @title: '{i18n>OPERATOR}';
  productionTypes @title: '{i18n>PRODUCTION}';
};
