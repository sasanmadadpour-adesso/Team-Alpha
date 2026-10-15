# Mieterstrom CAP Backend Simulator

This is a local SAP CAP backend simulator for the English workbook in the repository root. It exposes normalized access to all workbook sheets and business-ready energy settlement projections for a future Fiori Elements frontend.

## Run locally

From this directory:

```bash
npm install
npm run validate-workbook
npm start
```

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

Business projections are available through `BuildingOverviews`, `ParticipantOverviews`, `HourlyEnergyBalances`, `BuildingFinancialSummaries`, and `PortfolioSummary`.

The calculator follows the workbook financial rules: only household participants with `Teilnahme MK7 = Ja` are eligible; local energy is the minimum of generation and eligible consumption; residual and export energy use the corresponding maximum rules; and the Mieterstrom subsidy applies only to locally used solar energy.

## Tests

```bash
npm test
```
