using { mieterstrom.db as db } from '../db/schema';

@path: '/odata/v4/energy-overview'
service EnergyOverviewService {
  @readonly entity ProducerOnboardings as projection on db.ProducerOnboardings;
  @readonly entity Mk7Participants as projection on db.Mk7Participants;
  @readonly entity ConsumptionReadings as projection on db.ConsumptionReadings;
  @readonly entity GenerationReadings as projection on db.GenerationReadings;
  @readonly entity EnergyPrices as projection on db.EnergyPrices;
  @readonly entity FieldDescriptions as projection on db.FieldDescriptions;
  @readonly entity FinancialRules as projection on db.FinancialRules;

  @readonly entity BuildingOverviews {
    key buildingId : String(40);
    city : String(100);
    address : String(255);
    operator : String(100);
    productionTypes : String(100);
    installedCapacityKw : Decimal(15,3);
    eligibleHouseholds : Integer;
    excludedHouseholds : Integer;
    totalConsumptionKwh : Decimal(15,3);
    totalGenerationKwh : Decimal(15,3);
    localEnergyKwh : Decimal(15,3);
    residualGridEnergyKwh : Decimal(15,3);
    exportEnergyKwh : Decimal(15,3);
    selfSufficiencyPercent : Decimal(7,2);
    localGenerationUtilizationPercent : Decimal(7,2);
  }

  @readonly entity ParticipantOverviews {
    key meteringLocationId : String(40);
    buildingId : String(40);
    city : String(100);
    streetAddress : String(255);
    role : String(80);
    participation : String(10);
    eligibleForSettlement : Boolean;
    totalConsumptionKwh : Decimal(15,3);
    localEnergyAllocatedKwh : Decimal(15,3);
    residualGridEnergyKwh : Decimal(15,3);
  }

  @readonly entity HourlyEnergyBalances {
    key ID : String(100);
    buildingId : String(40);
    startTime : Timestamp;
    endTime : Timestamp;
    generationKwh : Decimal(15,3);
    eligibleConsumptionKwh : Decimal(15,3);
    localEnergyKwh : Decimal(15,3);
    residualGridEnergyKwh : Decimal(15,3);
    exportEnergyKwh : Decimal(15,3);
    solarGenerationKwh : Decimal(15,3);
    solarLocalEnergyKwh : Decimal(15,3);
    marketPriceEurKwh : Decimal(15,6);
  }

  @readonly entity BuildingFinancialSummaries {
    key buildingId : String(40);
    participantElectricityChargesEur : Decimal(15,2);
    localElectricityPurchaseEur : Decimal(15,2);
    residualProcurementCostEur : Decimal(15,2);
    exportRemunerationEur : Decimal(15,2);
    mieterstromSubsidyEur : Decimal(15,2);
    meteringFeesEur : Decimal(15,2);
  }

  @readonly entity PortfolioSummary {
    key ID : String(10);
    buildingCount : Integer;
    eligibleHouseholdCount : Integer;
    excludedHouseholdCount : Integer;
    totalConsumptionKwh : Decimal(15,3);
    totalGenerationKwh : Decimal(15,3);
    localEnergyKwh : Decimal(15,3);
    residualGridEnergyKwh : Decimal(15,3);
    exportEnergyKwh : Decimal(15,3);
    participantElectricityChargesEur : Decimal(15,2);
  }

  @readonly entity Constructs {
    key ID : String(100);
    displayName : String(120);
    primaryMaLo : String(40);
    importMaLo : String(40);
    exportMaLo : String(40);
    meLo : String(50);
    city : String(100);
    streetAddress : String(255);
     meterNumber : String(40);
     hasSolar : Boolean;
     hasWind : Boolean;
     averageConsumption24hKwh : Decimal(15,3);
     averageSolarGeneration24hKwh : Decimal(15,3);
     averageWindGeneration24hKwh : Decimal(15,3);
     measurementIntervalCount24h : Integer;
     latestMeasurementTime : Timestamp;
    roleCode : String(30);
    roleLabel : String(80);
    directionCode : String(20);
    participationCode : String(20);
    participationLabel : String(40);
    isEligible : Boolean;
    hasDualMaLo : Boolean;
    hasDataWarning : Boolean;
    warningCode : String(40);
    warningText : String(500);
    totalConsumptionKwh : Decimal(15,3);
    totalGenerationKwh : Decimal(15,3);
    localEnergyKwh : Decimal(15,3);
    residualGridKwh : Decimal(15,3);
    exportKwh : Decimal(15,3);
    paymentBalanceEur : Decimal(15,2);
    meteringSystem : String(40);
    meteringOperator : String(100);
    mk7Operator : String(100);
    supplyStart : Timestamp;
    contractStart : Timestamp;
    contractEnd : Timestamp;
    sourceRow : Integer;
    buildingID : String(40);
    participationCriticality : Integer;
    warningCriticality : Integer;
    directionLabel : String(80);
    isSynthetic : Boolean;
    testScenario : String(60);
    energyConceptCurrentStep : Integer;
    energyConceptContactCompleted : Boolean;
    energyConceptDataVerified : Boolean;
    energyConceptAgreementSigned : Boolean;
    energyConceptMeterReady : Boolean;
    energyConceptActive : Boolean;
    hourlyValues : Association to many ConstructHourlyValues on hourlyValues.constructID = ID;
    payments : Association to many Payments on payments.constructID = ID;
     sourceIssues : Association to many DataQualityIssues on sourceIssues.constructID = ID;
     members : Association to many MaLoConnections on members.constructID = ID;
  }

  @readonly entity MaLoConnections {
    key ID : String(150);
    malo : String(40);
    meLo : String(50);
    directionCode : String(20);
    roleCode : String(30);
    validFrom : Timestamp;
    validTo : Timestamp;
    supplier : String(100);
    contractReference : String(80);
    isSynthetic : Boolean;
    hasDataWarning : Boolean;
    warningText : String(500);
     scenarioCode : String(60);
     constructID : String(100);
     targetConstructID : String(100);
  }

  @readonly entity TestScenarios {
    key ID : String(60);
    title : String(160);
    description : String(500);
    relationshipShape : String(120);
    roleCoverage : String(200);
    readingCoverage : String(200);
    warningCount : Integer;
    isSynthetic : Boolean;
  }

  @readonly entity ConstructHourlyValues {
    key ID : String(150);
    constructID : String(100);
    startTime : Timestamp;
    endTime : Timestamp;
    hourLabel : String(8);
    consumptionKwh : Decimal(15,3);
    generationKwh : Decimal(15,3);
    localAllocationKwh : Decimal(15,3);
    residualGridKwh : Decimal(15,3);
    exportKwh : Decimal(15,3);
    marketPriceEurKwh : Decimal(15,6);
  }

  @readonly entity Payments {
    key ID : String(150);
    constructID : String(100);
    paymentTypeCode : String(40);
    paymentTypeLabel : String(100);
    payer : String(100);
    recipient : String(100);
    quantity : Decimal(15,3);
    unit : String(20);
    rate : Decimal(15,6);
    amount : Decimal(15,2);
    directionCode : String(20);
    amountCriticality : Integer;
  }

  @readonly entity DataQualityIssues {
    key ID : String(150);
    constructID : String(100);
    severityCode : String(20);
    fieldName : String(80);
    sourceValue : String(200);
    issueText : String(500);
    severityCriticality : Integer;
  }

  @readonly entity Buildings {
    key ID : String(40);
    city : String(100);
    postalCode : String(10);
    streetAddress : String(255);
    operatorName : String(100);
    latitude : Decimal(10,6);
    longitude : Decimal(10,6);
    productionTypes : String(100);
    installedCapacityKw : Decimal(15,3);
    consumerCount : Integer;
    participatingConsumerCount : Integer;
    activeConsumerCount : Integer;
    averageEnergyConceptStep : Decimal(5,1);
    totalEnergyConceptSteps : Integer;
    totalConsumptionKwh : Decimal(15,3);
    totalGenerationKwh : Decimal(15,3);
    localEnergyKwh : Decimal(15,3);
    residualGridKwh : Decimal(15,3);
     exportKwh : Decimal(15,3);
     selfSufficiencyPercent : Decimal(7,2);
     sharedMeterMaLo : String(40);
     sharedMeterMeLo : String(50);
     sharedMeterIsReal : Boolean;
     sharedMeterIsVirtual : Boolean;
     hasSolar : Boolean;
     hasWind : Boolean;
     solarProducerCount : Integer;
     windProducerCount : Integer;
     averageConsumption24hKwh : Decimal(15,3);
     averageSolarGeneration24hKwh : Decimal(15,3);
     averageWindGeneration24hKwh : Decimal(15,3);
     consumptionIntervalCount24h : Integer;
     solarIntervalCount24h : Integer;
     windIntervalCount24h : Integer;
     latestMeasurementTime : Timestamp;
     consumers : Association to many BuildingConsumers on consumers.buildingID = ID;
     producers : Association to many BuildingProducers on producers.buildingID = ID;
     solarProducers : Association to many BuildingProducers on solarProducers.buildingID = ID and solarProducers.productionType = 'Solar';
     windProducers : Association to many BuildingProducers on windProducers.buildingID = ID and windProducers.productionType = 'Wind';
    hourlyEnergy : Association to many BuildingHourlyEnergy on hourlyEnergy.buildingID = ID;
  }

  @readonly entity BuildingConsumers {
    key ID : String(100);
    buildingID : String(40);
    meLo : String(50);
    importMaLo : String(40);
    exportMaLo : String(40);
    participationCode : String(20);
    participationLabel : String(40);
    isEligible : Boolean;
    energyConceptCurrentStep : Integer;
    energyConceptTotalSteps : Integer;
    energyConceptContactCompleted : Boolean;
    energyConceptDataVerified : Boolean;
    energyConceptAgreementSigned : Boolean;
    energyConceptMeterReady : Boolean;
    energyConceptActive : Boolean;
    totalConsumptionKwh : Decimal(15,3);
    localEnergyKwh : Decimal(15,3);
    residualGridKwh : Decimal(15,3);
     localEnergySharePercent : Decimal(7,1);
     targetConstructID : String(100);
  }

  @readonly entity BuildingProducers {
    key ID : String(100);
    buildingID : String(40);
    productionType : String(30);
    marketLocationIdentifier : String(40);
    installedCapacityKw : Decimal(15,3);
    generationKwh : Decimal(15,3);
    localEnergyKwh : Decimal(15,3);
    exportKwh : Decimal(15,3);
     localUtilizationPercent : Decimal(7,1);
     targetConstructID : String(100);
  }

  @readonly entity BuildingHourlyEnergy {
    key ID : String(100);
    buildingID : String(40);
    startTime : Timestamp;
    endTime : Timestamp;
    hourLabel : String(8);
    consumptionKwh : Decimal(15,3);
    generationKwh : Decimal(15,3);
    localEnergyKwh : Decimal(15,3);
    residualGridKwh : Decimal(15,3);
    exportKwh : Decimal(15,3);
    marketPriceEurKwh : Decimal(15,6);
  }

  @readonly entity ConstructEnergyTrends {
    key ID : String(180);
    parentID : String(100);
    bucketStart : Timestamp;
    bucketEnd : Timestamp;
    bucketLabel : String(20);
    granularity : String(10);
    consumptionKwh : Decimal(15,3);
    generationKwh : Decimal(15,3);
    localEnergyKwh : Decimal(15,3);
    residualGridKwh : Decimal(15,3);
    exportKwh : Decimal(15,3);
    intervalCount : Integer;
  }

  @readonly entity BuildingEnergyTrends {
    key ID : String(180);
    parentID : String(40);
    bucketStart : Timestamp;
    bucketEnd : Timestamp;
    bucketLabel : String(20);
    granularity : String(10);
    consumptionKwh : Decimal(15,3);
    generationKwh : Decimal(15,3);
    localEnergyKwh : Decimal(15,3);
    residualGridKwh : Decimal(15,3);
    exportKwh : Decimal(15,3);
    intervalCount : Integer;
  }
}
