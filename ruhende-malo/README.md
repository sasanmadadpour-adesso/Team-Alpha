# Ruhend — Umstellung auf ruhende MaLo (Simulation)

For a complete presentation of the current app, including business flow, screens, architecture, Mermaid diagrams, validation rules, and API inventory, see [Application presentation](docs/APP_PRESENTATION.md).

Local SAP CAP prototype of the MVP boxes from the solution map *Marktrolle VNB*: **Anmeldung Konstrukt → Prüfung der Daten → Korrektur Daten → Konstrukt Übersicht → Umstellung auf ruhende MaLo inkl. MeMa/MaMa**, with a REST API for other services.

> **SIMULATION — NO SAP CONNECTION**

The application uses local CAP and SQLite. It does not execute real SAP calls or modify a real SAP system.

`npm run import:data` first creates the reproducible corrected baseline `data/source/new-data-source-corrected.xlsx`, then imports all seven sheets into SQLite (131,478 source records) and derives the MK7 process model from `MK7 Participants`. The supplied `new-data-source.xlsx` remains unchanged. See `docs/DATA_CORRECTIONS.md`. Large hourly tables are inserted in chunks. The read-only data service is available at `/odata/v4/data`; producer names, email addresses, and raw source JSON are excluded from its public projection.

## Requirements

- Node.js 22 or newer
- npm 11 or newer

## Start

```bash
npm install
npm run import:data
npm run dev
```

CAP runs on `http://localhost:4004` and Vite on `http://localhost:5173` by default. Vite proxies `/api` and `/odata` to CAP. The local SQLite file `db.sqlite` is stored in the project root and excluded from Git.

The development script uses `cds serve` (not `cds watch`) so simulated process
history remains persistent while presenting. `npm run dev` first runs a
project-scoped cleanup that stops stale CAP/Vite processes belonging to this
repository. It does not kill unrelated applications. The app intentionally
fails instead of silently switching the UI to another port, because the Vite
proxy targets CAP on port 4004. Both servers shut down if either exits.
Vite explicitly loads `app/vite.config.ts` so generated JavaScript cannot override
the strict-port setting:

```bash
npm run stop:local
lsof -nP -iTCP:4004 -sTCP:LISTEN
lsof -nP -iTCP:5173 -sTCP:LISTEN
# If a non-MK7 process owns a port, stop it separately or choose another setup.
npm run dev
```

`cds watch` can redeploy the schema whenever repository files change, which clears
the simulated process history, so it is not used by `npm run dev`.

## Verification

```bash
npm test          # unit tests (rules, Umstellung plan, lifecycle, import) + HTTP API tests on a temp DB copy
npm run typecheck
npm run build
npm run api:spec  # regenerate docs/openapi.json from the CDS contract
```

## How the process works

| Step (solution map) | What happens | Mode |
| --- | --- | --- |
| **Anmeldung Konstrukt** | The workbook import or `POST /registerConstruct` creates one construct per building | API / UI |
| **Prüfung der Daten** | Rules V01–V14 on Teilnehmerliste, Einspeiser, iMSys, Abmeldeanfrage and Zeitscheiben | automatic |
| **Korrektur Daten** | Findings wait for a human decision (choose construct, exclude, fix value, confirm) with a reason, then a re-check | **manual** |
| **Aufbau vSZ** (gate) | The 10 checklist items from PDF steps 1–4.7 must be confirmed with evidence | manual confirm |
| **Umstellung** | MeMa Reststrom→MeLo (§6.1), MaMa MaLo→Reststrom (§6.2), Einspeise-MeMa (§6.3, MeMa only after MCM), then RUHEND from the Stichtag, read back before SUCCESS | automatic |
| **Übergabe** | The §5 relationship list (CSV/JSON) and outbox events for UTILMD, INVOIC and EDM (`NOT_IMPLEMENTED`) | automatic |

One run processes every participant through all steps; **the pipeline never stops globally**. Clean MaLos become ruhend in the same run. A problem stops only the affected MaLo, at the step where it occurs, and appears in Korrektur. Running again is safe: completed work returns `ALREADY_DONE`.

**First run with the workbook and the simulated SAP state** (`data/fixtures/sap-simulated-state.json`, explicitly labeled demo data):

