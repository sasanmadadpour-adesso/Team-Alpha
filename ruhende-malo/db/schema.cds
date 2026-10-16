namespace mk7.controlcenter;

using { cuid, managed } from '@sap/cds/common';

/** Persistent technical records used to verify the Phase A vertical connection. */
entity SystemStatuses : cuid, managed {
  key code       : String(40) @assert.unique;
      label      : String(120);
      environment: String(30);
      sapConnected: Boolean default false;
}

entity Buildings : managed { key buildingId : String(40); city : String(120); operator : String(160); streetAddress : String(200); reststromMaloId : String(40); sourceRowCount : Integer; }
entity MarketLocations : managed { key maloId : String(40); primaryRole : String(80); participates : Boolean; businessState : String(20) default 'UNKNOWN'; assignmentCount : Integer; conflictingAssignment : Boolean default false; assignmentSummary : String(500); }
entity MeteringLocations : managed { key meloId : String(80); assignmentCount : Integer; conflictingAssignment : Boolean default false; }
entity ParticipantSourceRows : managed {
  key sourceId : String(100); sourceFile : String(200); sourceSheet : String(80); sourceRowNumber : Integer;
  buildingId : String(40); role : String(80); participationRaw : String(30); participates : Boolean;
  meloId : String(80); maloId : String(40); generationFeedInMaloId : String(40);
  supplyStartUtc : Date; contractFromUtc : Date; contractToUtc : Date;
  city : String(120); operator : String(160); streetAddress : String(200); reststromMaloId : String(40);
  maloConflict : Boolean default false; unverifiedSourceAttributes : LargeString;
  sourceData : LargeString;
  // Construct process fields, read from the (simulated) SAP / market-communication state; UNKNOWN when no source exists.
  // imsysStatus: INSTALLED | MISSING | UNKNOWN | CONFIRMED_MANUAL · deregistrationStatus: CONFIRMED | PENDING | UNKNOWN | CONFIRMED_MANUAL
  // mcmStatus: COMPLETED | OPEN | UNKNOWN | CONFIRMED_MANUAL
  constructId : String(40); excluded : Boolean default false; exclusionReason : String(500);
  imsysStatus : String(20) default 'UNKNOWN'; deregistrationStatus : String(20) default 'UNKNOWN'; mcmStatus : String(20) default 'UNKNOWN';
}

/** MK7 construct (one building): root object of Anmeldung → Prüfung → Korrektur → vSZ → Umstellung. */
entity Constructs : managed {
  key constructId : String(40); buildingId : String(40); city : String(120); operator : String(160); streetAddress : String(200);
  reststromMaloId : String(40); stichtag : Date; registrationSource : String(200); registeredAt : Timestamp;
  validatedAt : Timestamp; switchedAt : Timestamp; stage : String(40);
  householdCount : Integer; eligibleCount : Integer; dormantCount : Integer; excludedCount : Integer;
  openIssueCount : Integer; blockingIssueCount : Integer; vszConfirmed : Integer; vszTotal : Integer;
}
/** Findings of Prüfung der Daten; resolved manually in Korrektur Daten. */
entity ValidationIssues : cuid, managed {
  fingerprint : String(300) @assert.unique; ruleId : String(10); checkGroup : String(40); severity : String(10);
  constructId : String(40); constructIds : String(200); objectType : String(30); objectId : String(80); sourceId : String(100); field : String(60); affects : LargeString;
  message : String(1000); allowedResolutions : String(200); status : String(20);
  resolution : String(40); resolutionValue : String(200); reason : String(1000); resolvedBy : String(80); resolvedAt : Timestamp;
}
/** Upstream "Aufbau vSZ" readiness (PDF steps 1–4.7). Never confirmed automatically. */
entity VszChecklistItems : cuid, managed {
  constructId : String(40); itemCode : String(40); step : String(10); label : String(200); pdfPage : String(10); note : String(500);
  status : String(20) default 'UNKNOWN'; confirmedBy : String(80); confirmedAt : Timestamp; evidence : String(500);
}
/** Handover to downstream processes of the solution map. Not implemented: events are recorded, never sent. */
entity OutboxEvents : cuid, managed {
  dedupeKey : String(200) @assert.unique; constructId : String(40); eventType : String(60); targetProcess : String(120);
  objectId : String(80); payload : LargeString; status : String(30);
}
entity ProcessRuns : cuid {
  mode : String(20); scope : String(80); actor : String(80); startedAt : Timestamp; finishedAt : Timestamp; summary : LargeString;
}
entity Relationships : cuid, managed { kind : String(10); source : String(30); context : String(30); requestId : UUID; buildingId : String(40); fromLocationId : String(80); toLocationId : String(80); validFrom : Date; validToExclusive : Date; provenance : String(500); }
entity LifecyclePeriods : cuid, managed { maloId : String(40); businessState : String(20); validFrom : Date; validToExclusive : Date; provenance : String(100); }
entity ProcessRequests : cuid, managed { operation : String(40); maloId : String(40); buildingId : String(40); effectiveDate : Date; mode : String(20); status : String(30); resultCode : String(80); resultMessage : String(1000); beforeState : String(20); afterState : String(20); executionTime : Timestamp; batchId : UUID; idempotencyKey : String(160) @assert.unique; referenceOperationId : UUID; actor : String(80); reason : String(1000); reststromMaloId : String(40); simulated : Boolean default true; trace : LargeString; }
entity PrerequisiteChecks : cuid, managed { requestId : UUID; checkCode : String(80); result : String(30); confidence : String(30); notes : String(1000); }
entity AuditEvents : cuid { requestId : UUID; referenceOperationId : UUID; operation : String(40); maloId : String(40); actor : String(80); effectiveDate : Date; eventTime : Timestamp; beforeValue : LargeString; afterValue : LargeString; reason : String(1000); simulated : Boolean default true; }
entity ImportRuns : cuid { sourceFile : String(200); sourceChecksum : String(64); startedAt : Timestamp; completedAt : Timestamp; status : String(20); totalRows : Integer; buildingCount : Integer; conflictCount : Integer; message : String(1000); }
/** Sheet-level lineage for complete workbook imports. */
entity ImportedSheets : cuid {
  importChecksum : String(64); sourceFile : String(200); sheetName : String(100);
  rowCount : Integer; importedAt : Timestamp; status : String(20); message : String(1000);
}

