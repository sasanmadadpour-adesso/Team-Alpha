# Project Progress

## Phase A — Bootstrap

Status: **VERIFIED** on 2026-10-15.

### Implemented

- CAP backend with a CDS model and OData V4 service
- persistent local SQLite configuration
- modular domain, CAP service, and adapter structure
- React/Vite shell using UI5 Web Components
- Vite proxy to the CAP backend
- global `SIMULATION — NO SAP CONNECTION` warning
- Vitest, TypeScript, and build scripts

### Executed verification

| Command/check | Result |
| --- | --- |
| `npm install` | PASS — 184 packages installed; npm reported 7 transitive audit findings and no breaking automatic fix was applied |
| `npm run deploy:local` | PASS — created `db.sqlite` and initialized `SystemStatuses` |
| `npm test` | PASS — 1 test file and 1 test passed at the Phase A gate |
| `npm run typecheck` | PASS — backend and frontend TypeScript passed |
| `npm run build` | PASS — CAP and Vite builds passed; Vite only reported a UI5 chunk-size warning |
| `npm run dev` | PASS — CAP started on port 4004 and Vite on port 5173 |
| CAP OData `SystemStatuses` | PASS — read the persisted SQLite record |
| CAP `health()` function | PASS — `OK`, `SIMULATION`, `NOT_CONFIGURED` |
| Vite proxy | PASS — returned the OData response through the frontend port |

## Phase B — Workbook and Core Data Model

Status: **VERIFIED** on 2026-10-15.

### Implemented

- CDS entities for buildings, MaLo, MeLo, source rows, relationships, lifecycle periods, requests, checks, audit events, and import runs
- idempotent import from `data/source/Datensatz_Deutsch.xlsx`, sheet `MK7 Teilnehmer`
- string-safe MaLo/MeLo IDs and UTC-stable Excel date conversion
- dynamically derived residual-supply MaLo for each building
- visible conflict marker for MaLo `50539603888`
- read-only OData APIs and a minimal CAP-backed data table
- source mapping in `docs/DATA_MAPPING.md`

### Executed verification

| Command/check | Result |
| --- | --- |
| `npm run import:data` twice | PASS — 17 source rows, 3 buildings, 16 global MaLos, one conflict, no duplicate imports |
| `npm test` | PASS — 2 test files and 6 tests |
| `npm run typecheck` | PASS — backend, importer, and frontend |
| `npm run build` | PASS — CAP and Vite; only the known UI5 chunk warning |
| OData source-row count | PASS — 17 |
| OData buildings | PASS — 3 buildings with dynamically derived residual-supply targets |
| OData conflict filter | PASS — only `50539603888`, with distinct building, MeLo, and target assignments |
| OData B-MUL households | PASS — 4 records, 3 participating, `50539603604` not participating |

### Phase B acceptance gate

- [x] 17 source rows
- [x] 3 residual-supply, 3 generation, and 11 household rows
- [x] 10 participating household rows
- [x] 3 buildings
- [x] IDs stored as strings and serial `46296` converted to `2026-10-01`
- [x] residual-supply targets derived from workbook data
- [x] ambiguous MaLo assignments remain unresolved and visible
- [x] actual SQLite contents and API responses verified

### Remaining after Phase B

- preview/execution and relationship reconciliation in Phases C/D
- lifecycle mutations and audit events

## Phase C — Simulated Ruhendstellung

Status: **VERIFIED** on 2026-10-15.

### Implemented

- shared, read-only transition validation engine used by preview and execution
- CAP actions `previewTransition` and `setDormant`
- strict `UNKNOWN` prerequisite handling and explicit `ASSUMED_DEMO` profile
- validation for identity conflicts, participation, building assignment,
  residual-supply target, effective date, lifecycle state, and idempotency
- transactional ACTIVE → RUHEND persistence with read-back verification
- append-only audit event, process request, prerequisite checks, and lifecycle period
- functional Workbench with selection, date, preview, explicit confirmation,
  execution, and detailed results