- **6 MaLos become ruhend immediately**, with MeMa and MaMa.
- Waiting for Korrektur:
  - `50539603888`: in two constructs (V05)
  - `50539603876`: Abmeldung of the current supplier pending (V11)
  - `50539603103`: Abmeldung of the current supplier pending (V11)
  - the wind MeLo with 34 characters (V02)
  - one Einspeise-MaLo shared by three generators (V14)
- `50539603604` is skipped (Teilnahme nein).
- After the status input "Abmeldung received" (`POST /updateSapState`), the building decision and a manual confirmation, **9 of 9 are ruhend**.
- The BDEW check digit (V03) fails for all workbook IDs (synthetic test data). It is shown as a notice and blocks nothing.

## User interface

A web application with a fixed topbar, German / English switch (market terms stay German), self-hosted humanist fonts (Source Sans 3, IBM Plex Mono) and calm, purposeful motion (respects *reduced motion*).

| Screen | Purpose |
| --- | --- |
| **Übersicht / Overview** | KPIs, one card per construct with the 6-stage rail (Anmeldung → Prüfung & Korrektur → Aufbau vSZ → Voraussetzungen → MeMa/MaMa → ruhend → Übergabe) with counters, a progress ring, and *Braucht Sie* (open cases). **Prozess starten** runs the automatic process; **Ablauf erklärt** documents every stage. |
| **Konstrukt** | The process exactly in PDF order: Anmeldung → Prüfung der Daten → Aufbau vSZ (checklist 1–4.7, confirm with evidence) → MeMa §6.1 → MaMa §6.2 → Einspeise-MeMa §6.3 → Ruhendstellung → Übergabe (§5 CSV). Participants sorted by *needs attention / done / other*. |
| **Klärfälle / Cases** | One card per open finding, grouped by what to do: decide, fix data, wait for status. |
| **Case drawer** | Opens from anywhere: what's going on (plain language), the MaLo's progress through the PDF steps, the actions (side-by-side comparison for conflicts, status input, live-validated correction, manual override with reason), master data, MeMa/MaMa, Zeitscheiben, lifecycle actions (Wiederaktivierung, Herauslösung, Korrektur, Rücknahme), history. |
| **Schnittstelle / API** | Live API documentation with *Try it* and OpenAPI download. |

**One truth, automatic continuation:** every screen reads the same live case status (`GET /cases()`). Resolving a case, a status input (`POST /updateSapState`) or a vSZ confirmation continues processing immediately; nobody has to press *Run* again. A construct registered via `POST /registerConstruct` is processed at once (event-driven). The workbook import / reset registers the baseline and waits for **Prozess starten**.

The demo menu (⋯ in the topbar) offers test scenarios, workbook import and reset.

## Process API (`/api/v1`)

REST + JSON (`srv/process-api.cds`). OpenAPI: `docs/openapi.json`. The UI uses only this API.

| Method | Path | Step |
| --- | --- | --- |
| POST | `/registerConstruct` · `/importWorkbook` | Anmeldung (JSON or base64 xlsx) |
| GET | `/Constructs` · `/Participants` · `/MarketLocations` | Konstrukt Übersicht |
| POST | `/Constructs/{id}/validate` | Prüfung der Daten |
| GET / POST | `/Issues?$filter=status eq 'OPEN'` · `/Issues/{ID}/resolve` · `/resolveIssues` | Korrektur Daten |
| POST | `/Constructs/{id}/confirmVsz` · `/Constructs/{id}/setStichtag` | vSZ gate, Stichtag |
| POST | `/updateSapState` `{ attribute: imsys\|abmeldung\|mcm, objectId, value }` | Status input from SAP / market communication / MSB (simulated) |
| POST | `/Constructs/{id}/previewSwitch` · `/Constructs/{id}/executeSwitch` | Umstellung (preview never writes) |
| POST | `/Constructs/{id}/process` · `/processAll` | Automatic pipeline |
| GET | `/Constructs/{id}/relationshipList()` · `/Outbox` | Übergabe |
| POST | `/preview` · `/execute` with `{ command: { operation, maloId, buildingId, effectiveDate, reason?, referenceOperationId? } }` | Manual MaLo operations |
| GET | `/Relationships` · `/LifecyclePeriods` · `/ProcessRequests` · `/ProcessRuns` · `/AuditEvents` | Traceability (`$filter`, `$select`, `$orderby`, `$top`) |
| GET / POST | `/health()` · `/runSelfCheck` · `/resetDemo` | System |

