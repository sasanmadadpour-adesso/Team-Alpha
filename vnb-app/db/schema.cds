namespace vnb.network;

using { cuid, managed } from '@sap/cds/common';

@cds.autoexpose
entity Buildings : managed {
  key ID              : String(20);
      city            : String(80);
      postalCode      : String(10);
      streetAddress   : String(120);
      operatorName    : String(100);
      latitude        : Decimal(9,6);
      longitude       : Decimal(9,6);
      constructs      : Association to many Constructs on constructs.building = $self;
      hourlyProfile   : Association to many BuildingHourlyProfiles on hourlyProfile.building = $self;
}

@cds.autoexpose
entity Constructs : cuid, managed {
      displayName          : String(120);
      primaryMaLo          : String(40);
      importMaLo           : String(20);
      exportMaLo           : String(20);
      meLo                 : String(50);
      city                 : String(80);
      streetAddress        : String(120);
      meterNumber          : String(40);
      roleCode             : String(30);
      roleLabel            : String(80);
      directionCode        : String(20);
      participationCode    : String(20);
      participationLabel   : String(40);
      isEligible           : Boolean default false;
      hasDualMaLo          : Boolean default false;
      hasDataWarning       : Boolean default false;
      warningCode          : String(40);
      warningText          : String(500);
      totalConsumptionKwh  : Decimal(15,3);
      totalGenerationKwh   : Decimal(15,3);
      localEnergyKwh       : Decimal(15,3);
      residualGridKwh      : Decimal(15,3);
      exportKwh            : Decimal(15,3);
      paymentBalanceEur    : Decimal(15,2);
      meteringSystem       : String(40);
      meteringOperator     : String(100);
      mk7Operator          : String(100);
      supplyStart          : Timestamp;
      contractStart        : Timestamp;
      contractEnd          : Timestamp;
      sourceRow            : Integer;
      building             : Association to Buildings;
      hourlyValues         : Association to many ConstructHourlyValues on hourlyValues.construct = $self;
      payments             : Association to many Payments on payments.construct = $self;
      sourceIssues         : Association to many DataQualityIssues on sourceIssues.construct = $self;
}

entity BuildingHourlyProfiles : cuid {
      building              : Association to Buildings;
      startTime             : Timestamp;
      hourLabel             : String(8);
      consumptionKwh        : Decimal(15,3);
      generationKwh         : Decimal(15,3);
      localEnergyKwh        : Decimal(15,3);
      residualGridKwh       : Decimal(15,3);
      exportKwh             : Decimal(15,3);
      marketPriceEurKwh     : Decimal(15,3);
}

entity ConstructHourlyValues : cuid {
      construct             : Association to Constructs;
      startTime             : Timestamp;
      hourLabel             : String(8);
      consumptionKwh        : Decimal(15,3);
      generationKwh         : Decimal(15,3);
      localAllocationKwh    : Decimal(15,3);
      residualGridKwh       : Decimal(15,3);
      exportKwh             : Decimal(15,3);
      marketPriceEurKwh     : Decimal(15,3);
}

entity Payments : cuid {
      construct             : Association to Constructs;
      paymentTypeCode       : String(40);
      paymentTypeLabel      : String(100);
      payer                 : String(100);
      recipient             : String(100);
      quantity              : Decimal(15,3);
      unit                  : String(20);
      rate                  : Decimal(15,6);
      amount                : Decimal(15,2);
      directionCode         : String(20);
}

entity DataQualityIssues : cuid {
      construct             : Association to Constructs;
      severityCode          : String(20);
      fieldName             : String(80);
      sourceValue           : String(200);
      issueText             : String(500);
}

entity PortfolioSummary {
  key ID                    : String(10);
      buildingCount         : Integer;
      constructCount        : Integer;
      eligibleMeterCount    : Integer;
      warningCount          : Integer;
      consumptionKwh        : Decimal(15,3);
      generationKwh         : Decimal(15,3);
      localEnergyKwh        : Decimal(15,3);
      residualGridKwh       : Decimal(15,3);
      exportKwh             : Decimal(15,3);
      localCoveragePercent  : Decimal(9,1);
}
