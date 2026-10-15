# AGENTS.md — MK7 Control Center / Umstellung auf ruhende MaLo

> Repository-wide instructions for **OpenCode** and other coding agents. Read this file first, follow it as an implementation contract, and keep it updated when the verified codebase changes. Place this file at the **root of the repository**. Do not replace it with generic instructions produced by `/init`.

## 0. Mission: deliver a working presentation MVP

Build a **local, SAP-oriented, English-language web application** called **MK7 Control Center**. It simulates the business process **„Umstellung auf ruhende MaLo“** (dormant market location) and its lifecycle around a virtual summation meter (**vSZ**). The user develops in **VS Code with OpenCode**, wants fast agent-driven implementation, and has one source workbook, `Datensatz_Deutsch.xlsx`.

**Make something that actually works**, not a collection of beautiful hardcoded mockups. The presentation must include:

1. A dashboard based on the genuine workbook records.
2. A searchable **MaLo Explorer** with building/role/participation filters.
3. A **Process Workbench** with preview, explicit execute, and detailed check results.
4. Functional simulated **Ruhendstellung, Wiederaktivierung, Herauslösung, Korrektur, Rücknahme**.
5. **MeMa/MaMa** expected-versus-observed reconciliation with valid time slices.
6. Both single-request **manual** and multi-request **automatic batch** execution through the SAME backend engine.
7. Persistent simulated state, immutable audit events, repeat-safe processing, error/review states, a **Reset Demo** control, and executable tests with honest PASS/FAIL results.
8. Clear **`SIMULATION — NO SAP CONNECTION`** labeling everywhere a viewer could mistake the demo for real SAP.

**Finish a running vertical slice first**: import data → display it → preview one MaLo → execute simulated Ruhendstellung → refresh and see persisted state. Then add remaining features incrementally. The user has a tight self-imposed working session; do **not** argue about duration, estimate schedules, or build unnecessary infrastructure. Prioritize a verified end-to-end demo over scope expansion.

### Non-negotiable truthfulness

- This is a **SAP CAP side-by-side prototype**, NOT an ABAP implementation inside SAP IS-U and NOT an actual SAP IS-U connection.
- SQLite is a genuine local persistence database; the *records* and relevant SAP verification responses are dummy/simulated.
- **Never claim** that Excel-derived relationships were verified in an SAP system.
- **Never claim** a MaLo has been made dormant in real SAP. Show `SIMULIERT` and persist only simulation records.
- The uploaded PDF specifies **Aufbau vSZ** and relationship maintenance, **not a full dormant-MaLo update API**. Do not invent SAP tables, BAPIs, RFCs, transactions, authorization rules, market processes, or regulatory business rules.
- Any real SAP adapter must remain a non-operative **integration boundary / explicit `NOT_CONFIGURED` stub** until confirmed SAP documentation, access, APIs, authorizations, and integration tests exist.
- Supplier/market status and vSZ readiness are **not provided as verified SAP data** in the Excel. Model these as `UNKNOWN` by default; allow an **explicit visibly labeled demo assumption** solely to demonstrate the pipeline, never silently treat them as verified.

## 1. Source of truth and scope

### Provided input artifacts

Expect these user-supplied files in the repository (they may initially be at the root or another user-specified location; discover them safely):

- `Datensatz_Deutsch.xlsx` — the **only source workbook**; authoritative for MK7 participants.
- `Prozessschritte(1).pdf` or `Prozessschritte.pdf` — the vSZ procedure document dated 14.07.2026, marked **ENTWURF**. Duplicates may exist; do not double-apply requirements.
- Optional `solution_map_rotated.png` / original solution map — high-level process context, not executable specification.

Prefer organizing unchanged reference copies under `data/source/` and `docs/reference/`. Do **not** modify the original workbook or PDF. If files are absent, search the workspace first; do not silently invent an alternative participant dataset. If missing in the user's actual repository, implement the loader and provide a precise placement instruction. A tiny clearly labeled fallback **test fixture** may enable code/unit tests, but may NOT be represented as the user's complete source data.

### Source priority

1. Exact values in the user's workbook for IDs, buildings, role, participation, and dates.
2. Exact documented manual vSZ steps in `Prozessschritte(1).pdf`.
3. Explicit decisions and scope agreed in this `AGENTS.md`.
4. Established, verified SAP CAP/UI5 documentation and installed package interfaces.
5. Clearly identified *demo-only assumptions* for otherwise missing business facts.

When sources conflict or omit required data, report the gap in `docs/ASSUMPTIONS.md`, expose `UNKNOWN` or `REVIEW`, and do not hide it behind a success badge.

### In scope (working local MVP)

- Workbook import and normalization into CAP/SQLite.
- Reststrom-MaLo resolution by `gebaeude_id` and role.
- Participant eligibility validation, duplicate/conflict detection, relationship reconciliation, preconditions, market-status check interface, effective dates, lifecycle status/history.
- Manual preview/confirm/execute; batch run; persisted requests, results, and audit trail.
- Simulated full lifecycle operations: Ruhendstellung, Wiederaktivierung, Herauslösung, Korrektur, Rücknahme.
- Operational GUI, documented business rule outcomes, robust automated tests and a repeatable presentation demo.
- Real SAP integration interface/adapter **shape**, not implementation of unsupported SAP operations.

