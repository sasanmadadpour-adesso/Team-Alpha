# MVP Plan — "Umstellung auf ruhende MaLo inkl. MeMa/MaMa"

Sources: the solution map "Solution Map für Marktrolle VNB" (adesso, 13.10.2026), `Prozessschritte.pdf` (vSZ procedure, draft), `Datensatz_Deutsch.xlsx`, and FR-01 to FR-25.

---

## 1. What the challenge actually asks for

The solution map marks **four boxes as MVP**. Together they form one connected flow:

```
 [MVP] Anmeldung Konstrukt ──► [MVP] Prüfung der Daten ──► [MVP] Konstrukt Übersicht App
                                   │  (Teilnehmerliste, Einspeiser,        │
                                   │   iMSys, Abmeldeanfrage)              │
                                   ▼                                       │
                              Korrektur Daten  (manual, loops back)        │
                                                                           ▼
                     Aufbau vSZ / Übergabezähler (upstream, "MCM?") ──► [MVP] Umstellung auf ruhende MaLo
                                                                              inkl. MeMa / MaMa
                                                                                   │
                       downstream, NOT MVP: Einzug Reststrom Lieferant (UTILMD) · Abrechnung / Schlussrechnung (INVOIC)
                                            Anpassung EDM · Messwertprozesse (MSCONS)
```

What they told you, translated into requirements:

| They said | Meaning for the MVP |
| --- | --- |
| "It is an automated process" | The flow runs on its own from registration to Umstellung. No clicking through each MaLo. |
| "Things go ruhend automatically, or a conflict comes and must be solved manually" | Two lanes: a **happy path** (automatic) and an **exception path** (Korrektur Daten worklist). After a correction the case goes back into the automatic flow. |
| "Works with input and output based on the diagram (API)" | Each MVP box is an **API step with defined input and output**. The UI is just one client of that API. |
| "The process is in the PDF" | Umstellung = **§6.1 MeMa**, **§6.2 MaMa**, **§6.3 Einspeise-MeMa**. pp. 2–9 (Aufbau vSZ) are the **prerequisite gate**. §5 is the **output list for Abrechnung**. |

## 2. Honest gap analysis of the current app

| Topic | Current app | Problem | Target |
| --- | --- | --- | --- |
| Central object | Single MaLo | The diagram is about the **Konstrukt** (MK7 building + participants). | `Construct` is the root object. MaLos belong to it. |
| MeMa/MaMa | Treated as *preconditions* ("expected vs mock-observed must match before dormancy") | **Backwards.** The PDF says the Umstellung **maintains (creates)** MeMa/MaMa. They are the *output* of the step. | Umstellung **generates** the relationship plan, writes it (simulated), and reads it back. Reconciliation then checks the *result*. |
| Prüfung der Daten | Partly hidden inside the dormancy checks | A separate MVP box with explicit sub-checks (Teilnehmerliste, Einspeiser, iMSys, Abmeldeanfrage) | A dedicated validation step with a rule catalogue (§4.2) and an issue list. |
| Korrektur Daten | Only "pick a building" for one conflict | Needs to be a real worklist | Issue worklist with typed resolutions, an audit trail and automatic re-validation. |
| vSZ prerequisites | One global "ASSUMED_DEMO" switch | Too blunt and not traceable | A per-construct **vSZ readiness checklist** (PDF steps 1–4.7), confirmed through the API with who/when. |
| Input | Excel import script only | No "Anmeldung" API | `POST /constructs` (JSON) and `POST /constructs/import` (xlsx). |
| Output | Status only | No §5 list, no handover | Relationship list export and an **outbox** of downstream events (UTILMD/INVOIC/EDM/MSCONS as `NOT_IMPLEMENTED` stubs). |

**Reusable as-is:** CAP + SQLite setup, the workbook importer, time-slice logic (`lifecycle.ts`, `reconciliation.ts`), idempotency handling, the audit log, lifecycle operations (FR-13 to FR-16), the test setup including HTTP API tests, and the UI design language.

