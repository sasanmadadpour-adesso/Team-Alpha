# Mieterstrom CAP Backend Simulator

This is the combined SAP CAP and SAP Fiori Elements VNB Grid View application. It reads the English workbook in the repository root, projects the workbook into construct, energy, payment, quality, and portfolio views, and serves the VNB frontend from the same CAP process.

## Run locally

From this directory:

```bash
npm install
npm run validate-workbook
npm start
```

The Fiori Elements application is available at:

```text
http://localhost:4004/building-overview/webapp/index.html
```

The index page is a single tree table (`app/building-overview/webapp/overview`): one root row per building, expandable into its household consumers, solar/wind producers, and shared energy counter. There is no separate construct/building tab choice any more; every row links to the matching Construct or Building Object Page. Each building's Object Page opens a responsive house-style schematic with the producer, grid flows, consumers, MeLo/MaLo identifiers, energy values, and eight-step switch-over progress. The object pages include topology, hourly energy, payments, and data-quality sections. The app is served by the same CAP process as the OData service and uses a relative, same-origin service URL, which keeps the layout suitable for a later SAP BTP deployment. SAPUI5 is loaded from `https://ui5.sap.com`, so the local browser needs network access to render the UI.

The OData V4 service is available at:

```text
http://localhost:4004/odata/v4/energy-overview/
```

The source workbook defaults to `../Dataset_English.xlsx`. To use another workbook:

```bash
WORKBOOK_PATH=/absolute/path/to/Dataset_English.xlsx npm start
```

## Live construct synchronization

The overview can mirror pending registrations from **Anmelden** and authoritative registered constructs from **Umstellung**. It performs an initial synchronization at startup and polls both APIs every 30 seconds. Pending items are reconciled by primary MaLo and disappear after the same primary MaLo is returned by Umstellung. Cached data remains visible with a warning if either API is unavailable; removed pending rows are retained in `ConstructSyncAudit`.

Default external contract:

```text
GET http://localhost:4010/api/constructs/pending
GET http://localhost:4010/api/constructs/pending/{encodedMaLo}
GET http://localhost:4020/api/constructs
GET http://localhost:4020/api/constructs/{encodedMaLo}
```

The merged `ruhende-malo` app implements these Umstellung-compatible endpoints directly. Run it on port `4020`; it returns all household, producer, and Reststrom construct members. The Overview converts the flat snapshot back into one expandable root per building. If the feed is protected, set Ruhende-MaLo `OVERVIEW_API_KEY` and Overview `EXTERNAL_API_KEY` to the same value. For immediate updates in addition to polling, configure the Ruhende-MaLo app with `OVERVIEW_WEBHOOK_URL=http://localhost:4004/api/webhooks/registered`, and set `OVERVIEW_WEBHOOK_API_KEY` equal to the Overview's `SYNC_API_KEY`.

Snapshot responses may be a plain JSON array or `{ "value": [...] }`. Each row must contain a primary MaLo under `primaryMaLo`, `maLo`, `malo`, `marketLocationId`, `marketLocationIdentifier`, or `importMaLo`. The external API key is sent as both `x-api-key` and a Bearer token.

Configuration:

| Environment variable | Default | Purpose |
|---|---|---|
| `PENDING_API_URL` | `http://localhost:4010/api/constructs/pending` | Anmeldung snapshot URL |
| `REGISTERED_API_URL` | `http://localhost:4020/api/constructs` | Umstellung snapshot URL; hosted deployments use `https://ruhend.sidely.dev/api/v1/maloOverview()` |
| `REGISTERED_FALLBACK_API_URL` | empty | Optional fallback snapshot resource |
| `HOUSE_MEMBER_PORTAL_API_URL` | derived from `REGISTERED_API_URL` | Hosted per-MaLo energy portal endpoint |
| `RUHENDE_DATA_API_URL` | derived from `REGISTERED_API_URL` | Read-only hourly data fallback when the supplied key is not a hosted portal principal |
| `EXTERNAL_API_KEY` | empty | Credential sent to external APIs |
| `SYNC_API_KEY` | empty | Credential required by incoming webhooks |
| `SYNC_INTERVAL_MS` | `30000` | Polling interval |
| `SYNC_TIMEOUT_MS` | `10000` | Per-request timeout |
| `SYNC_DB_PATH` | `db/live-sync.sqlite` | Persistent local cache and audit database |