### Out of scope (must NOT accidentally implement)

- Real SAP IS-U updates, SAP GUI scripting, direct writes to SAP standard tables, unapproved RFC/transaction wrappers.
- Real UTILMD / GPKE / MSCONS / INVOIC communication, supplier changes, settlement, billing, EDM, energy-sharing allocation formulas, eCount/Commercial Groups, customer contracts, payments, meter installation.
- Production authentication, BTP deployment, HANA migration, real unattended scheduler, Fiori Launchpad integration, data warehouses, external services.
- Creating a real Reststrom-MaLo or completing the entire upstream **Aufbau vSZ** workflow.

These may be shown as *upstream prerequisites*, *future integrations*, or explicit `NOT_IMPLEMENTED` capabilities, not as completed features.

## 2. Prescribed technology stack

Use **one Node.js/TypeScript workspace** in VS Code:

| Layer | Choice |
| --- | --- |
| Backend | **SAP CAP Node.js + TypeScript** (`@sap/cds`, compatible TypeScript support) |
| Persistence | **SAP CAP SQLite adapter** for local development; persistent on-disk database |
| Data model | **CDS** (`db/schema.cds`) |
| API | **CAP OData V4** entities plus explicit **custom actions** |
| Frontend | **React + TypeScript + Vite** |
| UI kit | **`@ui5/webcomponents-react`** (and peer dependencies) for SAP Fiori-style UI |
| Icons | UI5-provided icon set or `lucide-react` if helpful; stay visually coherent |
| Import | A small one-time **Node/TypeScript Excel-to-CSV/JSON importer**, e.g. `xlsx`, with tests |
| Test tools | **Vitest** for pure engine and service tests; optional React Testing Library for UI |
| Formatting | Prettier / ESLint / TypeScript strict mode |
| State | Backend CAP + SQLite is authoritative; React caches only UI state |
| Versioning | Git with useful commits if already configured |

No Next.js, Python/FastAPI, Express replacement for CAP, Prisma, Firebase, Supabase, separate PostgreSQL, Redux, Tailwind/shadcn duplicate design system, microservices, queues, cloud provisioning, Kubernetes, or authentication setup unless a real blocker makes it unavoidable. Use CAP query APIs (CQL/CQN) instead of SQLite-specific queries in business logic, preserving a later possible HANA migration path.

**Verify current installation commands and package APIs against installed versions and package docs before relying on them.** Prefer ordinary `npm` commands and compatible stable versions, not guessed package methods. Use `cds` tooling where appropriate; set up a working root `npm run dev`, `npm run build`, `npm test`, and `npm run typecheck` (adapt implementation to genuine commands).

## 3. Data contract — must match the actual workbook

### The primary worksheet is `MK7 Teilnehmer`

The workbook also contains `Erzeuger Registrierung`, `Stündlicher Verbrauch`, `Stündliche Erzeugung`, `Strompreise`, `Feldbeschreibungen`, and `Zahlungsregeln`. The last two are explanatory/source context. **Do not** derive the participant master list from hourly consumption rows. `Zahlungsregeln` explicitly identifies `MK7 Teilnehmer` as the single participant master list.

`MK7 Teilnehmer` has **17 data rows**: **3 Reststrom roles**, **3 generation roles** (e.g. Solar/Wind), **11 `Haushaltsverbrauch` roles**, of which **10 are marked `Ja`** and **one `nein`**. There are **3 buildings**. The 10 participating household records represent **9 unique participating MaLo IDs**, because one MaLo is duplicated across buildings. Do not count 10 distinct eligible MaLos.

Map source header names **EXACTLY**, including spaces/casing:

| Excel header | Normalized field | Rule |
| --- | --- | --- |
| `gebaeude_id` | `buildingId` | Required string; identifies MK7 construct |
| `mk7_rolle` | `role` | Preserve exact raw values; known roles: `Marktlokation Reststrom`, `Haushaltsverbrauch`, `Solaranlage`, `Windkraftanlage` |
| `Teilnahme MK7` | `participationRaw` / `participates` | Case-insensitive trimmed `Ja`/`nein`; retain source string |
| `messlokation_id_MeLo` | `meloId` | **String**: never round, cast to number or truncate |
| `marktlokation_id_bezug_MaLo` | `maloId` | **String**, even if Excel cell is numeric |
| `marktlokation_id_einspeisung_MaLo` | `generationFeedInMaloId` | Distinguish from consumption MaLo; optional |
| `mk7_versorgungsbeginn_utc` | `supplyStartUtc` | Excel serial -> correctly normalized ISO date/UTC; *candidate* dormant date only |
| `vertragsbeginn_utc`, `vertragsende_utc` | `contractFromUtc`, `contractToUtc` | Optional dates; do not conflate contract dates with dormancy |
| `stadt`, `mk7_betreiber`, `strassenadresse` | display metadata | Keep from source when available |
| `inaktive_marktlokationseigenschaften`, `zaehlpunktkopf_status`, `abrechnungssperre`, `korrekturvorschlag` | `unverifiedSourceAttributes` | Often blank; **blank != valid or completed SAP action** |

