# MK7 Control Center — Simulation

Local SAP CAP prototype for the “Umstellung auf ruhende MaLo” process.

> **SIMULATION — NO SAP CONNECTION**

The application uses local CAP and SQLite. It does not execute real SAP calls or modify a real SAP system.

## Requirements

- Node.js 22 or newer
- npm 11 or newer

## Start

```bash
npm install
npm run import:data
npm run dev
```

CAP runs on `http://localhost:4004` and Vite on `http://localhost:5173` by default. Vite proxies `/odata` to CAP. The local SQLite file `db.sqlite` is stored in the project root and excluded from Git.

## Verification

```bash
npm test
npm run typecheck
npm run build
```

Direct API checks:

```bash
curl http://localhost:4004/odata/v4/malo/SystemStatuses
curl 'http://localhost:4004/odata/v4/malo/health()'
```

## Architecture

- `db/`: CDS persistence model and Phase A seed
- `srv/`: CAP transport, independent domain types, and adapter boundaries
- `app/`: React/Vite UI using UI5 Web Components
- `tests/`: Vitest tests
- `scripts/workbook.ts`: workbook normalization and conflict detection
- `scripts/import-workbook.ts`: idempotent CAP/SQLite import
- `docs/PROGRESS.md`: results from executed verification commands

## Importing source data

`npm run import:data` reads only `data/source/Datensatz_Deutsch.xlsx`, sheet `MK7 Teilnehmer`. The import deploys the local schema and transactionally replaces workbook-derived reference data. It never modifies the Excel file. MaLo and MeLo IDs remain strings.

`npm run deploy:local` is an alias for the complete local workbook import. A bare
`cds deploy` creates the schema but does not populate the workbook-derived demo
records and should not be used to prepare the presentation database.

## Simulated Ruhendstellung

The Workbench previews and executes a local ACTIVE → RUHEND transition. The
default strict profile blocks because SAP and market evidence is unavailable.
The user must explicitly select `ASSUMED_DEMO` and confirm execution. A success
means only that SQLite was updated and verified; it is not an SAP update.
