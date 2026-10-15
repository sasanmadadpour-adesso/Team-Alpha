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
entity MarketLocations : managed { key maloId : String(40); primaryRole : String(80); participates : Boolean; businessState : String(20) default 'ACTIVE'; assignmentCount : Integer; conflictingAssignment : Boolean default false; assignmentSummary : String(500); }
entity MeteringLocations : managed { key meloId : String(80); assignmentCount : Integer; conflictingAssignment : Boolean default false; }
entity ParticipantSourceRows : managed {
  key sourceId : String(100); sourceFile : String(200); sourceSheet : String(80); sourceRowNumber : Integer;
  buildingId : String(40); role : String(80); participationRaw : String(30); participates : Boolean;
  meloId : String(80); maloId : String(40); generationFeedInMaloId : String(40);
  supplyStartUtc : Date; contractFromUtc : Date; contractToUtc : Date;
  city : String(120); operator : String(160); streetAddress : String(200); reststromMaloId : String(40);
  maloConflict : Boolean default false; unverifiedSourceAttributes : LargeString;
}
entity Relationships : cuid, managed { kind : String(10); source : String(30); buildingId : String(40); fromLocationId : String(80); toLocationId : String(80); validFrom : Date; validToExclusive : Date; provenance : String(500); }
entity LifecyclePeriods : cuid, managed { maloId : String(40); businessState : String(20); validFrom : Date; validToExclusive : Date; provenance : String(100); }
entity ProcessRequests : cuid, managed { operation : String(40); maloId : String(40); buildingId : String(40); effectiveDate : Date; mode : String(20); status : String(30); idempotencyKey : String(120) @assert.unique; referenceOperationId : UUID; actor : String(80); reason : String(1000); reststromMaloId : String(40); simulated : Boolean default true; }
entity PrerequisiteChecks : cuid, managed { requestId : UUID; checkCode : String(80); result : String(30); confidence : String(30); notes : String(1000); }
entity AuditEvents : cuid { requestId : UUID; operation : String(40); maloId : String(40); actor : String(80); effectiveDate : Date; eventTime : Timestamp; beforeValue : LargeString; afterValue : LargeString; reason : String(1000); simulated : Boolean default true; }
entity ImportRuns : cuid { sourceFile : String(200); sourceChecksum : String(64); startedAt : Timestamp; completedAt : Timestamp; status : String(20); totalRows : Integer; buildingCount : Integer; conflictCount : Integer; message : String(1000); }