The sample Excel date serial **46296** corresponds to **2026-10-01**. Respect explicit UTC semantics: do not let local timezone conversion unexpectedly move dates. Use a *date-only* representation (`YYYY-MM-DD`) for simulated **Stichtag** and documented half-open intervals; use UTC timestamps with timezone information for audit events. Treat `mk7_versorgungsbeginn_utc = 2026-10-01` as a clearly labeled **demo default**, NOT a confirmed legal/business dormant transition date.

### Confirmed building -> Reststrom targets

Find the row in the **same building** where `mk7_rolle` = `Marktlokation Reststrom`, then read `marktlokation_id_bezug_MaLo`. The expected fixture assertions are:

| Building | Reststrom-MaLo |
| --- | --- |
| `B-FRA-01` | `51781215544` |
| `B-CGN-01` | `51781215999` |
| `B-MUL-01` | `50539603639` |

Do not hardcode this mapping in runtime processing: derive it from imported source rows. Hardcoded values are permitted **only** in tests/expected fixture checks.

### Mandatory special cases

- `B-MUL-01` has **4 household records**: **3 participating**, **1 excluded**.
- MaLo **`50539603604`** is `Teilnahme MK7 = nein`; it MUST be `SKIPPED`, remain `ACTIVE`, and must not gain a dormant relationship merely by sharing a building.
- MaLo **`50539603888`** appears in **both `B-FRA-01` and `B-CGN-01`**, with different MeLos/Reststrom targets. This is an **ambiguous cross-building identity**, and MUST be **`REVIEW` / `BLOCKED`**. Never choose a target arbitrarily, silently deduplicate, or treat `{buildingId,maloId}` as proof of two separate global MaLo identities.
- Generation locations and the three **Reststrom** rows are never processed as participating *household Ruhendstellung* targets.
- For the generation/Einspeise special case, the PDF specifies a distinct **MeMa-only** relationship path; never apply household MaMa rules to generation objects.
- Hourly consumption (`Stündlicher Verbrauch`) is **not needed for dormant status changes**. Optional cross-check only; do not build an electricity allocation or billing engine.

### Import acceptance rules

- Source file never rewritten.
- Idempotent import: re-running does not create duplicate reference records.
- Normalize once using reproducible script (`npm run import:data` or equivalent), with conversion/validation tests.
- Save original row number/source identity for diagnostics, and an import summary with total counts.
- Reject blank/malformed required identifiers; do not silently manufacture IDs.
- Keep any duplicate business IDs visible in validation (do not suppress them on import).
- Prefer seed data generated into CAP-friendly CSV or imported using CAP APIs and persisted to SQLite.
- A **Reset Demo** operation restores initial ACTIVE statuses and known workbook-derived base data; does not rewrite or delete the reference Excel file.

## 4. Business meaning and PDF-faithful relationships

Terminology used consistently in UI, docs, entities, and tests:

- **MaLo** = Marktlokation.
- **MeLo** = Messlokation.
- **Reststrom-MaLo** = market location associated with remaining grid supply in the MK7/vSZ construct.
- **MeMa** = Messlokation–Marktlokation relationship.
- **MaMa** = Marktlokation–Marktlokation relationship.
- **Zeitscheibe** = validity interval of a relationship or state.
- **Ruhendstellung** = lifecycle operation intended to establish a dormant MaLo state.
- **Wiederaktivierung** = reactivation operation.
- **Herauslösung** = removal from the construct with relevant relationships ended/changed; may also involve reactivation, but must not be conflated with it.
- **Korrektur** = historical/assignment/date correction with audit.
- **Rücknahme** = reversal/compensation of an identified previous operation, not a simple delete of history.

### Explicit procedure reference, not conjecture

Document `Prozessschritte(1).pdf` (14.07.2026, draft):

- **pp. 2–9**: upstream vSZ construction — metering concept, device/installation, Reststrom-MaLo, load profile, ZP status, settlement, BIKO/MSB services. **Represent as prerequisite checks or assumptions**; do not implement them for this MVP.
- **pp. 11–12, §6.1**: from the **Reststrom-MaLo's Anlage**, maintain **MeMa** with **all relevant participating Bezugs-MeLos** via `Beziehungen -> ZP-Beziehungen -> Ändern`.
- **pp. 13–14, §6.2**: for **each participating Bezugs-MaLo**, maintain **MaMa** via `Zählpunkt ändern -> Zusätzliche Attribute`: enter the **Reststrom-MaLo with the relevant Zeitscheibe**.
- **p. 15, §6.3**: for **Einspeise-MaLo**, only **MeMa**, **not MaMa**; relationships follow completion of the relevant MCM process. Outside the household workflow but model the exception correctly.
- **p. 10, §5**: an Excel relationship/formula list is handed to billing. That document deliverable is **NOT the same** as our processing log and is outside scope.
- **p. 7, §4.5**: `ZP-Status auf IBN-Datum datieren` during setup **DOES NOT prove** that it is the SAP dormant-status change operation.
- **p. 9, §4.7**: the document reports `/EKN/ESERVICE_UPD` did not work in that context; do not assume it is a dependable API.

