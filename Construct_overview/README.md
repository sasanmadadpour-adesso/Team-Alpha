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

## Tests

```bash
npm test
```

The application structure can also be checked independently with:

```bash
npm run test:app
```