## 3. Target concept

### 3.1 Two state machines

**Construct (Konstrukt)**

```
REGISTERED ─► VALIDATED_WITH_ISSUES ─(all issues resolved)─► VALIDATED
     │                 ▲   │                                   │
     └─► VALIDATED ◄───┘   └─ Korrektur Daten (manual)        ▼
                                                     VSZ_READY (checklist complete)
                                                               │
                                                               ▼
                                         SWITCHING ─► SWITCHED | SWITCHED_WITH_EXCEPTIONS
```

**Participant MaLo (household, Bezug)**

```
REGISTERED ─► CHECKED ─► MEMA_PLANNED ─► MEMA_DONE ─► MAMA_DONE ─► RUHEND
   │             │
   │             └─► ISSUE (REVIEW/BLOCKED) ─► manual correction ─► back to CHECKED
   └─► EXCLUDED (Teilnahme = nein; SKIPPED, stays ACTIVE)
```

Special roles:
- **Reststrom-MaLo**: the target and anchor of the MeMa relationships. It is never itself set dormant.
- **Einspeise-MaLo** (Solar/Wind): MeMa only, no MaMa (§6.3), and only once `mcmCompleted = true`. Otherwise it is `WAITING_FOR_MCM` (not an error).
- **Lifecycle operations after the switch** (FR-13 to FR-16): Wiederaktivierung, Herauslösung, Korrektur, Rücknahme. These are manual mode, already built.

### 3.2 Step catalogue (each one is one API step with input → output)

| # | Box in diagram | Mode | Input | Output |
| --- | --- | --- | --- | --- |
| S1 | **Anmeldung Konstrukt** | auto | Construct JSON or Excel (participant list) | `constructId`, normalized participants, import report |
| S2 | **Prüfung der Daten** | auto | `constructId` | Validation report with issues (rule ID, severity, object, message, suggested fix) |
| S3 | **Korrektur Daten** | **manual** | `issueId` + resolution (`CHOOSE_BUILDING`, `EXCLUDE_PARTICIPANT`, `FIX_VALUE`, `CONFIRM_ASSUMPTION`) + reason | Updated data, audit event, automatic re-run of S2 |
| S4 | **Konstrukt Übersicht** | read | — | Construct list and detail: stage, counts, issues, relationships |
| S5 | Aufbau vSZ (gate, not built) | manual confirm | Checklist items from PDF 1–4.7 with `confirmedBy`, `confirmedAt`, `evidence` | `VSZ_READY` or a list of missing items |
| S6 | **Umstellung auf ruhende MaLo inkl. MeMa/MaMa** | auto | `constructId`, Stichtag, `Idempotency-Key` | Change plan → executed relationships (MeMa §6.1, MaMa §6.2, Einspeise-MeMa §6.3) → MaLos RUHEND → verification → per-MaLo results |
| S7 | Output / handover | auto | — | §5 relationship list (CSV/XLSX for Abrechnung), outbox events for downstream boxes (`NOT_IMPLEMENTED`), webhook-ready |

**Automatic orchestration:** `POST /constructs/{id}/process` runs S2 → (stop if issues) → S5 gate → S6 → S7 and returns where it stopped and why. Running it again continues from the stop point (idempotent).

## 4. Business rules

### 4.1 Umstellung (S6), faithful to the PDF

