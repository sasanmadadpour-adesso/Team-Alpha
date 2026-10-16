using { mk7.controlcenter as db } from '../db/schema';

/**
 * Public, versioned REST API (input/output contract for other services).
 * Follows the solution map: Anmeldung Konstrukt → Prüfung der Daten → Korrektur Daten → Konstrukt Übersicht
 * → (Aufbau vSZ gate) → Umstellung auf ruhende MaLo inkl. MeMa/MaMa → handover (outbox).
 * All results are SIMULATED in a local SQLite database — no SAP connection.
 */
@title: 'Ruhende MaLo Process API (Simulation)'
@Core.Description: 'MK7 energy-sharing constructs: register, validate, correct, confirm vSZ readiness and switch participating MaLos to ruhend with MeMa/MaMa maintenance. No SAP connection.'
@protocol: 'rest'
@path: '/api/v1'
service ProcessApi {

  /* ------------------------------------------------------------ types */
  type Severity : String enum { ERROR; REVIEW; WARNING; INFO; }
  type Resolution : String enum { CHOOSE_BUILDING; EXCLUDE_PARTICIPANT; FIX_VALUE; CONFIRM_ASSUMPTION; }
  type Operation : String enum { SET_DORMANT; REACTIVATE; REMOVE_FROM_CONSTRUCT; CORRECT_TRANSITION; REVERSE_TRANSITION; }

  type Participant {
    role                   : String;  // Haushaltsverbrauch | Marktlokation Reststrom | Solaranlage | Windkraftanlage
    maloId                 : String;
    meloId                 : String;
    participates           : Boolean;
    generationFeedInMaloId : String;
    supplyStartUtc         : Date;
  }
  type Registration {
    buildingId    : String;
    city          : String;
    operator      : String;
    streetAddress : String;
    stichtag      : Date;
    participants  : many Participant;
  }
  type RegistrationResult { constructIds: many String; rows: Integer; households: Integer; participating: Integer; }

  type Issue {
    ID: UUID; ruleId: String; checkGroup: String; severity: Severity; status: String; constructIds: String;
    objectType: String; objectId: String; field: String; message: String; allowedResolutions: String; notice: Boolean;
    resolution: String; resolutionValue: String; reason: String; resolvedBy: String; resolvedAt: Timestamp;
  }
  type ValidationReport { constructId: String; total: Integer; open: Integer; blocking: Integer; notices: Integer; issues: many Issue; }

  type Step { id: String; state: String; detail: String; }
  type SwitchItem { itemKey: String; sourceId: String; maloId: String; meloId: String; role: String; status: String; code: String; message: String; beforeState: String; afterState: String; steps: many Step; }
  type PlannedRelationship { kind: String; context: String; pdfRef: String; fromId: String; toId: String; validFrom: Date; validToExclusive: Date; status: String; ownerKey: String; }
  type SwitchResult {
    constructId: String; stichtag: Date; reststromMaloId: String; status: String; code: String; message: String;
    items: many SwitchItem; relationships: many PlannedRelationship; simulated: Boolean;
  }
  type ConstructRun { constructId: String; stoppedAt: String; message: String; stage: String; dormantCount: Integer; eligibleCount: Integer; openIssueCount: Integer; items: many SwitchItem; }
  type ProcessResult { runId: UUID; success: Integer; alreadyDone: Integer; skipped: Integer; blocked: Integer; review: Integer; error: Integer; constructs: many ConstructRun; simulated: Boolean; }
  type RelationshipRow { constructId: String; kind: String; context: String; fromId: String; toId: String; validFrom: Date; validTo: Date; open: Boolean; provenance: String; }

  type OperationCommand {
    operation: Operation; maloId: String; buildingId: String; effectiveDate: Date;
    reason: String; referenceOperationId: UUID;
  }
  type Check { code: String; result: String; confidence: String; message: String; }
  type RelationshipDiff { kind: String; status: String; code: String; blocking: Boolean; message: String; fromId: String; toId: String; }
  type OperationResult {
    operation: Operation; status: String; code: String; message: String; maloId: String; buildingId: String;
    reststromMaloId: String; effectiveDate: Date; beforeState: String; afterState: String; canExecute: Boolean;
    simulated: Boolean; requestId: UUID; checks: many Check; relationships: many RelationshipDiff;
  }
  type Persona { id: String; name: String; title: String; role: String; }
  type Session { token: String; expiresAt: Timestamp; user: Persona; }
  type Principal { authenticated: Boolean; id: String; name: String; role: String; via: String; }
  type NewApiKey { ID: UUID; name: String; role: String; prefix: String; token: String; }
  type Health { status: String; mode: String; sapConnection: String; version: String; accessCode: Boolean; publicUrl: String; }

  /* ------------------------------------------------------------ resources */

  /** S4 Konstrukt Übersicht — one MK7 construct per building, with stage and counters. */
  @readonly entity Constructs as projection on db.Constructs actions {
    /** S2 Prüfung der Daten (re-validates all constructs; cross-construct rules need the full picture). */
    action validate() returns ValidationReport;
    /** S5 Aufbau vSZ gate: confirm checklist items (all if empty) with evidence. */
    action confirmVsz(itemCodes: many String, evidence: String, actor: String) returns many VszChecklist;
    action setStichtag(stichtag: Date, actor: String) returns ValidationReport;
    /** S6 preview: change plan (MeMa/MaMa to create, MaLos to set RUHEND). Never writes. */
    action previewSwitch() returns SwitchResult;
    /** S6 execute. Repeat-safe: identical work returns ALREADY_DONE. */
    action executeSwitch(actor: String) returns SwitchResult;
    /** Automatic pipeline for this construct: S2 → gate → S6 → S7. */
    action process(actor: String) returns ConstructRun;
    /** S7 §5 list for Abrechnung. */
    function relationshipList() returns many RelationshipRow;
  };
  @readonly entity Participants      as projection on db.ParticipantSourceRows excluding { sourceData, unverifiedSourceAttributes };
  @readonly entity MarketLocations   as projection on db.MarketLocations;
  /** S3 Korrektur Daten worklist. */
  @readonly entity Issues            as projection on db.ValidationIssues actions {
    action resolve(resolution: Resolution, value: String, reason: String, actor: String) returns ValidationReport;
  };
  @readonly entity VszChecklist      as projection on db.VszChecklistItems;
  @readonly entity Relationships     as projection on db.Relationships;
  @readonly entity LifecyclePeriods  as projection on db.LifecyclePeriods;
  @readonly entity ProcessRequests   as projection on db.ProcessRequests;
  @readonly entity ProcessRuns       as projection on db.ProcessRuns;
  @readonly entity AuditEvents       as projection on db.AuditEvents;
  /** Demo access: API keys (the secret is never returned after creation) and the log of write calls. */
  @readonly entity ApiKeys           as projection on db.ApiKeys excluding { hash };
  @readonly entity ApiCalls          as projection on db.ApiCalls;
  /** Handover to downstream processes (UTILMD, INVOIC, EDM) — recorded, NOT sent. */
  @readonly entity Outbox            as projection on db.OutboxEvents;

  /* ------------------------------------------------------------ operations */

  type CaseIssue { ID: UUID; ruleId: String; severity: String; checkGroup: String; message: String; allowedResolutions: String; field: String; constructIds: String; createdAt: Timestamp; }
  type CaseView {
    caseId: String; constructId: String; city: String; maloId: String; meloId: String; role: String; kind: String;
    status: String;   // NEW | DONE | READY | WAITING | DECISION | CORRECTION | EXCLUDED | NOT_PARTICIPATING | REACTIVATED
    category: String; // STATUS | VSZ | DECISION | CORRECTION
    code: String; message: String; businessState: String; steps: many Step; issues: many CaseIssue; since: Timestamp;
    feedInMaloId: String; reststromMaloId: String; exclusionReason: String;
  }

  function health() returns Health;
  /** Demo sign-in: pick a persona, receive a Bearer token (12 h). Not real authentication. */
  action login(user: String, code: String) returns Session;
  function personas() returns many Persona;
  /** The caller as the API sees them (from the Bearer token). */
  function me() returns Principal;
  /** Create an API key for another service. The secret is returned once. Role: VIEWER | MAINTAINER | PIPELINE. */
  action createApiKey(name: String, role: String) returns NewApiKey;
  action revokeApiKey(id: UUID) returns Boolean;
  /** One case per participant: the single, live status every client shows. */
  function cases() returns many CaseView;
  /** S1 Anmeldung Konstrukt (JSON). Re-registering a building replaces its source rows and process state. */
  action registerConstruct(construct: Registration, actor: String) returns RegistrationResult;
  /** S1 Anmeldung via workbook upload (sheet "MK7 Teilnehmer", base64). Replaces all constructs. */
  action importWorkbook(fileName: String, contentBase64: LargeString, actor: String) returns RegistrationResult;
  /** Automatic pipeline for all (or the given) constructs. Stops per construct at Korrektur or vSZ gate. */
  action processAll(constructIds: many String, actor: String) returns ProcessResult;
  /** Status input from SAP / market communication (simulated): attribute imsys (objectId = MeLo), abmeldung (MaLo), mcm (Einspeise-MaLo). */
  action updateSapState(attribute: String, objectId: String, value: String, actor: String) returns ValidationReport;
  /** Bulk Korrektur (e.g. confirm the same assumption for several constructs). */
  action resolveIssues(ids: many UUID, resolution: Resolution, value: String, reason: String, actor: String) returns ValidationReport;
  /** Manual mode for one MaLo: SET_DORMANT uses the construct engine; lifecycle operations follow Ruhendstellung. */
  action preview(command: OperationCommand) returns OperationResult;
  action execute(command: OperationCommand, actor: String) returns OperationResult;
  /** Demo only: re-import the workbook baseline. */
  action resetDemo(confirm: Boolean) returns String;
  action runSelfCheck() returns { passed: Integer; failed: Integer; results: LargeString; };
}