### Executed verification

| Command/check | Result |
| --- | --- |
| `npm test` | PASS — 3 test files, 12 tests |
| `npm run typecheck` | PASS |
| `npm run build` | PASS — only the known UI5 bundle-size warning |
| strict preview for `50539603921` | PASS — `BLOCKED / PREREQUISITES_UNKNOWN` and no mutation |
| `ASSUMED_DEMO` preview | PASS — `READY`, ACTIVE → RUHEND, target `50539603639` |
| confirmed `setDormant` | PASS — `SIMULATED_SUCCESS`, persisted and verified |
| repeated identical `setDormant` | PASS — `ALREADY_DONE`, no duplicate transition |
| nonparticipant `50539603604` | PASS — `SKIPPED`, no mutation |
| ambiguous `50539603888` | PASS — `REVIEW`, no mutation |
| persisted API read-back | PASS — MaLo state `RUHEND`, one audit event, half-open ACTIVE/RUHEND periods |

### Phase C acceptance gate

- [x] preview is read-only
- [x] execution requires explicit confirmation
- [x] unknown evidence blocks by default
- [x] demo assumptions are explicit and visible
- [x] successful state persists in SQLite and survives browser refresh
- [x] append-only audit event records simulated provenance
- [x] no response claims a real SAP update

### Remaining after Phase C

- expected-versus-observed MeMa/MaMa reconciliation and prerequisite fixtures
- remaining lifecycle operations and batch execution

## Phase D — Validation and Relationship Reconciliation

Status: **VERIFIED** on 2026-10-15.

### Implemented

- expected MeMa derivation from each Reststrom-MaLo to participating Bezugs-MeLos in the same building
- expected MaMa derivation from each participating household MaLo to its same-building Reststrom-MaLo
- separate `EXPECTED` and `MOCK_OBSERVED` relationship records with explicit provenance
- generation/Einspeise handling as MeMa-only, without household MaMa creation
- machine-readable `MATCH`, `MISSING`, `EXTRA`, and `CONFLICT` reconciliation results
- half-open Zeitscheibe validation, invalid-range rejection, and conflicting overlapping MaMa detection
- mandatory Reststrom target, lifecycle interval, lifecycle state, vSZ readiness, master-data, and supplier/market checks
- strict blocking for `UNKNOWN` mandatory checks and visible `ASSUMED_DEMO` provenance
- one shared validation engine for preview and execution, with revalidation immediately before writes
- CAP `reconcileRelationships` action and Workbench validation/reconciliation checklist
- isolated negative tests for missing and extra relationships, conflicting targets, invalid intervals, overlaps, and blocked prerequisites

### Derived baseline

| Relationship set | Count |
| --- | ---: |
| Expected MeMa | 13 |
| Expected MaMa | 10 |
| Mock-observed MeMa | 13 |
| Mock-observed MaMa | 10 |
| Generation MaMa | 0 |

The mock-observed records are local fixtures and are not SAP observations.

### Executed verification

| Command/check | Result |
| --- | --- |
| `npm test` | PASS — 4 test files, 19 tests |
| `npm run typecheck` | PASS |
| `npm run import:data` | PASS — 17 workbook rows imported |
| `npm run build` | PASS — only the known UI5 bundle-size warning |
| relationship count query | PASS — expected and mock-observed sets remain separate; no generation MaMa |
| live `ASSUMED_DEMO` preview | PASS — 10 checks, matching MeMa/MaMa, no blocking difference |
| live confirmed `setDormant` | PASS — `SIMULATED_SUCCESS`, revalidated and persisted |
| post-verification import | PASS — presentation database restored to the ACTIVE baseline |

### Remaining after Phase D

- lifecycle operations Wiederaktivierung, Herauslösung, Korrektur, and Rücknahme
- automatic batch execution, history views, scenario Test Center, and Reset Demo

## Phase E — Complete MaLo Lifecycle

Status: **VERIFIED** on 2026-10-15.