Webhook recovery endpoints accept a full array / value envelope or an individual `{ "event": "UPSERT|DELETE", "data": {...} }` event:

```text
POST /api/webhooks/pending
POST /api/webhooks/registered
```

The OData service exposes `PendingConstructs`, `ConstructSyncStatus`, `ConstructSyncAudit`, and the `syncConstructs` action. The UI Pending tab refreshes every 30 seconds and also provides a manual refresh button.

The complete machine-readable Umstellung query and response contract is available at `contracts/umstellung-constructs-api.json`. The snapshot and detail operations use `GET`, so they intentionally have no JSON request body.

The workbook is checked before each request. A changed file is validated and loaded as one new snapshot, so all raw entities and calculated projections use the same workbook version. If a modified workbook is invalid, the previous valid snapshot remains active and CAP reports the validation error.

## API areas

Raw normalized data is available through `ProducerOnboardings`, `Mk7Participants`, `ConsumptionReadings`, `GenerationReadings`, `EnergyPrices`, `FieldDescriptions`, and `FinancialRules`.

Business projections are available through `BuildingOverviews`, `ParticipantOverviews`, `HourlyEnergyBalances`, `BuildingFinancialSummaries`, and `PortfolioSummary`. The VNB-compatible views are `Constructs`, `ConstructHourlyValues`, `Payments`, `DataQualityIssues`, and `Buildings`. Building detail views use `BuildingConsumers`, `BuildingProducers`, and `BuildingHourlyEnergy`. The combined overview tree is served by `ConstructTreeNodes` (one row per building, household, producer, and shared energy counter, with a `parentID` and a `detailHash` for client-side navigation).

The participant switch-over ("Teilnehmer Umstellung" / "Participant switch-over") is a single whole-number step (1-8) per household, stored in the column `participant_switchover_step` of the English workbook and `teilnehmer_umstellung_schritt` of the German one. The eight step names are resolved per request language in `srv/lib/switchover.js` and exposed as an SAP `UI.DataPoint` with `Visualization: #Progress`. Buildings have no switch-over progress of their own. The column is ensured (a legacy column is renamed in place, values are kept) with:

```bash
npm run set-switchover-progress
```

Most participating households have finished all eight steps; a couple are deliberately left mid-progress so the UI shows all three MK7-participation states (see below).

The workbook also contains a deterministic calendar-year 2026 hourly sample. Generate it with:

```bash
npm run generate-year-data
```

Hourly energy facets are exposed as line-chart annotations. Trend consumers can aggregate the existing values by hour (up to 7 days), day (up to 90 days), or week (up to 365 days) through `srv/lib/energy-trends.js`.

The calculator follows the workbook financial rules: only household participants with `Teilnahme MK7 = Ja` are eligible; local energy is the minimum of generation and eligible consumption; residual and export energy use the corresponding maximum rules; and the Mieterstrom subsidy applies only to locally used solar energy.

## UI behaviour