/** Complete, immutable-style source records from new-data-source.xlsx. */
entity ProducerOnboarding {
  key sourceId : String(120); sourceFile : String(200); sourceSheet : String(100); sourceRowNumber : Integer; importChecksum : String(64);
  firstName : String(120); lastName : String(120); email : String(255); salutation : String(40);
  isBusiness : Boolean; isReverseCharge : Boolean; deliveryStreet : String(200); deliveryHouseNumber : String(40);
  deliveryZipcode : String(20); deliveryCity : String(120); subscriptionReason : String(80); productionType : String(80);
  plantCapacityKw : Decimal(15,6); latitude : Decimal(12,8); longitude : Decimal(12,8); marketLocationId : String(40);
  tranche : String(120); preferredDeliveryStart : Date; saasCustomerId : String(120); saasContractId : String(120);
  productName : String(160); consumerSaasContractId : String(120); controlResource : String(200); technicalResources : String(500);
  contractStartUtc : Date; contractEndUtc : Date; buildingId : String(40); sourceData : LargeString;
}

/** Registrations received from the external Registration MVP; separate from immutable workbook rows. */
entity ProducerRegistrationRequests : cuid, managed {
  idempotencyKey : String(200) @assert.unique; status : String(30); constructType : String(30);
  firstName : String(120); lastName : String(120); email : String(255); salutation : String(40);
  isBusiness : Boolean; isReverseCharge : Boolean; deliveryStreet : String(200); deliveryHouseNumber : String(40);
  deliveryZipcode : String(20); deliveryCity : String(120); subscriptionReason : String(80); productionType : String(80);
  plantCapacityKw : Decimal(15,6); latitude : Decimal(12,8); longitude : Decimal(12,8); marketLocationId : String(80);
  tranche : String(120); preferredDeliveryStart : Timestamp; saasCustomerId : String(120); saasContractId : String(120);
  productName : String(160); consumerSaasContractId : String(120); controlResource : String(200); technicalResources : String(500);
  contractStartUtc : Timestamp; contractEndUtc : Timestamp; buildingId : String(40);
  meteringLocationId : String(80); generationFeedInMaloId : String(40); buildingMarketLocationMalo : String(40);
  submittedBy : String(80); payload : LargeString;
}

entity HourlyConsumption {
  key sourceId : String(160); sourceFile : String(200); sourceSheet : String(100); sourceRowNumber : Integer; importChecksum : String(64);
  startTime : Timestamp; endTime : Timestamp; buildingId : String(40); meloId : String(80); maloId : String(40);
  participationRaw : String(30); participates : Boolean; consumptionKwh : Decimal(18,9); energyUnit : String(20); aggregationType : String(40);
}

entity HourlyGeneration {
  key sourceId : String(160); sourceFile : String(200); sourceSheet : String(100); sourceRowNumber : Integer; importChecksum : String(64);
  startTime : Timestamp; endTime : Timestamp; buildingId : String(40); maloId : String(40); productionType : String(80);
  plantCapacityKw : Decimal(15,6); generationKwh : Decimal(18,9); energyUnit : String(20); aggregationType : String(40);
}

entity EnergyPrices {
  key sourceId : String(160); sourceFile : String(200); sourceSheet : String(100); sourceRowNumber : Integer; importChecksum : String(64);
  startTime : Timestamp; endTime : Timestamp; aggregationType : String(40); marketPriceEurKwh : Decimal(18,9);
  retailPriceEurKwh : Decimal(18,9); plantPurchasePriceEurKwh : Decimal(18,9); exportRemunerationEurKwh : Decimal(18,9);
  tenantElectricitySubsidyEurKwh : Decimal(18,9); meteringFeeEurPerMeter24h : Decimal(18,9);
  residualSupplier : String(160); networkOperator : String(160); meteringOperator : String(160);
}

entity SourceFieldDescriptions {
  key sourceId : String(120); sourceFile : String(200); sourceSheet : String(100); sourceRowNumber : Integer; importChecksum : String(64);
  fieldName : String(160); requirement : String(80); description : String(1000);
}
entity FinancialRules {
  key sourceId : String(120); sourceFile : String(200); sourceSheet : String(100); sourceRowNumber : Integer; importChecksum : String(64);
  section : String(160); item : String(300); payer : String(200); recipient : String(200); rateSource : String(500); calculationOrRule : LargeString;
}
/** Demo access for other services. The secret is shown once; only its SHA-256 is stored. */
entity ApiKeys : cuid, managed { name : String(80); role : String(20); prefix : String(12); hash : String(64) @assert.unique; createdBy : String(80); lastUsedAt : Timestamp; revokedAt : Timestamp; }
/** Every write call to /api/v1 (who, what, result). Reads are not logged. */
entity ApiCalls : cuid { at : Timestamp; actor : String(80); via : String(10); method : String(8); path : String(200); status : Integer; durationMs : Integer; }