| Rule | PDF | Implementation |
| --- | --- | --- |
| MeMa: from the Reststrom-MaLo's Anlage to **all participating Bezugs-MeLos** | §6.1, pp. 11–12 | One `MEMA` relationship per participating household MeLo → Reststrom-MaLo, `Tag ab = Stichtag`, `Tag bis = 9999-12-31` |
| MaMa: each participating Bezugs-MaLo gets the Reststrom-MaLo **with the relevant Zeitscheibe** under "Zusätzliche Attribute" | §6.2, pp. 13–14 | One `MAMA` per participating MaLo → Reststrom-MaLo, same Zeitscheibe; no overlapping target |
| Einspeise-MaLo: **MeMa only, no MaMa**, and only after MCM (C1003_M001 / C1006_M001) | §6.3, p. 15 | MeMa only if `mcmCompleted`; never MaMa |
| Non-participants (`nein`) get **no** relationship | §6.1 "Relevant = teilnehmend" | `EXCLUDED` / `SKIPPED` |
| ZP-Status dating (§4.5) is setup, **not** proof of "ruhend" | p. 7 | Do not reuse it as the dormancy mechanism. "RUHEND" stays a *simulated business state*; documented as an open question (§8). |
| `/EKN/ESERVICE_UPD` did not work | p. 9 | Never assume it as an API; the SAP adapter stays `NOT_CONFIGURED` |

### 4.2 Prüfung der Daten — rule catalogue (S2)

| ID | Sub-check (diagram) | Rule | Severity | Resolution |
| --- | --- | --- | --- | --- |
| V01 | Teilnehmerliste | Required fields present (building, role, MaLo, MeLo, Teilnahme) | ERROR | FIX_VALUE |
| V02 | Teilnehmerliste | MaLo ID = 11 digits, MeLo ID = 33 characters starting with `DE` | ERROR | FIX_VALUE |
| V03 | Teilnehmerliste | MaLo check digit (BDEW). **Verify the algorithm before enforcing it; warning only until then.** | WARNING | — |
| V04 | Teilnehmerliste | Exactly **one** Reststrom-MaLo per building | ERROR | FIX_VALUE |
| V05 | Teilnehmerliste | Same MaLo in **several buildings** (e.g. `50539603888`) | REVIEW | CHOOSE_BUILDING / EXCLUDE |
| V06 | Teilnehmerliste | Same MeLo assigned twice | REVIEW | FIX_VALUE |
| V07 | Teilnehmerliste | `Teilnahme MK7` is Ja/nein (no other value) | ERROR | FIX_VALUE |
| V08 | Einspeiser | Generation row has an Einspeise-MaLo | ERROR | FIX_VALUE |
| V09 | Einspeiser | MCM process completed (C1003/C1006) → otherwise `WAITING_FOR_MCM` | INFO | CONFIRM_ASSUMPTION |
| V10 | iMSys | iMSys installed with the right OBIS tariffing (PDF step 3). **Not in the Excel → UNKNOWN** | WARNING | CONFIRM_ASSUMPTION |
| V11 | Abmeldeanfrage | Deregistration request for the household MaLos is present. **Not in the Excel → UNKNOWN** | WARNING | CONFIRM_ASSUMPTION |
| V12 | Zeitscheiben | Stichtag valid, within the contract period, no overlap with existing periods | ERROR | FIX_VALUE |
| V13 | Teilnehmerliste | At least one participating household per construct | ERROR | — |

Rule: **ERROR/REVIEW blocks the Umstellung for the affected MaLo only**, not the whole construct (other MaLos continue). Missing V10/V11 data is shown as `UNKNOWN` and must be *explicitly* confirmed (S3 `CONFIRM_ASSUMPTION` with a reason), never silently assumed.

With the real workbook this yields: 1× V05 (`50539603888`), 1× excluded (`50539603604`), V10/V11 UNKNOWN for all households, and V09 for 3 generators. That is a realistic demo.

## 5. API design (`/api/v1`, REST + JSON, OpenAPI)

