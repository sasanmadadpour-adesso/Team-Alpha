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

It is a read-only Construct List Report with an Object Page for each MaLo/MeLo construct. The app also exposes a second Building List Report at `#/Buildings`; each building opens a responsive house-style schematic with the producer, grid flows, consumers, MeLo/MaLo identifiers, energy values, and five-step energy-concept progress. The object pages include topology, hourly energy, payments, and data-quality sections. The app is served by the same CAP process as the OData service and uses a relative, same-origin service URL, which keeps the layout suitable for a later SAP BTP deployment. SAPUI5 is loaded from `https://ui5.sap.com`, so the local browser needs network access to render the UI.

The OData V4 service is available at:

```text
http://localhost:4004/odata/v4/energy-overview/
```

The source workbook defaults to `../Dataset_English.xlsx`. To use another workbook:

```bash
WORKBOOK_PATH=/absolute/path/to/Dataset_English.xlsx npm start
```

The workbook is checked before each request. A changed file is validated and loaded as one new snapshot, so all raw entities and calculated projections use the same workbook version. If a modified workbook is invalid, the previous valid snapshot remains active and CAP reports the validation error.

## API areas

Raw normalized data is available through `ProducerOnboardings`, `Mk7Participants`, `ConsumptionReadings`, `GenerationReadings`, `EnergyPrices`, `FieldDescriptions`, and `FinancialRules`.

Business projections are available through `BuildingOverviews`, `ParticipantOverviews`, `HourlyEnergyBalances`, `BuildingFinancialSummaries`, and `PortfolioSummary`. The VNB-compatible views are `Constructs`, `ConstructHourlyValues`, `Payments`, `DataQualityIssues`, and `Buildings`. Building detail views use `BuildingConsumers`, `BuildingProducers`, and `BuildingHourlyEnergy`.

The five energy-concept progress fields are stored directly on the participant worksheets in both `Dataset_English.xlsx` and `Datensatz_Deutsch.xlsx`. They can be regenerated with:

```bash
node scripts/add-energy-progress.js
```

The workbook also contains a deterministic calendar-year 2026 hourly sample. Generate it with:

```bash
npm run generate-year-data
```

Hourly energy facets are exposed as line-chart annotations. Trend consumers can aggregate the existing values by hour (up to 7 days), day (up to 90 days), or week (up to 365 days) through `srv/lib/energy-trends.js`.

The calculator follows the workbook financial rules: only household participants with `Teilnahme MK7 = Ja` are eligible; local energy is the minimum of generation and eligible consumption; residual and export energy use the corresponding maximum rules; and the Mieterstrom subsidy applies only to locally used solar energy.

## UI behaviour

- **Language:** the `English`/`Deutsch` button in the page header switches the whole app in place (no reload). It recreates the Fiori component with the new UI5 language; CDS labels and data-quality messages are translated per request from `sap-language`. The chosen language is mirrored in the URL (`?sap-language=`) so a manual reload keeps it.
- **Back links:** `webapp/ext/NavHistory.js` stores the page a user came from in the browser's per-entry `history.state` and shows a "back to ..." link above the app. It needs no cookies or storage, so it works without a consent banner and survives reloads; the pure logic lives in `ext/navLogic.js`.
- **Tables:** "Show more per row" starts switched on (`Component.js` patches the private mdc `ResponsiveTableType` hook; if UI5 removes it the tables just start collapsed).
- **House schematic** (`ext/BuildingHouse.js`): grid node and two wires to the house show the average grid import and export per hour over the latest 24 hours (`averageGridImport24hKwh`, `averageGridExport24hKwh` on `Buildings`). Each house floor is a household MaLo with a participation mark; there are no floor numbers because the data does not define floors.
- **Construct page:** the building in the General group links to the building page (`buildingLink`); synthetic test constructs have no building page and show plain text. MaLo and MeLo appear only in the Topology group.
- **Metering and market locations** (`ext/LocationTopology.js`): shows own MeLo/MaLo (plants also the export MaLo) -> the building's shared energy counter (MaLo, plus MeLo when the counter is real; virtual counters have only a MaLo) -> grid. The General group shows role, direction, MK7 participation, address and building.
- **MK7 participation** is shown as a check mark (participating) or red cross (not participating) without text.

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
| `SYNTHETIC_EDGE_CASE` | Warning | Built-in synthetic test scenarios |

## Tests

```bash
npm test
```

The application structure can also be checked independently with:

```bash
npm run test:app
```