### Implemented

- CAP actions `reactivate`, `removeFromConstruct`, `correctTransition`, and `reverseTransition`
- reusable lifecycle planning service with half-open interval and chronology validation
- Wiederaktivierung from RUHEND to ACTIVE while preserving prior ACTIVE and RUHEND periods
- distinct Herauslösung behavior that closes relevant mock-observed MeMa/MaMa without silently reactivating the MaLo
- referenced Korrektur with mandatory reason, boundary validation, and immutable original evidence
- referenced Rücknahme as an auditable compensating transition without deleting original history
- idempotency checks for every lifecycle action and duplicate reversal protection
- CAP request transactions, persisted read-back verification, before/after snapshots, and audit reference IDs
- minimal Workbench controls for all five operations, reason, and reference request ID
- lifecycle tests for success, invalid chronology, invalid sequences, overlaps, repeated operations, duplicate reversals, and history-preserving plans

### Executed verification

| Command/check | Result |
| --- | --- |
| `npm test` | PASS — 5 test files, 30 tests |
| `npm run typecheck` | PASS |
| `npm run build` | PASS — only the known UI5 bundle-size warning |
| live Ruhendstellung | PASS — ACTIVE → RUHEND |
| live Wiederaktivierung | PASS — RUHEND → ACTIVE with prior periods retained |
| live Korrektur | PASS — referenced boundary moved and audit appended |
| live Herauslösung | PASS — relationships closed; ACTIVE state remained ACTIVE |
| live Rücknahme | PASS — compensating RUHEND → ACTIVE transition retained its reference |
| repeated Rücknahme | PASS — `ALREADY_DONE`, no duplicate compensation |
| final `npm run import:data` | PASS — presentation database restored to baseline |

### Remaining after Phase E

- automatic batch execution through the shared engine
- History & Log and real scenario Test Center views
- confirmed Reset Demo endpoint and final presentation polish

## Phase F — Functional MVP Completion

Status: **VERIFIED** on 2026-10-15.

### Implemented

- `executeBatch` with the same `executeDormant` validation/write engine used by manual mode
- independent result classification per MaLo and continuation after item-level errors
- repeat-safe idempotency preventing duplicate lifecycle periods and audit events
- persistent process history with operation, state transition, effective date, mode, result code/message, actor, timestamp, batch ID, checks, and simulation provenance
- confirmed `resetDemo` action restoring ACTIVE periods, mock-observed fixtures, and empty process/audit history without modifying Excel
- backend-driven MaLo Explorer, Process Workbench, Automation, History & Logs, and Test Center views
- real in-app scenario runner using isolated fixtures and shared domain logic; no preset PASS badges
- Vitest coverage for batch summaries, duplicate classification, lifecycle behavior, reconciliation, import, and in-app scenarios

### Live acceptance results

| Scenario | Result |
| --- | --- |
| B-MUL-01 batch after reset | PASS — 3 `SUCCESS`, 1 `SKIPPED`, 0 errors |
| repeated identical batch | PASS — 4 `ALREADY_DONE`, no duplicate transitions |
| persisted request history | PASS — 3 success + 1 skipped with codes, messages, actors, timestamps, and simulated provenance |
| Reset Demo | PASS — request history emptied and baseline restored |
| source workbook mutation | None — reset operates only on SQLite |

### Final verification