| Method | Path | Step | Purpose |
| --- | --- | --- | --- |
| POST | `/constructs` | S1 | Anmeldung as JSON (`buildingId`, `reststromMaloId`, `participants[]`) |
| POST | `/constructs/import` | S1 | Excel upload (MK7 Teilnehmer) → one construct per building |
| GET | `/constructs`, `/constructs/{id}` | S4 | Overview and detail (stage, counts, participants) |
| POST | `/constructs/{id}/validate` | S2 | Run Prüfung → report |
| GET | `/issues?constructId=&status=OPEN` | S3 | Korrektur worklist |
| POST | `/issues/{id}/resolve` | S3 | `{ resolution, value?, reason }` → re-validates |
| GET / PUT | `/constructs/{id}/vsz-checklist` | S5 | Read and confirm vSZ readiness items |
| POST | `/constructs/{id}/switch/preview` | S6 | Change plan (MeMa/MaMa to create, MaLos to set ruhend). No writes. |
| POST | `/constructs/{id}/switch` | S6 | Execute (header `Idempotency-Key`) → per-MaLo results |
| POST | `/constructs/{id}/process` | S2→S7 | **Automatic pipeline**: runs until done or the next manual stop |
| GET | `/constructs/{id}/relationships(.csv)` | S7 | §5 list for Abrechnung |
| GET | `/outbox` | S7 | Downstream events (`UTILMD_EINZUG_RESTSTROM`, `INVOIC_SCHLUSSRECHNUNG`, `EDM_UPDATE`) → `NOT_IMPLEMENTED` |
| POST | `/malos/{id}/operations/preview`, `/malos/{id}/operations` | — | Manual lifecycle (FR-13 to FR-17), already built |
| GET | `/process-runs/{id}`, `/audit-events` | — | Traceability |

Best practices to apply:
- **One error format:** `{ code, message, target, details[] }` with HTTP 400/404/409/422.
- **Idempotency-Key** on all writes.
- **Status values** from FR-20 on every item result.
- **Versioned path** (`/v1`), OpenAPI generated from CDS, and `simulated: true` on every response.
- **Preview** = same code path, no writes (FR-19).
- **Async-ready:** `process` returns a `runId` that `GET /process-runs/{id}` can poll. The MVP runs synchronously, but the contract is ready for async.

## 6. Data model changes (CDS)

New: `Constructs` (id, buildingId, reststromMaloId, stage, stichtag), `ValidationIssues` (ruleId, severity, objectId, status OPEN/RESOLVED, resolution, reason, resolvedBy/At), `VszChecklistItems` (constructId, itemCode from PDF 1–4.7, status UNKNOWN/CONFIRMED, confirmedBy/At, evidence), `OutboxEvents` (type, payload, status `NOT_IMPLEMENTED`).
Changed: `Relationships` gets `origin = PLANNED | SIMULATED_WRITTEN | VERIFIED` instead of the expected/mock-observed precondition; `ParticipantSourceRows` gets `constructId`, `participantStatus`, and new columns `mcmCompleted`, `imsysStatus` and `deregistrationStatus` (default UNKNOWN).
Kept: `LifecyclePeriods`, `ProcessRequests`, `AuditEvents`, `ImportRuns`.

## 7. UI (client of the API, three screens + API)

1. **Konstrukte (overview, MVP box "Konstrukt Übersicht App")**: one card per building with a stage stepper (Angemeldet → Geprüft → Korrektur → vSZ bereit → Umgestellt), counts and a **Process** button. A global **"Process all"** runs the automatic pipeline.
2. **Construct detail**: the stepper on top, then tabs.
   - Participants (role, MeLo, status)
   - Prüfung (rules with pass/fail)
   - MeMa/MaMa (the generated relationships with Zeitscheiben, and the Einspeise-MeMa special case)
   - Verlauf (history)
3. **Korrektur worklist (MVP exception lane)**: all open issues across constructs. Each one shows a clear fix action and a required reason, and the case re-validates automatically afterwards.
4. **MaLo manual operations** (already built): Wiederaktivierung, Herauslösung, Korrektur, Rücknahme.
5. **API**: as now, updated to the new endpoints.

## 8. Open questions for the challenge givers

These are the honest unknowns; ask them, and record the answers in `docs/ASSUMPTIONS.md`.

