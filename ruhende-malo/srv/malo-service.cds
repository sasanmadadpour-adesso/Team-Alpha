using { mk7.controlcenter as db } from '../db/schema';

@path: '/odata/v4/malo'
service MaloService {
  @readonly entity SystemStatuses as projection on db.SystemStatuses;
  @readonly entity Buildings as projection on db.Buildings;
  @readonly entity MarketLocations as projection on db.MarketLocations;
  @readonly entity MeteringLocations as projection on db.MeteringLocations;
  @readonly entity ParticipantSourceRows as projection on db.ParticipantSourceRows;
  @readonly entity Relationships as projection on db.Relationships;
  @readonly entity LifecyclePeriods as projection on db.LifecyclePeriods;
  @readonly entity ProcessRequests as projection on db.ProcessRequests;
  @readonly entity PrerequisiteChecks as projection on db.PrerequisiteChecks;
  @readonly entity AuditEvents as projection on db.AuditEvents;
  @readonly entity ImportRuns as projection on db.ImportRuns;

  type HealthResponse {
    status       : String;
    mode         : String;
    sapConnection: String;
  }

  type TransitionResponse {
    status            : String;
    code              : String;
    message           : String;
    maloId            : String;
    buildingId        : String;
    reststromMaloId   : String;
    effectiveDate     : Date;
    beforeState       : String;
    afterState        : String;
    canExecute        : Boolean;
    simulated         : Boolean;
    prerequisiteProfile : String;
    checksJson        : LargeString;
    reconciliationJson: LargeString;
    requestId         : UUID;
  }
  type BatchResponse { batchId: UUID; buildingId: String; total: Integer; success: Integer; skipped: Integer; alreadyDone: Integer; blocked: Integer; review: Integer; error: Integer; resultsJson: LargeString; simulated: Boolean; }
  type TestRunResponse { executedAt: Timestamp; passed: Integer; failed: Integer; resultsJson: LargeString; }

  function health() returns HealthResponse;
  action previewTransition(maloId: String, buildingId: String, effectiveDate: Date, prerequisiteProfile: String) returns TransitionResponse;
  action setDormant(maloId: String, buildingId: String, effectiveDate: Date, prerequisiteProfile: String, confirmed: Boolean) returns TransitionResponse;
  action reconcileRelationships(maloId: String, buildingId: String, effectiveDate: Date) returns TransitionResponse;
  action previewLifecycle(operation: String, maloId: String, buildingId: String, effectiveDate: Date, referenceOperationId: UUID, reason: String) returns TransitionResponse;
  action reactivate(maloId: String, buildingId: String, effectiveDate: Date, prerequisiteProfile: String, confirmed: Boolean) returns TransitionResponse;
  action removeFromConstruct(maloId: String, buildingId: String, effectiveDate: Date, prerequisiteProfile: String, reason: String, confirmed: Boolean) returns TransitionResponse;
  action correctTransition(maloId: String, buildingId: String, effectiveDate: Date, referenceOperationId: UUID, reason: String, confirmed: Boolean) returns TransitionResponse;
  action reverseTransition(maloId: String, buildingId: String, effectiveDate: Date, referenceOperationId: UUID, reason: String, confirmed: Boolean) returns TransitionResponse;
  action executeBatch(buildingId: String, effectiveDate: Date, prerequisiteProfile: String, confirmed: Boolean) returns BatchResponse;
  action resetDemo(confirmed: Boolean) returns String;
  action runScenarioTests() returns TestRunResponse;
}
