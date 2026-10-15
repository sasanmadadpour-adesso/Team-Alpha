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
}