- **Language:** the `English`/`Deutsch` button in the page header switches the whole app in place (no reload). It recreates the Fiori component with the new UI5 language; CDS labels and data-quality messages are translated per request from `sap-language`. The chosen language is mirrored in the URL (`?sap-language=`) so a manual reload keeps it. The button is also available on the overview tree page.
- **Overview page** (`app/building-overview/webapp/overview`): a list-report style page with title and language toggle, a header with a search field, a Find/Filter switch, match navigation (previous/next with "n of m") and summary tiles (buildings, households, participating, finished). Below it a card holds a single `sap.ui.table.TreeTable` fed from `ConstructTreeNodes`: one row per building, expandable into its households, producers and shared energy counter. It starts collapsed; "Expand all" and "Collapse all" are in the card toolbar.
- **Search:** case- and accent-insensitive, across every displayed value (names, MaLo, MeLo, owner, city, street, step name, kWh). In *Find* mode nothing is hidden: the building containing the current match is expanded, the row is scrolled into view and every matching row is marked (strong for the current match, light for the others). In *Filter* mode non-matching rows are hidden. If nothing matches exactly, the single closest entry is found (fuzzy match, threshold `FUZZY_THRESHOLD` in `overview/controller/search.js`) and a hint says so.
- **Table columns:** name (plain-looking link with a node-type icon), role, city, owner (building rows only: "Koller, Jan"), MK7 / participant switch-over, consumption, generation, local energy, data quality. The MK7 column shows a green check (participating, finished), a yellow exclamation mark (participating, unfinished) or a red cross (not participating); below the last step it also shows the step name and a progress bar, while finished households show the icon only. The arrow at the end of each row opens its detail page.
- **Owner:** the building owner is the producer named in the plant onboarding. The table shows "Last, First"; the building and construct detail pages show first and last name as separate fields.
- **Back links:** `webapp/ext/NavHistory.js` stores the page a user came from in the browser's per-entry `history.state` and shows a "back to ..." link above the app; every Construct/Building sub-page also gets a second, permanent "back to overview" link regardless of navigation history. Neither link needs cookies or storage, so they work without a consent banner and survive reloads; the pure logic lives in `ext/navLogic.js`.
- **Tables:** "Show more per row" starts switched on (`Component.js` patches the private mdc `ResponsiveTableType` hook; if UI5 removes it the tables just start collapsed).
- **House schematic** (`ext/BuildingHouse.js`): grid node and two wires to the house show the average grid import and export per hour over the latest 24 hours (`averageGridImport24hKwh`, `averageGridExport24hKwh` on `Buildings`). Each house floor is a household MaLo with a participation mark; there are no floor numbers because the data does not define floors. The shared energy counter's MaLo in the roof meter is a link to its own Construct detail page, same as every other MaLo.
- **Construct page:** the building in the General group links to the building page (`buildingLink`). MaLo and MeLo appear only in the Topology group. The shared energy counter's Object Page shows the whole house's grid import and export as its residual-grid and export KPIs; all other energy KPIs and the switch-over are hidden there (`counterKpiHidden`). The building page shows consumption, grid import and export, and solar and wind generation as header KPIs; solar or wind only appear when the building has that production type.
- **Metering and market locations** (`ext/LocationTopology.js`): shows own MeLo/MaLo (plants also the export MaLo) -> the building's shared energy counter (MaLo, plus MeLo when the counter is real) -> grid. The General group shows role, direction, MK7 participation, address and building.
- **MK7 participation** is a three-state icon without text: a green check for a participating household that has finished the eight-step switch-over, a yellow exclamation mark for a participating household still in the switch-over, and a red cross for a household that does not participate.

## Master data repair

`npm run fix-master-data` (idempotent) edits both workbooks in place: every plant gets its own unique export MaLo, used as `market_location_identifier` of the producer and in all hourly generation rows (previously the plant's MeLo was stored there); each building has a single postcode (that of the producer's delivery address); "Müllheim an der Ruhr" is corrected to "Mülheim an der Ruhr" and "Vilbelerlandstrß" to "Vilbeler Landstraße". MaLo/MeLo have no check digits, so none are validated.

## Data quality rules

`srv/lib/data-quality.js` checks the workbook and returns issues with a code, severity, field, source value, explanation and recommended action in German and English:

| Code | Severity | Meaning |
|---|---|---|
| `POSTCODE_MISMATCH` | Warning | A participant's postcode differs from the postcode stored for its building at the generation plant |
| `DUPLICATE_IMPORT_MALO` | Error | The same import MaLo is assigned to several households |
| `SHARED_EXPORT_MALO` | Warning | One export MaLo is used by several plants |
| `EXCLUDED_WITH_READINGS` | Info | Household with `Teilnahme MK7 = nein` still has readings (ignored in settlement) |
| `UNRECOGNIZED_PARTICIPATION` | Error | `Teilnahme MK7` is neither `Ja` nor `nein` |

There is no synthetic test-scenario data any more; every construct, connection, and data-quality issue comes from the real workbook rows.

## Tests

```bash
npm test
```

The application structure can also be checked independently with:

```bash
npm run test:app
```