Errors use HTTP 400 (invalid input), 404 (unknown object), 409 (state conflict) and 422 (rule violation, e.g. a Korrektur without a reason). Writes accept an optional `actor` for the audit log.

```bash
curl -X POST http://localhost:4004/api/v1/processAll -H "Content-Type: application/json" -d '{}'
curl "http://localhost:4004/api/v1/Constructs/B-MUL-01/relationshipList()"
```

The internal read-only OData V4 view is available at `/odata/v4/malo`.

### Registration MVP integration

Another MVP can create a producer registration without changing constructs, lifecycle periods or Ruhendstellung state:

```http
POST /api/v1/producer-onboardings
Authorization: Bearer rk_...
Idempotency-Key: registration-unique-key
Content-Type: application/json
```

The endpoint accepts the `Producer Onboarding` snake-case contract, including nested `plant_specifics`, persists it separately in `ProducerRegistrationRequests`, and returns `201 Created`. Replaying the same key and payload returns the existing registration; reusing a key for different data returns `409`. The accepted request then enters the same canonical construct registration/pipeline engine used by `registerConstruct`; it does not duplicate that process logic. Producer onboarding remains the source of truth for its external request record, while process results are shown in the normal construct/case tables. If the external payload lacks a required process identifier such as MeLo, the shared pipeline records a real blocking finding instead of inventing one. It never claims SAP registration. Authenticated clients can retrieve records through `GET /api/v1/ProducerRegistrations`. The API playground is at `/api-console`; credential creation and revocation are separated at `/api-console/access`.

### White-label house-member portal

An authenticated read-only backend-for-frontend endpoint combines member/building master data, live Ruhendstellung status and energy trends:

```http
GET /api/v1/house-member-portal?malo=50539603888&range=7d
Authorization: Bearer rk_...
Accept: application/json
```

Ranges are `24h`, `7d`, `30d`, `90d`, and `1y` (hour/day/week aggregation). They end at the latest complete source interval. Building energy balance uses hourly consumption/generation. Member local energy is an explicit proportional hourly **demo derivation**, not a settlement, billing result or SAP verification. `switchoverStatus` is `COMPLETED` only when the shared process engine reports `DONE` and the business state is `RUHEND`; otherwise it is `IN_PROGRESS`. The route performs no business writes. Brand values are configurable with `PORTAL_BRAND_NAME`, `PORTAL_NAME_DE`, `PORTAL_NAME_EN`, `PORTAL_LOGO_URL`, `PORTAL_PRIMARY_COLOR`, and `PORTAL_ACCENT_COLOR`.

## Code layout

| Path | Content |
| --- | --- |
| `srv/construct/rules.ts` | Prüfung rule engine (pure) |
| `srv/construct/switch-plan.ts` | Umstellung planning: MeMa/MaMa/Einspeise-MeMa and per-MaLo decisions (pure) |
| `srv/construct/service.ts` | Orchestration: validation sync, Korrektur, vSZ gate, execution with read-back, outbox |
| `srv/construct/registration.ts` | Anmeldung (workbook and JSON, one code path) |
| `srv/construct/lifecycle-ops.ts` + `srv/domain/lifecycle.ts` | Wiederaktivierung, Herauslösung, Korrektur, Rücknahme |
| `srv/construct/scenario-runner.ts` | Self-check scenarios |
| `srv/process-api.*` | REST contract and transport |
| `srv/adapters/sap-isu-not-configured.ts` | SAP boundary, fails closed |

See `docs/PROCESS_STAGES.md` for exactly what happens in each of the six stages, `docs/ASSUMPTIONS.md` for every assumption and gap, `docs/DEMO.md` for the presenter script, and `docs/MVP_PLAN.md` for the design.

## Demo reset

**Reset** in the header (or `POST /api/v1/resetDemo {"confirm": true}`) re-registers the workbook baseline and clears the simulated state and history. The workbook itself is never modified.

## UI stack

React 19 + Vite, **Tailwind CSS v4 and shadcn/ui**. See [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md) for tokens, components and conventions.

## Docker

One image, one port. Build, push, NAS and Cloudflare steps: [docs/DEPLOY.md](docs/DEPLOY.md).