### Two distinct relationship structures

1. **Expected MeMa:** for each building, `Reststrom-MaLo -> set of all participating household Bezugs-MeLo IDs` (not nonparticipants). Source workbook can define **expected** set but not prove **observed SAP** set.
2. **Expected MaMa:** for each participating household MaLo, `source MaLo -> same-building Reststrom-MaLo`, effective within an approved time slice. Source workbook can define expectation, not proof of actually maintained SAP state.

Store **expected** and **mock-observed** relationships separately. The reconciliation compares them. Missing/extra/conflicting relationships produce meaningful differences; auto-fixing mock relationships must be an **explicit simulation action** (if implemented), never hidden in a validation step.

### Three separate status domains

- **Business state**: `ACTIVE`, `RUHEND` (simulated location state).
- **Request state**: `NEW`, `VALIDATING`, `READY`, `PROCESSING`, `SUCCESS`, `SKIPPED`, `BLOCKED`, `REVIEW`, `ERROR` (implementation may simplify without losing meaning).
- **Check confidence**: `VERIFIED_SIMULATED`, `ASSUMED_DEMO`, `UNKNOWN`, `FAILED`, future `SAP_VERIFIED`. **Never** display `SAP_VERIFIED` in local mode.

A `SUCCESS` processing result in demo means a **simulated** update was executed and verified in SQLite; it is **not SAP confirmation**.

## 5. CAP domain and persistence architecture

Use one CAP project (modular monolith) with CDS entities. Keep business logic outside frontend components and CAP event handler glue.

Minimum conceptual persistence entities (adjust names or split only if justified):

| Entity | Essential purpose |
| --- | --- |
| `Buildings` | `buildingId`, display metadata, link/derived Reststrom target |
| `MarketLocations` | global `maloId`, role, origin, participation; detect cross-building conflicts instead of collapsing source rows |
| `ParticipantSourceRows` | immutable-ish normalized workbook rows with original row index and building/MeLo/MaLo mapping; avoids the ambiguous-ID trap |
| `MeteringLocations` | `meloId`, source metadata; do not use it to prove SAP relationship |
| `Relationships` | kind `MEMA`/`MAMA`, expected/observed source, from/to IDs, `validFrom`, `validToExclusive`, provenance |
| `LifecyclePeriods` | business `ACTIVE`/`RUHEND` period with `validFrom`, `validToExclusive` and stable MaLo identity |
| `ProcessRequests` | `requestId`, operation, MaLo, building context, Stichtag, mode, status, idempotency key, reference operation, actor, created timestamp |
| `PrerequisiteChecks` | per-request check name/result/confidence/notes, explicit demo assumptions |
| `AuditEvents` | append-only before/after, operation, actor, effective date, UTC event time, reason, correlation/request ID |
| `ImportRuns` (small) | source file identity/checksum, counts, results/error messages |

If a smaller schema accelerates the first working slice, begin with `ParticipantSourceRows`, `MarketLocations`/`LifecyclePeriods`, `ProcessRequests`, `AuditEvents` and add other entities incrementally. Never sacrifice a correct global-ID conflict check to reduce table count.

### Time-slice rules

- Model effective intervals as **half-open** `[validFrom, validToExclusive)`, open-ended period allowed. Document the convention.
- A given MaLo cannot have overlapping contradictory business-state periods. A MaMa relationship cannot simultaneously point to two conflicting targets for the same effective date.
- Reject invalid range (`end <= start`) and conflicting overlapping ranges.
- Repeated same operation with same target/date should be `ALREADY_DONE`/no-op, not another duplicate event or overlap.
- Handle future-dated updates consistently: either schedule as a future effective period **in the demo model** or clearly explain the treatment; do not imply real SAP execution today for a future date.
- `Rücknahme` references a prior operation; append an audit event and apply a validated compensating state change. Do not delete audit history.
- `Korrektur` preserves original event/previous values and reason; reject date/target changes that invalidate interval constraints.
- Implement **Herauslösung** as a distinct operation that closes relevant construct MaMa/MeMa participation as of the effective date; reactivate if its explicitly defined workflow requires it. Unknown real market rules remain flagged as assumptions.

### API and service actions

Define CDS service exposing read-only lists and **CAP custom actions**, then implement each with TypeScript handlers calling common domain services:

- `previewTransition` — read/validate/reconcile/return proposed changes **without mutations**.
- `setDormant` — confirmed simulated Ruhendstellung.
- `reactivate` — confirmed simulated Wiederaktivierung.
- `removeFromConstruct` — simulated Herauslösung.
- `correctTransition` — correction of referenced transition with mandatory reason.
- `reverseTransition` — reversal of referenced transition with mandatory reason.
- `reconcileRelationships` — compare expected vs mock-observed relationships and return diff.
- `executeBatch` — process submitted eligible requests through same engine, independently and repeat-safely.
- `resetDemo` — explicitly confirmed restore of reproducible seeded simulation baseline (**demo-only** endpoint).

Implement the equivalent real, version-appropriate CAP syntax; do not assume method signatures without compiling against installed dependencies. Use proper input validation with typed schemas when helpful. Avoid silent action side effects in read/list endpoints.

### Execution adapters and safety

Use an interface like `MaloGateway`/`TransitionAdapter` with:

- `SqliteSimulationAdapter`: the only operational MVP implementation.
- `SapIsuAdapter`: **explicit `NOT_CONFIGURED` / throws descriptive error**; must not connect to SAP unless user supplies confirmed interfaces and authorizes it.

The service layer should not contain dummy-only hardcoded success branches. Even demo assumptions must be explicit persisted check outcomes, surfaced in UI and audit. When switching to real SAP someday, integration must be designed with authorization, locking, transaction boundaries, read-back verification, and market process compatibility before writes can be enabled.

## 6. Validation and workflow engine

All entry points call one reusable backend pipeline:

1. Parse the request (`maloId`, optional `buildingId`, `operation`, `effectiveDate`, optional `reason`/`referenceOperationId`).
2. Resolve source identity; if MaLo maps to >1 incompatible building/MeLo/target, return **`REVIEW`** before any mutation.
3. Check role and `Teilnahme MK7`; a nonparticipating household is **`SKIPPED`**, generation/Reststrom are not regular dormant household targets.
4. Resolve exactly one same-building Reststrom-MaLo; block missing/ambiguous target.
5. Check mock/real prerequisite status and supplier/market status. Unknown required data **blocks under strict policy**. For demo executions only, allow an *explicit per-run* `ASSUMED_DEMO` fixture with visible disclosure; never automatically grant it.
6. Reconcile MeMa/ MaMa *expected* vs *mock-observed*, including time slices. Block unapproved missing/conflicting relationships; preview describes concrete differences.
7. Check lifecycle state, allowed operation, time slices, conflicts and idempotency.
8. Build an immutable **preview change plan** showing inputs, check provenance, before/after state, relationship changes, potential block reasons.
9. Only after explicit confirmation (manual) or authorized simulation batch request (automatic), apply within a CAP-managed transaction.
10. Verify persisted resulting periods/relationships, append audit event and processing result; never report success if verification failed.

Preview and Execute MUST call the **same business validations**. Keep preview pure / no writes. Use a stable `requestId` or idempotency key to guard repeated execute calls and concurrent requests. For batches, isolate each MaLo's failure: one malformed or conflicting request must not roll back valid independent requests; preserve a batch-level summary.

### Error semantics

- `SUCCESS`: simulated transition committed and read-back verified.
- `SKIPPED`: nonparticipant/non-target role; no mutation.
- `ALREADY_DONE`: operation and target/date already correctly represented; no duplicated change.
- `BLOCKED`: known unmet prerequisite/market condition or invalid transition.
- `REVIEW`: ambiguous identity or conflict requiring human resolution.
- `ERROR`: unexpected runtime/storage/validation fault; technical details available in log, no false success.
- `UNKNOWN`: a **check confidence/result**, not evidence of approval.

Use descriptive English user-facing messages (`MaLo is assigned to multiple buildings`, `No residual-supply MaLo exists`, `Time slices overlap`, `Market status is not verified`, etc.). Log machine-readable codes as well as text.

## 7. GUI specification — SAP-inspired, functional, English

Use `@ui5/webcomponents-react` design patterns, a Fiori-inspired light theme, accessible controls, responsive desktop-first layout, and restrained blue/gray/green/status colors. Avoid fake SAP logo/official product endorsements; call it **MK7 Control Center — Simulation**. Use English UI text consistently while preserving canonical German business terms and exact source values where translation would alter source fidelity.

### Language policy

- All project-authored documentation, UI labels, runtime messages, tests, comments, and future repository content MUST be in English.
- Translate existing project-authored German text to English whenever it is encountered.
- Do not translate or modify immutable source artifacts, exact workbook sheet/header/cell values, IDs, filenames, quoted procedure labels, or canonical German domain terms when exact fidelity is required.
- The global safety warning is `SIMULATION — NO SAP CONNECTION`.

### Required navigation

