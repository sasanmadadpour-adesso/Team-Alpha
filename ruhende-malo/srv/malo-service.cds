using { mk7.controlcenter as db } from '../db/schema';

/** Internal read-only OData V4 view of the simulation data. All commands go through the REST API (/api/v1). */
@path: '/odata/v4/malo'
service MaloService {
  @readonly entity Constructs as projection on db.Constructs;
  @readonly entity Buildings as projection on db.Buildings;
  @readonly entity MarketLocations as projection on db.MarketLocations;
  @readonly entity ParticipantSourceRows as projection on db.ParticipantSourceRows;
  @readonly entity ValidationIssues as projection on db.ValidationIssues;
  @readonly entity VszChecklistItems as projection on db.VszChecklistItems;
  @readonly entity Relationships as projection on db.Relationships;
  @readonly entity LifecyclePeriods as projection on db.LifecyclePeriods;
  @readonly entity ProcessRequests as projection on db.ProcessRequests;
  @readonly entity ProcessRuns as projection on db.ProcessRuns;
  @readonly entity AuditEvents as projection on db.AuditEvents;
  @readonly entity OutboxEvents as projection on db.OutboxEvents;
  @readonly entity ImportRuns as projection on db.ImportRuns;
  @readonly entity ImportedSheets as projection on db.ImportedSheets;

  type HealthResponse { status: String; mode: String; sapConnection: String; }
  function health() returns HealthResponse;
}