1. What exactly is "ruhend" in their SAP? A ZP-Status, a field in "Zusätzliche Attribute", or an end of supply? The PDF does not say.
2. Where do **iMSys** and **Abmeldeanfrage** data come from (not in the Excel)? Is a manual confirmation OK for the MVP?
3. Stichtag rule: is `mk7_versorgungsbeginn_utc` (2026-10-01) the date for MeMa/MaMa *Tag ab*?
4. Is the MaLo in two buildings a deliberate test case, and is "choose building" the expected correction?
5. Should the output be the §5 Excel list exactly as their billing team uses it? If yes, which columns?

## 9. Implementation phases (each ends with a working demo and green tests)

| Phase | Content | Gate |
| --- | --- | --- |
| P1 Construct core | `Constructs` model; importer creates 3 constructs; `GET /constructs`; overview screen | 3 constructs, 17 rows, 16 unique MaLos (FR-01 to FR-05) |
| P2 Prüfung + Korrektur | Rule catalogue V01–V13, `validate`, issue worklist, `resolve`, re-validation | Real data gives the expected issues; resolving V05 clears it (FR-03, FR-04, FR-10, FR-11) |
| P3 vSZ gate | Checklist from PDF 1–4.7, confirm endpoint and UI | Without confirmation the construct is blocked (FR-06) |
| P4 Umstellung | Relationship **generation** (MeMa/MaMa/Einspeise), apply, read-back, set RUHEND, idempotent | B-MUL-01: 3 MeMa + 3 MaMa + Einspeise-MeMa only with MCM; repeat = ALREADY_DONE (FR-07 to FR-09, FR-12, FR-21) |
| P5 Automatic pipeline + output | `process` orchestration, `process all`, §5 CSV export, outbox | One click → 9 RUHEND, 1 excluded, 1 in Korrektur (FR-18, FR-20) |
| P6 Lifecycle + manual | Re-wire the existing FR-13 to FR-17 operations to the construct model | Existing tests stay green (FR-13 to FR-17, FR-22) |
| P7 Hardening | Error format, OpenAPI, API tests per endpoint, README, demo script | `npm test`, typecheck and build pass; FR-23 to FR-25 |

## 10. Demo script (follows the diagram left to right)

1. **Anmeldung:** upload the Excel (or `POST /constructs`) → 3 constructs appear.
2. **Prüfung:** shows 1 conflict (MaLo in 2 buildings), 1 excluded participant, and iMSys/Abmeldeanfrage as UNKNOWN.
3. **Process all** (automatic): Müllheim and the clean MaLos go through. The conflict lands in **Korrektur**.
4. **Korrektur Daten:** choose the building, give a reason → the case re-validates and continues automatically → RUHEND.
5. Open a construct: the generated **MeMa** (Reststrom → MeLos) and **MaMa** (MaLo → Reststrom, Zeitscheibe), and the generator with MeMa only.
6. **Output:** download the §5 list. The outbox shows the next diagram boxes (UTILMD/INVOIC) as defined interfaces, `NOT_IMPLEMENTED`.
7. **API tab / curl:** the same flow by API. Then run the tests.
8. Manual mode: Wiederaktivierung of one MaLo with history.

## 11. Requirement traceability

| FR | Covered by |
| --- | --- |
| 01 | P1 importer + `POST /constructs/import` |
| 02 | P1 model + overview |
| 03 | P1/P2 V05, V06 |
| 04 | V07, EXCLUDED |
| 05 | V04 |
| 06 | P3 vSZ checklist |
| 07 | S6 MeMa §6.1 |
| 08 | S6 MaMa §6.2 |
| 09 | S6 §6.3 + V09 |
| 10 | V12 + `lifecycle.ts` |
| 11 | V10, V11 + strict gate |
| 12 | S6 |
| 13–16 | P6 manual ops |
| 17 | Manual mode |
| 18 | P5 `process` |
| 19 | `switch/preview` |
| 20 | Status model |
| 21 | Idempotency-Key + ALREADY_DONE |
| 22 | AuditEvents |
| 23 | SQLite file |
| 24 | `resetDemo` |
| 25 | Vitest unit + HTTP API tests per phase |