1. **Overview** — true database-driven cards: 3 constructs, 11 household records, 10 eligible rows, 1 globally conflicting MaLo, active/dormant counts; recent runs and obvious `Demo` flag.
2. **MaLo Explorer** — searchable/filterable table by ID, building, role, participation, business state; select row to view MeLo, Reststrom target, dates, ambiguous-source warning, expected and observed relationships.
3. **Process Workbench** — choose building/MaLo + operation + effective date (+ reason/ref ID for correction/reversal); preview checks; show before/after; enable execute only after valid checks and explicit confirmation. Button labels: `Check`, `Execute`, `Reactivate`, `Correct`, `Reverse` when relevant.
4. **Automation** — building selector and `Start batch` for eligible household requests; shared engine, per-MaLo status, progress/results, no overclaim of unattended scheduling. Batch is automatically processed **after button click**, not a 24/7 background job.
5. **History & Log** — request list, outcome, actor (`DEMO_USER`/`DEMO_BATCH`), effective date, actual UTC event timestamp, clear `simulated` provenance, per-step check details, before/after changes, error classification.
6. **Test Center** — execute *real domain scenario assertions* against isolated fixtures, report real PASS/FAIL and error details, not preset green badges. Show testcase ID and expectation; isolated test runs must not modify presentation state.

Five to six pages is fine, but **the main Workbench and Explorer must work first**. Build a real, usable UI rather than placeholders. Avoid massive modal workflows when a clear side panel is sufficient. Include loading, empty, success and error states; keyboard and accessibility basics.

### Mandatory UX integrity

- All counters computed from the actual current import + simulated status, not hardcoded.
- Never display `SAP_VERIFIED` in local simulation.
- Explicit status chips for `ASSUMED_DEMO`, `UNKNOWN`, `BLOCKED`, `REVIEW`, `SIMULATED_SUCCESS`.
- `Check` does not mutate; `Execute` does only when valid.
- Disable or explain unavailable actions (e.g. real SAP updates) rather than fake execution.
- `Reset demo` requires confirmation; reset shows actual completed action.
- Refresh retains changes because SQLite is authoritative.
- All operation outcomes render from actual backend results.
- Unknown supplier/prerequisite states are visible; demo can use a **user-chosen assumption profile** with unmistakable warning, never a secret bypass.

## 8. Testing contract — code MUST back the UI

Write deterministic **Vitest** tests against pure domain logic and CAP service paths. Do not change production code merely to make a brittle expected assertion pass. Use isolated test DB/transactions/fixtures with a reset mechanism. No writes to the original workbook.

### Required acceptance tests

| ID | Input / operation | Expected |
| --- | --- | --- |
| TC01 | `B-MUL-01`, MaLo `50539603921`, eligible, explicit demo prerequisites accepted, matching observed relationships, `setDormant` | `SUCCESS`, business state RUHEND, correct target `50539603639`, history/event persisted |
| TC02 | `B-MUL-01`, MaLo `50539603604`, `setDormant` | `SKIPPED`, remains ACTIVE, no relationship mutation |
| TC03 | MaLo `50539603888` assigned to Frankfurt and Köln | `REVIEW`/`BLOCKED`, **no** mutation |
| TC04 | Unknown MaLo | Rejected safely, error/result visible |
| TC05 | Missing Reststrom target in isolated negative fixture | `BLOCKED`, no mutation |
| TC06 | Missing mock-observed MeMa | Difference shown; under strict policy blocks unless reconciled explicitly |
| TC07 | Conflicting MaMa target | `BLOCKED`, detailed diff |
| TC08 | Overlapping validity period | `BLOCKED`, unchanged periods |
| TC09 | Re-run identical completed Ruhendstellung | `ALREADY_DONE`, no duplicate audit transition |
| TC10 | Supplier/market prerequisite UNKNOWN or blocked | Strict execution blocked; explicit demo assumption shows `ASSUMED_DEMO` provenance |
| TC11 | vSZ prerequisite not ready | `BLOCKED` |
| TC12 | `reactivate` a dormant MaLo later | `SUCCESS`, new ACTIVE period, prior RUHEND period preserved |
| TC13 | `removeFromConstruct` | Relevant mock relationships closed as of date, audited; active state handled per explicitly documented demo rule |
| TC14 | `correctTransition` with valid reference/reason | Corrected non-overlapping period, original operation retained in audit |
| TC15 | `reverseTransition` with valid reference/reason | Valid compensation, audit contains reference, no history deletion |
| TC16 | Repeat same batch | No duplicate transitions or audit events |
| TC17 | Batch includes both valid and blocked requests | Valid ones finish, blocked logged, summary counts correct |
| TC18 | Forced adapter failure or failed verification in isolated fixture | No false success; safe transactional recovery/error record |
| TC19 | Preview of valid request | No writes to state, relationships, or audit history |
| TC20 | Manual and batch invoke same valid operation on equivalent isolated starting states | Equivalent business outcome |
| TC21 | Import workbook | 17 rows total; 3 Reststrom, 3 generation, 11 households, 10 `Ja`; 3 buildings; dates normalized |
| TC22 | Reload persisted state after process/API restart | User-visible results remain in SQLite |

Run tests **for real**; show meaningful names and failures. Testcenter must execute a **real scenario-runner** that calls shared domain logic on isolated fixture state and checks expected/actual values; do not falsely say it is showing the Vitest CLI result if it isn't. CLI suite remains authoritative for developer verification.

