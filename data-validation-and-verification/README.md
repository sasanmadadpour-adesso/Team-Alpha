# Producer Validation and Verification Demo

A small Node.js and Express service that demonstrates how a German distribution
system operator (`Verteilnetzbetreiber`, VNB) can validate and verify producer
onboarding data before accepting a Mieterstrom/energy-sharing installation.

An existing onboarding application sends producer data to this service. The
service checks the data locally, compares it against an example authoritative
record representing SAP, and returns a complete result in the same HTTP
response. There is no database, queue, or polling — everything happens
synchronously in one request/response cycle.

> For a plain-language walkthrough of every check performed and what each
> possible response means, see [`OVERVIEW.md`](./OVERVIEW.md).

## 1. What This Demo Does

```text
Receive producer onboarding data
        |
        v
Validate the data we were given (local validation)
        |
        v
Look up the matching authoritative record (mock SAP)
        |
        v
Compare submitted values against that record (verification)
        |
        v
Return one clear result: continue, correct data, review, stop, or retry
```

This is a demonstration of the **logic**, not a production SAP integration.
The mock SAP data stands in for a real SAP lookup that does not yet exist.

## 2. Validation vs. Verification

**Validation** only looks at the submitted payload. It answers: *is this data
well-formed and internally consistent?*

- Is the email syntactically valid?
- Is the postal code five digits?
- Is the plant capacity a positive number?
- Does the contract start come before the contract end?

**Verification** compares the submitted values against an independent,
authoritative source (SAP, represented here by mock data). It answers: *does
an authority agree with what was submitted?*

- Does this market location identifier actually exist?
- Does the registered plant technology and capacity match?
- Does the address match the registered installation?
- Is this VNB actually responsible for this location?

Validation can fail without ever consulting SAP. Verification only runs once
validation has passed.

## 3. Request Flow

```text
Onboarding application
        |
        | POST /api/onboarding/verify
        v
Express API
        |
        +-- Parse and validate the JSON body (Zod schema)
        +-- Run local business validation rules
        +-- Stop here if validation fails -> HTTP 400
        +-- Look up the identifier via the mock SAP client
        +-- Compare submitted values against the SAP record
        +-- Decide: VERIFIED / MANUAL_REVIEW / REJECTED / NOT_VERIFIABLE
        v
Immediate JSON response to the onboarding application
```

## 4. Running the Application

Requirements: Node.js 20+ and npm. No database, Docker, or `.env` file needed.

This project lives entirely inside the `data-validation-and-verification`
folder. Enter that folder before running any npm command.

**Windows (PowerShell):**

```powershell
Set-Location ".\data-validation-and-verification"
npm.cmd install
npm.cmd run dev
```

**macOS/Linux:**

```bash
cd data-validation-and-verification
npm install
npm run dev
```

The API listens on `http://localhost:3000`.

For a production-style run:

```powershell
npm.cmd run build
npm.cmd start
```

### Running from the repository root

If you prefer not to change directories, npm's `--prefix` option works as
a convenience:

```powershell
npm.cmd --prefix ".\data-validation-and-verification" install
npm.cmd --prefix ".\data-validation-and-verification" run dev
```

Entering the folder directly (shown above) is the primary documented
workflow; `--prefix` is only an alternative for scripts or CI.

## 5. Calling the Main Endpoint

```http
POST /api/onboarding/verify
Content-Type: application/json
```

```powershell
$body = Get-Content ".\examples\producer-onboarding.json" -Raw

Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:3000/api/onboarding/verify" `
  -ContentType "application/json" `
  -Body $body
```

The payload shape is based on the `Producer Onboarding` sheet in
[`Dataset_English.xlsx`](../Dataset_English.xlsx). See
`examples/producer-onboarding.json` for a complete example. JSON numbers
use decimal points (`6`, not `"6,0"`).

A `market_location_identifier` is required for this demo — SAP lookup is
only implemented by identifier, not by `tranche`. Submitting only a
`tranche` returns a local validation failure explaining this.

## 6. Understanding the Response

```json
{
  "status": "VERIFIED",
  "valid": true,
  "verified": true,
  "message": "The onboarding data is valid and matches the authoritative data.",
  "validation": {
    "passed": true,
    "checks": [
      { "field": "email", "result": "VALID", "message": "Email format is valid." }
    ]
  },
  "verification": {
    "performed": true,
    "source": "MOCK_SAP",
    "checks": [
      {
        "field": "plant_capacity_kw",
        "submitted": 6,
        "authoritative": 6,
        "result": "MATCH",
        "message": "The submitted capacity matches the registered capacity.",
        "why": "The declared plant must correspond to the plant registered in VNB master data."
      }
    ]
  },
  "onboarding_action": "CONTINUE"
}
```

Submitted and authoritative values are always shown separately — the
response never silently overwrites one with the other.

## 7. Locally Validated Fields

Checked using only the submitted payload:

- Required text fields are non-empty (name, address, building ID, etc.)
- Email syntax
- Five-digit postal code
- Positive plant capacity
- Latitude `-90..90`, longitude `-180..180` (both or neither)
- ISO 8601 timestamps with an explicit timezone
- Contract start before contract end
- Preferred delivery start falls inside the contract period
- `subscription_reason` is `E01`, `E02`, or `E03`
- `production_type` is `Solar`, `Wind`, `Gas`, `Hydro`, or `Battery`
- Either `market_location_identifier` or `tranche` is present
  (identifier required for verification in this demo)

### Identifier classification