| Command | Result |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm test` | PASS — 7 files, 33 tests |
| `npm run build` | PASS — known UI5 chunk-size warning only |
| isolated in-app scenario runner | PASS — covered by executed Vitest assertion |

### Remaining limitations

- Batch items are logically isolated and errors are retained per item, but SQLite/CAP executes the user-triggered batch sequentially rather than as concurrent jobs.
- Test Center is a domain scenario runner, not a wrapper around the Vitest CLI.
- The known Vite/UI5 bundle-size warning remains; visual and bundle optimization belong to Phase G.
- There is still no SAP connection; all successful outcomes are SQLite simulation results.

## Phase G — Frontend Redesign and Presentation Polish

Status: **VERIFIED** on 2026-10-15.

### Scope

A complete UI/UX redesign of the React frontend. No business rule, CDS entity,
or domain service was rewritten. The only backend change is one additional
read-only CAP action (`previewLifecycle`) so that reactivation, removal,
correction, and reversal can be validated before execution, reusing the
existing `buildLifecyclePlan` logic.

### Implemented

- token-based design system (`app/src/styles/tokens.css`, `app.css`) replacing ad-hoc styling
- reusable component layer: AppShell, Sidebar, TopBar, PageHeader, Metric, StatusBadge,
  DataTable, FilterBar, EmptyState, LoadingState, ErrorState, Callout, Drawer, Dialog,
  Toasts, ProcessStepper, ValidationChecklist, RelationshipViewer, Before/After diff,
  ResultSummary, BatchResultSummary, TestResultCard
- six redesigned pages: Übersicht, MaLo Explorer, Prozess-Workbench, Automatisierung,
  Historie & Protokoll, Testcenter
- guided five-step Workbench flow: AUSWÄHLEN → PRÜFEN → VORSCHAU → AUSFÜHREN → ERGEBNIS,
  with read-only checking and a mandatory confirmation dialog before any write
- German UI language throughout, with canonical German domain terms and unmodified source values
- permanent `SIMULATION — KEINE SAP-VERBINDUNG` markers; `SAP_VERIFIED` is never rendered;
  `ASSUMED_DEMO`, `UNKNOWN`, `BLOCKED`, and `REVIEW` remain visually distinct
- accessibility work: landmark structure, labelled controls, focus-trapped overlays,
  Escape handling, visible focus rings, reduced-motion support, responsive layout
- all displayed figures are derived from CAP/OData responses; nothing is hardcoded

### Backend change

| Change | Reason |
| --- | --- |
| `previewLifecycle` action (CDS + handler) | read-only validation for the four non-dormancy lifecycle operations; reuses `buildLifecyclePlan`, performs no writes |

### Fixes found during redesign

- `executeOperation` previously sent every parameter to every CAP action, so
  `setDormant` failed with `Property "reason" does not exist`. The client now sends
  exactly the parameters each action declares.
- `useAppData` double-loaded under React StrictMode and could render a blank page.
- Layout defects: clipped Overview building table, mobile menu button visible on desktop,
  card overflow, wrapping building cells, breadcrumb crowding on small screens.

### Executed verification

| Command/check | Result |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm test` | PASS — 7 files, 33 tests |
| `npm run build` | PASS — 329 kB bundle / 98 kB gzip, no chunk warning |
| Playwright smoke across all six pages | PASS — no console or page errors |
| UI journey: Ruhendstellung `50539603921` (B-MUL-01, ASSUMED_DEMO) | PASS — READY → confirmation → `SIMULATED_SUCCESS` |
| UI journey: browser reload after execution | PASS — Explorer still shows `RUHEND` |
| UI journey: Wiederaktivierung on 2026-11-01 | PASS — `SIMULATED_SUCCESS`, prior periods retained |
| UI journey: B-MUL-01 batch | PASS — 2 success, 1 skipped, 1 already done (one MaLo was dormant from the manual run) |
| UI journey: conflict `50539603888` | PASS — `REVIEW`, nothing changed |
| UI journey: STRICT profile | PASS — blocked with `PREREQUISITES_UNKNOWN` |
| In-app Test Center | PASS — 3 scenarios executed, 0 failed |
| Final `resetDemo` | PASS — presentation database restored to baseline |

### Known limitations after Phase G

- `cds watch` redeploys the schema when repository files change, which clears the
  simulated history. Use `cds serve` for presentations so persisted state survives.
- Batch mode supports Ruhendstellung only; the other lifecycle operations are manual.
- Test Center remains a domain scenario runner, not a Vitest CLI wrapper.
- No SAP connection exists; every success is a SQLite simulation result.
