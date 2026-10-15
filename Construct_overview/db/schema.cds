namespace mieterstrom.db;

using { cuid } from '@sap/cds/common';

type UtcTimestamp : Timestamp;

@readonly
entity ProducerOnboardings {
  key ID : String(40);
  firstName : String(100);
  lastName : String(100);
  email : String(255);
  salutation : String(20);
  isBusiness : Boolean;
  isReverseCharge : Boolean;
  deliveryStreet : String(255);
  deliveryHouseNumber : String(30);
  deliveryZipCode : String(20);
  deliveryCity : String(100);
  subscriptionReason : String(10);
  productionType : String(30);
  plantCapacityKw : Decimal(15,3);
  latitude : Decimal(10,6);
  longitude : Decimal(10,6);
  marketLocationIdentifier : String(40);
  tranche : String(100);
  preferredDeliveryStart : UtcTimestamp;
  saasCustomerId : String(100);
  saasContractId : String(100);
  productName : String(100);
  consumerSaasContractId : String(100);
  controlResource : String(255);
  technicalResources : String(255);
  contractStartUtc : UtcTimestamp;
  contractEndUtc : UtcTimestamp;
  buildingId : String(40);
}

@readonly
  entity Mk7Participants {
  key ID : String(40);
  city : String(100);
  operator : String(100);
  streetAddress : String(255);
  role : String(80);
  participation : String(10);
  supplyStartUtc : UtcTimestamp;
  meteringLocationId : String(40);
  meterNumber : String(40);
  importMarketLocationId : String(40);
  exportMarketLocationId : String(40);
  cityPostalCode : String(150);
  meteringOperator : String(100);
  gridOperatorName : String(100);
  meteringSystem : String(40);
  contractStartUtc : UtcTimestamp;
  contractEndUtc : UtcTimestamp;
  buildingId : String(40);
  energyConceptCurrentStep : Integer;
  energyConceptContactCompleted : Boolean;
  energyConceptDataVerified : Boolean;
  energyConceptAgreementSigned : Boolean;
  energyConceptMeterReady : Boolean;
  energyConceptActive : Boolean;
}

@readonly
entity ConsumptionReadings {
  key ID : String(100);
  startTime : UtcTimestamp;
  endTime : UtcTimestamp;
  buildingId : String(40);
  meteringLocationId : String(40);
  marketLocationId : String(40);
  participation : String(10);
  consumptionKwh : Decimal(15,3);
  energyUnit : String(10);
  aggregationType : String(20);
}

@readonly
entity GenerationReadings {
  key ID : String(100);
  startTime : UtcTimestamp;
  endTime : UtcTimestamp;
  buildingId : String(40);
  marketLocationId : String(40);
  productionType : String(30);
  plantCapacityKw : Decimal(15,3);
  generationKwh : Decimal(15,3);
  energyUnit : String(10);
  aggregationType : String(20);
}

@readonly
entity EnergyPrices {
  key ID : String(100);
  startTime : UtcTimestamp;
  endTime : UtcTimestamp;
  aggregationType : String(20);
  marketPriceEurKwh : Decimal(15,6);
  retailPriceEurKwh : Decimal(15,6);
  plantPurchasePriceEurKwh : Decimal(15,6);
  exportRemunerationEurKwh : Decimal(15,6);
  mieterstromSubsidyEurKwh : Decimal(15,6);
  meteringFeeEurPerMeter24h : Decimal(15,6);
  reststromSupplier : String(100);
  networkOperator : String(100);
  meteringOperator : String(100);
}

@readonly
entity FieldDescriptions {
  key ID : String(100);
  field : String(100);
  requirement : String(40);
  description : String(500);
}

@readonly
entity FinancialRules {
  key ID : String(100);
  section : String(40);
  item : String(100);
  payer : String(100);
  recipient : String(100);
  rateSource : String(100);
  calculationOrRule : String(1000);
}