```text
MALO       exactly 11 numeric digits
MELO       long value starting with "DE"
UNKNOWN    anything else
```

The workbook's `market_location_identifier` field actually contains
MeLo-shaped values. The service reports this as a `WARNING` rather than
silently treating a MeLo as a MaLo — these are different business objects.

## 8. SAP-Verified Fields

Compared against the mock SAP record once local validation passes:

| Field | Compared against | Why |
|---|---|---|
| `market_location_identifier` | `identifier` | Confirms the location exists |
| Detected identifier type | `identifier_type` | Prevents MaLo/MeLo confusion |
| Address fields | `address` | Confirms the physical installation |
| `production_type` | `plant.production_type` | Confirms registered technology |
| `plant_capacity_kw` (±0.1 kW) | `plant.capacity_kw` | Confirms registered capacity |
| `building_id` | `building_id` | Confirms the building relationship |
| Preferred/contract start | `valid_from` / `valid_to` | Confirms the record is active then |
| This VNB | `network_operator` | Confirms this VNB is responsible |

`salutation`, `product_name`, SaaS IDs, and reverse-charge status are **not**
verified against SAP — the mock record has no equivalent field for them.

## 9. Mock SAP Endpoint

```http
GET /api/mock-sap/locations/:identifier
```

```powershell
Invoke-RestMethod -Uri "http://localhost:3000/api/mock-sap/locations/DE0073325707820000000000000088943"
```

Returns `200` with the record (tagged `"source": "MOCK_SAP_DEMONSTRATION"`),
or `404` if unknown. This endpoint exists purely to make the hypothetical
SAP lookup visible; it is read-only.

Special identifiers in `src/mock-sap-data.ts` demonstrate specific outcomes:

| Identifier | Demonstrates |
|---|---|
| `DE0073325707820000000000000088943` | Full match (Frankfurt, solar) |
| `DE00733257078200000000000000880945` | Full match (Cologne, wind) |
| `DE0001815707800000101300000139428` | Full match (Mülheim, solar) |
| `DE000000000000INACTIVE` | Record inactive at the submitted date |
| `DE000000000000WRONGNETWORK` | Location belongs to another VNB |
| `DE000000000000UNAVAILABLE` | Simulated SAP source failure |
| Anything else | No mock record found |

## 10. Statuses and Onboarding Actions

| Status | HTTP | Meaning | `onboarding_action` |
|---|---|---|---|
| `VERIFIED` | 200 | All checks passed | `CONTINUE` |
| `VALIDATION_FAILED` | 400 | Submitted data is invalid | `CORRECT_DATA` |
| `MANUAL_REVIEW` | 200 | Valid but SAP values differ | `PAUSE_FOR_REVIEW` |
| `REJECTED` | 200 | Another VNB is responsible | `STOP` |
| `NOT_VERIFIABLE` | 200 | No matching SAP record | `REQUEST_CLARIFICATION` |
| `SOURCE_UNAVAILABLE` | 503 | SAP lookup itself failed | `RETRY_LATER` |

A business rejection (`REJECTED`, `MANUAL_REVIEW`, `NOT_VERIFIABLE`) is not
an HTTP error — the request was processed successfully. Only malformed
requests (`VALIDATION_FAILED`) and infrastructure failures
(`SOURCE_UNAVAILABLE`) change the HTTP status code.

## 11. Tests and Build

```powershell
npm.cmd test        # unit + endpoint tests (Node's built-in test runner)
npm.cmd run build   # TypeScript compilation to dist/
npm.cmd run lint    # ESLint
npm.cmd start       # run the compiled server from dist/server.js
```

Tests cover local validation rules, SAP comparison logic, and the HTTP
endpoints themselves (status codes, response shape, malformed JSON).

## 12. Replacing the Mock With Real SAP

Every SAP lookup goes through one function in `src/sap-client.ts`:

```typescript
export async function getSapLocation(identifier: string): Promise<SapLocation | null> {
  // currently reads mockSapLocations
}
```

To integrate a real SAP API, replace only this function's body, for example:

```typescript
const response = await fetch(
  `${process.env.SAP_BASE_URL}/locations/${encodeURIComponent(identifier)}`,
);

if (response.status === 404) return null;
if (!response.ok) throw new Error('SAP source unavailable');
return response.json();
```

No other file needs to change — validation, comparison, and the decision
logic are already independent of where the authoritative data comes from.

## 13. Missing Data for Real Verification

This demo's mock data is enough to show the logic, but a real VNB
integration would need authoritative data such as:

- **Identifiers** — canonical MaLo/MeLo IDs, their relationship, and status
- **Network responsibility** — which VNB actually operates each location
- **Plant master data** — technology, capacity, commissioning/decommissioning dates
- **Topology** — connection object, building reference, metering concept
- **Contracts** — accepted activation date, technical approval, authorization
- **Provenance** — source system, record version, retrieval/verification timestamps

Persisting this evidence is intentionally out of scope for this demo.

## 14. Limitations

- `MOCK_SAP` is illustrative only — it is not real external verification.
- Mock records are manually derived from the example workbook.
- Processing is synchronous; there is no retry queue or background worker.
- SAP lookup is identifier-only; `tranche`-based lookup is not implemented.
- This covers producer onboarding only, not metering, billing, or settlement.
- Both XLSX reference files
  ([`Dataset_English.xlsx`](../Dataset_English.xlsx),
  [`Datensatz_Deutsch.xlsx`](../Datensatz_Deutsch.xlsx)) live at the
  repository root, are used only as reference data, and are never modified.