### Required live demo path

1. Open Overview: real input counts and prominent `SIMULATION` badge.
2. Open MaLo Explorer; show building `B-MUL-01` and participation `Ja`/`nein`.
3. Workbench: MaLo `50539603921` → `Check` → visibly label demo prerequisites/market assumptions → confirm → `Execute` → RUHEND in SQLite → refresh to prove persistence.
4. Select `50539603888`: demonstrate identity conflict and **no update**.
5. Reactivate the first MaLo on a later valid date; show ACTIVE and complete history; optionally correct/reverse a separate safe fixture.
6. Reset; run `B-MUL-01` batch → **expected 3 successes, 1 skipped**, assuming the explicit mock checks/relationships pass. Do not process ambiguous `50539603888` in a silent happy-path batch.
7. Open Protokoll and Testcenter: display real backend logs and executed testcase results.

## 9. Recommended project layout

Prefer this straightforward layout, adapting only when actual CAP tooling generates a better structure:

```text
mk7-control-center/
├── AGENTS.md
├── README.md
├── package.json                   # root scripts for backend/frontend/tests
├── .gitignore
├── data/
│   └── source/
│       └── Datensatz_Deutsch.xlsx # user-supplied, immutable
├── docs/
│   ├── ASSUMPTIONS.md             # business gaps and deliberate demo assumptions
│   ├── DATA_MAPPING.md            # exact workbook field mappings
│   ├── DEMO.md                    # presenter click-through script
│   └── reference/
│       └── Prozessschritte(1).pdf # source if supplied
├── db/
│   ├── schema.cds
│   └── data/                      # generated CAP seed CSV if used
├── srv/
│   ├── malo-service.cds
│   ├── malo-service.ts
│   ├── domain/
│   │   ├── types.ts
│   │   ├── validation.ts
│   │   ├── reconciliation.ts
│   │   ├── lifecycle.ts
│   │   └── processing.ts
│   ├── adapters/
│   │   ├── simulation.ts
│   │   └── sap-isu-not-configured.ts
│   └── tests/
├── scripts/
│   ├── import-workbook.ts
│   └── reset-demo.ts
└── app/
    ├── package.json
    ├── index.html
    ├── vite.config.ts
    └── src/
        ├── App.tsx
        ├── api/
        ├── components/
        ├── pages/
        │   ├── Overview.tsx
        │   ├── MaloExplorer.tsx
        │   ├── Workbench.tsx
        │   ├── Automation.tsx
        │   ├── History.tsx
        │   └── TestCenter.tsx
        └── styles/
```

Avoid circular dependencies and frontend duplication of backend business checks. A typed API client should call CAP; do not circumvent domain services by writing SQLite from React.

## 10. Implementation order — agent-executable vertical slices

Execute in this order. Each stage must pass its gate before moving on. Implement autonomously where information is known, and report blockers clearly without excessive questions.

### Phase A — Bootstrap a runnable skeleton

- Check Node.js/npm and current repo. Use compatible stable CAP Node.js/TypeScript/SQLite and Vite/React/UI5 dependencies.
- Scaffold CDS schema, CAP service and a working UI shell.
- Add `npm run dev` instructions so both API/UI work locally without a cloud account.
- Show `SIMULATION — NO SAP CONNECTION` globally.
- **Gate:** both servers start, browser shows shell, CAP health/read route responds, no fatal console errors.

### Phase B — Import workbook and show truthful data

- Discover/read `Datensatz_Deutsch.xlsx`, map exact columns and Excel serial dates, seed SQLite.
- Persist source row identity and conflicts.
- Build Overview and MaLo Explorer with real APIs.
- **Gate:** counts match 17 total/3 Reststrom/3 generators/11 households/10 participants/3 buildings; target IDs correct; duplicate MaLo visible.

### Phase C — First complete Ruhendstellung

- Implement `previewTransition` and `setDormant` via shared service/engine and SQLite simulation adapter.
- Provide explicit demo assumption selection for missing SAP/market checks, and simulate observed relationships separately from expected.
- Workbench executes `B-MUL-01 / 50539603921`; state and audit persist on reload.
- **Gate:** TC01, TC02, TC03, TC09 and TC19 pass. Refuse to show fake SAP-verified status.

### Phase D — Relationship reconciliation and prerequisites

- Derive exact MeMa set from participating household MeLos for each Reststrom construct.
- Derive time-dependent MaMa expectations for each participating household MaLo.
- Store distinct mock-observed assignments; compare and classify missing/extra/conflicting.
- Show detailed prereq/market check provenance and blockers.
- **Gate:** missing/conflicting relationships and UNKNOWN SAP data do not silently pass. TC05–TC11 pass.

### Phase E — Lifecycle features

- Implement state periods, Wiederaktivierung, Herauslösung, Korrektur, Rücknahme.
- Require reason/reference for correction and reversal; maintain append-only history.
- **Gate:** TC12–TC15 and time-slice tests pass; GUI reflects actual persistence.

