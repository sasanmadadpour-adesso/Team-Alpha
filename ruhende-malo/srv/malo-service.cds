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

  function health() returns HealthResponse;
}
