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