### Phase F — Batch pipeline, results and tests

- Implement `executeBatch` through same service; each MaLo processed independently and repeat-safely.
- Build Automatisierung, Historie & Protokoll, Testcenter, Reset Demo.
- **Gate:** B-MUL-01 expected 3 success / 1 skip after explicit demo preconditions, repeat run safe; TC16–TC22 pass. Build/typecheck/unit tests pass.

### Phase G — Polish and handoff

- Ensure all required actions are functional and use backend data.
- Improve responsive Fiori-style layout and error readability.
- Document exact npm scripts, known SAP integration gaps, source workbook location, and demo sequence.
- Run final build, lint/typecheck, test suite, and a smoke test in the browser if available.
- **Gate:** presentable working application; no fake hardcoded passing tests; real SAP integration openly marked unavailable.

## 11. OpenCode working protocol

For each session/phase:

1. **Inspect existing code and artifacts before generating.** Do not wipe working implementations or overwrite user work.
2. State the next small milestone, then **implement it**. Do not stop after writing a plan unless blocked.
3. Make small logical code changes; run relevant build/typecheck/tests immediately.
4. Fix errors using actual diagnostics. Never report a tool command as successful unless it succeeded.
5. Keep the app continuously runnable. Do not create TODO-only views and claim the feature works.
6. Update `README.md` and `docs/ASSUMPTIONS.md` when behavior or unverified business semantics change.
7. End each milestone with a concise status: **implemented, verified commands/results, remaining gaps, next action**.
8. If blocked by a required binary or missing source file, do as much independent code work as safely possible, report the exact blocker and the one concrete user action required.
9. Favor simple, typed, well-named functions and deterministic fixtures. Avoid speculative abstraction until a second consumer exists.
10. Do not introduce production API keys, store secrets in Git, call external systems with data, or deploy to a company system. Never connect to SAP without explicit configuration and permission.

### Engineering quality rules

- TypeScript `strict` where possible; avoid `any`, hidden `as` casts and magic status strings; use typed enums/unions and data validation.
- Clear separation: CAP handler (transport) → domain service → adapter/persistence; UI only renders and sends requests.
- All database mutations through CAP-managed transactions; preview always read-only.
- Stable MaLo IDs are strings, building IDs are strings, effective dates are date-only; audit uses UTC timestamps.
- Protect against duplicate request execution, overlapping periods and target mismatches.
- Favor explicit error codes; no silent catches; do not swallow failed database writes.
- Keep persistent SQLite file out of Git unless intentionally a small sanitized demo fixture; keep generated artifacts and dependencies ignored.
- No accidental `cds deploy --to ...` to BTP/HANA or real database by default.
- If implementing integration stubs, they fail closed (`NOT_CONFIGURED`).
- Keep data lineage: expected relationship from workbook, mock observed from fixtures, unknown SAP state — these are **different**.

## 12. Developer commands and readiness checklist

Provide actual working scripts in `package.json` (the following are **desired command names**, not a claim they already exist):

```bash
npm install                # install repo dependencies
npm run import:data        # import unchanged source workbook to seed/reference data
npm run dev                # run CAP backend + React frontend in local development
npm run typecheck          # TypeScript check for backend and frontend
npm test                   # run real Vitest tests
npm run build              # compile production-like local artifacts
npm run reset:demo         # restore SQLite demo state to imported baseline
```

Set up proxy/CORS correctly between Vite and CAP; document generated ports rather than asserting fixed ones before starting services. Make reset operations environment-scoped and requiring explicit confirmation from the UI.

**Stop condition / definition of done:**

- [ ] CAP OData API genuinely persists to SQLite.
- [ ] Workbook imported with exact, tested IDs/dates/counts.
- [ ] Fiori-style UI screens work and have real CAP-backed data.
- [ ] Manual preview/execute works, no change on preview, state persists after refresh.
- [ ] Real expected vs mock-observed MeMa/MaMa reconciliation and detailed results exist.
- [ ] Unknown prerequisites/market states handled honestly; explicit demo assumptions visible.
- [ ] Ruhendstellung, Wiederaktivierung, Herauslösung, Korrektur, Rücknahme produce valid simulated state/history.
- [ ] Batch uses same engine; conflict and nonparticipation cases handled correctly.
- [ ] Audit log append-only and duplicate/partial failure handling tested.
- [ ] Testcenter shows actually executed scenario results; CLI tests pass.
- [ ] Reset demo is functional; README and presenter walkthrough are complete.
- [ ] No real SAP mutations, connections or false integration claims.

## 13. First instruction to execute after reading this file

**Do not just summarize this file. Build the project.** Start with **Phase A**, then **Phase B**, then the working **Phase C vertical slice**, verify each gate, and continue through the remaining phases as far as actual tests allow. If the source workbook is not yet present in the local repository, create the project/importer/seed contract and ask for its precise path; never fake its complete records. Keep a running project with honest, test-backed results at every stage.
