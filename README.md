# VNB Producer Validation and Verification Backend

This repository contains a minimal backend for a German distribution system operator (`Verteilnetzbetreiber`, VNB) that receives producer-onboarding data from an existing registration application.

The backend validates the submitted data locally and verifies relevant claims against an authoritative SAP integration. It is designed for a Mieterstrom or energy-sharing onboarding process, but the current implementation is intentionally limited to **producer onboarding**.

The backend does not replace the registration application. It does not provide a frontend, billing system, energy-allocation engine, or meter-data platform.

## 1. Purpose

The registration application collects information such as:

- Producer identity
- Installation address
- Generation technology
- Installed capacity
- Market/location identifier
- Requested delivery start
- Contract period
- Building reference

Those values are declarations received from another application. They are not automatically authoritative merely because they have the right format.

This backend has two separate responsibilities:

### Validation

Validation checks whether the submitted payload is structurally and internally usable.

Examples:

- Is the email syntactically valid?
- Is the postal code five digits?
- Is the capacity positive?
- Are timestamps valid and timezone-aware?
- Is the contract start before the contract end?
- Does the identifier have a recognizable MaLo- or MeLo-like structure?

Validation can be performed using only the submitted request.

### Verification

Verification compares submitted claims with an independent authoritative source, represented here by a SAP provider interface.

Examples:

- Does the identifier exist in the VNB master data?
- Is it active on the requested effective date?
- Does it belong to this VNB?
- Does the registered plant technology match?
- Does the registered capacity match?
- Does the address match?
- Does the building reference map to the authoritative connection topology?

Verification cannot be performed reliably from the onboarding payload alone. The current default provider is deterministic mock SAP data because no real SAP credentials or API contract are available.

## 2. Scope

### Included

- JSON REST API for producer-onboarding submissions
- Idempotent request handling
- Immutable storage of the original request payload
- Normalized payload representation
- Deterministic local validation
- Effective-date handling
- MaLo/MeLo identifier classification
- Asynchronous SAP verification workflow
- Mock SAP provider
- Placeholder OData provider
- Comparison of submitted and authoritative values
- Structured findings and verification checks
- Integration-attempt records
- Verification decisions
- PostgreSQL persistence through Prisma
- Swagger/OpenAPI setup
- Health endpoints
- Unit tests for core validation behavior

### Explicitly not included

- Registration application or frontend
- Household participant onboarding
- `MK7 Participants` processing as an operational input
- Meter-value ingestion
- Meter-value quality processing
- Energy allocation
- Billing and settlement
- Tariff calculation
- Complete SAP replication
- Direct SAP database-table access
- Machine learning or LLM-based decisions
- Automatic correction of ambiguous addresses or identifiers
- Production SAP authentication

The other workbook sheets remain useful as business context, but this service currently uses the `Producer Onboarding` sheet as the inbound contract basis.

## 3. High-Level Flow

```text
Existing registration application
                |
                | POST JSON producer-onboarding payload
                | Idempotency-Key header
                v
       Producer Verification API
                |
                | 1. Check request shape
                | 2. Calculate payload hash
                | 3. Enforce idempotency
                | 4. Preserve raw payload
                v
       Local validation and normalization
                |
                |-- Blocking local errors --------------------+
                |                                             |
                |                                             v
                |                                  VALIDATION_FAILED
                |
                | 5. Store normalized payload
                | 6. Enqueue verification job
                v
       Background verification worker
                |
                v
       SAP verification provider interface
                |
                |-- Mock provider during development
                |-- OData provider when SAP contract exists
                v
       Authoritative SAP result
                |
                | Compare submitted values with SAP values
                | Store every check and integration attempt
                v
       Decision engine
                |
                |-- VERIFIED
                |-- MANUAL_REVIEW
                |-- REJECTED
                |-- SOURCE_UNAVAILABLE
                v
       GET verification result
                |
                v
       Existing registration application
```

The process is asynchronous after the request has been accepted. The registration application receives a verification ID and retrieves the result later.

## 4. Why the Architecture Uses These Components

### Node.js and TypeScript

Node.js is suitable for an API that mostly coordinates validation, persistence, background work, and external SAP calls. TypeScript makes the payload, provider contract, statuses, and persistence interactions explicit.

### NestJS with Fastify

NestJS provides modules and dependency injection. That matters here because validation, SAP integration, persistence, jobs, and HTTP handling are separate responsibilities.

Fastify is used as the NestJS HTTP adapter. It provides a fast HTTP server and configurable body limits while keeping NestJS application structure.

The service is a **modular monolith**, not a collection of microservices. There is one codebase and one deployable backend, but the responsibilities are separated internally. This is simpler to operate while the business rules and SAP contract are still evolving.

### PostgreSQL and Prisma

PostgreSQL is used because the backend needs:

- Unique idempotency constraints
- Relationships between requests, findings, checks, and integration attempts
- Transactions
- JSON storage for the exact external payload and evidence details
- Date/time fields for effective-date behavior

Prisma supplies typed database access and schema migrations. The workbook is not used as an operational database because it cannot safely provide transactions, concurrent access, historical versions, access control, or reliable audit history.

### `pg-boss`

SAP verification is asynchronous because external systems can be slow or temporarily unavailable. `pg-boss` uses PostgreSQL as the job queue, which avoids introducing another infrastructure dependency for the minimal backend.

The initial request is persisted before the verification job runs. A SAP timeout therefore does not cause the HTTP request to hang or automatically become a business rejection.

### Zod

Zod validates the incoming JSON shape at the system boundary. This is separate from business rules:

- Zod determines whether the payload has the expected fields and primitive types.
- `ValidationService` determines whether the values are meaningful and internally consistent.

### Mock SAP provider

The provider interface allows the rest of the application to be developed without SAP access. The mock provider is deterministic, so tests and demonstrations are repeatable.

The mock provider is not real verification. It only demonstrates the integration contract and decision workflow.

## 5. Repository Structure

```text
.
|-- Dataset_English.xlsx             Reference workbook
|-- Datensatz_Deutsch.xlsx           Reference workbook
|-- examples/
|   `-- producer-onboarding.json     Example API payload
|-- prisma/
|   `-- schema.prisma                 PostgreSQL/Prisma data model
|-- src/
|   |-- app.module.ts                 Root NestJS module
|   |-- main.ts                       HTTP server and Swagger startup
|   |-- common/
|   |   |-- canonical-json.ts         Deterministic payload hashing
|   |   `-- types.ts                   Shared domain types and identifier classifier
|   |-- config/
|   |   `-- configuration.ts           Environment validation and defaults
|   |-- health/
|   |   |-- health.controller.ts      Liveness and readiness endpoints
|   |   `-- health.module.ts
|   |-- jobs/
|   |   |-- job.service.ts             PostgreSQL-backed verification worker
|   |   `-- jobs.module.ts
|   |-- persistence/
|   |   |-- prisma.service.ts          Prisma client lifecycle
|   |   `-- persistence.module.ts
|   |-- producer-verification/
|   |   |-- producer-verification.controller.ts
|   |   |-- producer-verification.module.ts
|   |   `-- producer-verification.service.ts
|   |-- sap-integration/
|   |   |-- contracts/                  Provider-neutral SAP contract
|   |   |-- providers/mock-sap.provider.ts
|   |   |-- providers/odata-sap.provider.ts
|   |   `-- sap-integration.module.ts
|   |-- types/swagger.d.ts             Local declaration shim for Swagger package types
|   `-- validation/
|       |-- producer.schema.ts          Zod producer payload schema
|       |-- validation.module.ts
|       `-- validation.service.ts       Normalization and business rules
|-- test/
|   `-- validation.service.spec.ts     Validation unit tests
|-- docker-compose.yml                 Local PostgreSQL service
|-- .env.example                       Configuration template
|-- eslint.config.mjs                  ESLint 9 flat configuration
|-- jest.config.js                     Jest configuration
|-- nest-cli.json                      NestJS CLI configuration
`-- package.json                       Scripts and dependencies
```

## 6. Input Contract

The API contract is based on the `Producer Onboarding` sheet of `Dataset_English.xlsx`.

The operational API accepts JSON with decimal points, not German Excel decimal-comma strings. For example:

```json
{
  "first_name": "Jan",
  "last_name": "Koller",
  "email": "jankoller@gmail.com",
  "salutation": "Mr",
  "is_business": true,
  "is_reverse_charge": true,
  "deliv_address_street": "Vilbeler Landstrasse",
  "deliv_address_house_number": "21",
  "deliv_address_zipcode": "60388",
  "deliv_address_city": "Frankfurt am Main",
  "subscription_reason": "E01",
  "production_type": "Solar",
  "plant_capacity_kw": 6,
  "plant_specifics": {
    "latitude": 50.1577,
    "longitude": 8.7436
  },
  "market_location_identifier": "DE0073325707820000000000000088943",
  "tranche": null,
  "preferred_delivery_start": "2026-10-01T00:00:00Z",
  "saas_customer_id": "crm-producer-00789",
  "saas_contract_id": "crm-prod-contract-00101",
  "product_name": "solar_feed_in_01_2025",
  "consumer_saas_contract_id": null,
  "control_resource": null,
  "technical_resources": null,
  "contract_start_utc": "2026-10-01T00:00:00Z",
  "contract_end_utc": "2026-10-02T00:00:00Z",
  "building_id": "B-FRA-01"
}
```

### Field treatment

| Field | Treatment | Reason |
|---|---|---|
| `first_name`, `last_name` | Required | Identifies the applicant/producer. This is still a claim until the responsible business process verifies it. |
| `email` | Required and syntactically validated | Used for contact and correlation, not as proof of technical ownership. |
| `salutation` | Optional | Correspondence metadata; absence should not block technical validation. |
| `is_business` | Required | Customer classification that may affect downstream contracts or tax handling. |
| `is_reverse_charge` | Required | Preserved for downstream commercial processing but not independently verified by the current mock provider. |
| `deliv_address_*` | Required | Used for comparison with authoritative SAP location data. |
| `subscription_reason` | Required enum | Routes the onboarding business process; allowed values are `E01`, `E02`, and `E03`. |
| `production_type` | Required enum | Used to compare declared technology with the authoritative plant record. |
| `plant_capacity_kw` | Required | Used for plant comparison and later technical plausibility checks. |
| `plant_specifics.latitude/longitude` | Conditional | Coordinates can support location matching. Both must be supplied together. |
| `market_location_identifier` | Conditional | Must be supplied unless `tranche` is supplied. Its semantic type is classified rather than assumed. |
| `tranche` | Conditional | Alternative plant reference when no market-location identifier is supplied. |
| `preferred_delivery_start` | Optional/conditional | Applicant-requested start, not automatically the accepted activation date. |
| `saas_customer_id`, `saas_contract_id` | Optional | Internal references retained for correlation, not treated as SAP authority. |
| `product_name` | Optional | Supplier/product metadata outside the core VNB technical decision. |
| `consumer_saas_contract_id` | Optional | Cross-reference for a prosumer relationship; not needed for basic plant verification. |
| `control_resource`, `technical_resources` | Optional | May become relevant for controllability or Redispatch, but no value is invented if absent. |
| `contract_start_utc`, `contract_end_utc` | Required | Defines the submitted contractual period and the default verification effective date. |
| `building_id` | Required | Application-side grouping key. It must be compared with authoritative topology rather than trusted by itself. |

## 7. Raw and Normalized Data

The service stores two representations of the request.

### Raw payload

The raw payload is the exact JSON object received from the registration application. It is stored for auditability and dispute reconstruction.

It is never replaced by a corrected or SAP-derived value.

### Normalized payload

The normalized payload is a processing representation. The service:

- Trims surrounding whitespace
- Collapses repeated address whitespace
- Normalizes email casing to lowercase
- Converts blank optional strings to `null`
- Converts timestamps to canonical UTC ISO strings
- Preserves identifiers as strings, including leading zeros
- Keeps production technology in the domain enum representation

Normalization improves reliable comparisons. It does not prove that a value is true, and it does not perform unsafe spelling corrections such as silently changing an address.

The distinction is important:

```text
raw value          = what the registration app submitted
normalized value   = equivalent representation used by the rules
authoritative value = what SAP or another authoritative system reports
```

These values must not be collapsed into one field.

## 8. Local Validation Rules

Local validation runs before SAP verification.

### Schema rules

The JSON shape must contain the required fields with the correct primitive types. Unknown fields are rejected by the Zod schema so that spelling mistakes do not silently disappear.

### Required and conditional values

The following are required:

- `first_name`
- `last_name`
- `email`
- `is_business`
- `is_reverse_charge`
- Complete delivery address
- `subscription_reason`
- `production_type`
- `plant_capacity_kw`
- `contract_start_utc`
- `contract_end_utc`
- `building_id`

At least one of these must be present:

```text
market_location_identifier
tranche
```

Latitude and longitude must either both be present or both be absent.

### Value and range rules

The service checks:

- Email syntax
- Five-digit German postal code format
- Non-empty house number
- Capacity greater than zero and below the configured maximum
- Latitude between `-90` and `90`
- Longitude between `-180` and `180`
- Valid ISO timestamps
- Explicit timestamp timezone
- Contract start earlier than contract end
- Preferred start within the submitted contract period, when supplied

The service does not reject the example dates merely because they are historical or future relative to the current date. The relevant question is whether the dates are structurally valid and whether SAP says the installation was valid at the requested effective date.

### Identifier classification

The service classifies `market_location_identifier` as:

```text
MALO       exactly 11 digits
MELO       long identifier beginning with DE
UNKNOWN    anything else
```

The workbook appears to place long `DE...` values in a field named `market_location_identifier`. Therefore, the service reports a MeLo-like value as a warning rather than silently converting it.

This is deliberate. A MaLo and a MeLo are different business objects. Automatic conversion could connect the wrong plant, meter, or market location.

### Findings

Every finding includes:

- Stable rule ID
- Severity: `ERROR`, `WARNING`, or `INFO`
- Field where applicable
- Submitted value where useful
- Normalized value where useful
- Human-readable explanation
- Optional structured details

An `ERROR` prevents SAP verification and leads to `VALIDATION_FAILED`. Warnings are persisted and may still allow verification, but can influence the final decision.

## 9. SAP Verification Boundary

The rest of the application does not know whether SAP is accessed through OData, REST, RFC, an integration platform, or a replicated source. It calls the provider-neutral interface in:

```text
src/sap-integration/contracts/sap-verification.provider.ts
```

The current interface resolves an identifier at an effective date and returns a canonical authoritative location result.

The result can have one of these states:

- `FOUND`
- `NOT_FOUND`
- `MULTIPLE_MATCHES`
- `NOT_ACTIVE_AT_DATE`
- `SOURCE_UNAVAILABLE`
- `DATA_NOT_MAINTAINED`

The canonical result can contain:

- Identifier and identifier type
- VNB/network-area match
- Authoritative address
- Plant technology
- Plant capacity
- Plant status
- Connection object ID
- Authoritative building reference
- Valid-from and valid-to dates
- Source system and source record ID

### Why the interface is separate

SAP landscapes vary. One VNB may expose OData, another may expose RFC/BAPI through an integration layer, and some facts may be held in SAP Utilities while others are in a meter-data or grid-connection system.

The validation rules should not change when the transport changes. Only the provider adapter should change.

### Why direct SAP table access is not used

SAP database tables are implementation details. Direct table access would couple this service to a specific SAP version and customisation, bypass business logic, complicate authorization, and make upgrades risky.

The eventual production adapter should use an approved SAP API or integration layer and should return the canonical provider response used by this application.

## 10. Mock SAP Provider

The default configuration is:

```text
SAP_PROVIDER=mock
```

The mock provider is deterministic. It does not make random decisions and does not claim to be real SAP verification.

Normal identifiers return a representative successful location. Identifiers containing these strings trigger known scenarios:

| Identifier fragment | Mock result |
|---|---|
| `NOTFOUND` | `NOT_FOUND` |
| `UNAVAILABLE` | `SOURCE_UNAVAILABLE` |
| `MULTI` | `MULTIPLE_MATCHES` |
| `INACTIVE` | `NOT_ACTIVE_AT_DATE` |
| `MISMATCH` | Found record with intentionally different type/plant values |

This makes it possible to exercise the decision paths without SAP credentials.

The `odata` provider can be selected with:

```text
SAP_PROVIDER=odata
```

It is intentionally a safe placeholder. Until the VNB supplies an approved SAP contract and authentication configuration, it returns `SOURCE_UNAVAILABLE` rather than pretending to verify anything.

## 11. Verification Comparisons

After a successful local validation, the service compares submitted values with authoritative values.

The current checks cover:

- Identifier result and existence
- Identifier type
- Network/VNB match
- Address street
- Address house number
- Postal code
- City
- Plant technology
- Plant capacity
- Building reference

### Address policy

Address text is normalized for whitespace and case. The service compares components separately.

House-number and postal-code mismatches are treated as errors. Other textual differences are warnings or manual-review signals rather than automatically corrected.

### Capacity policy

Capacity mismatches use configurable tolerance:

```text
CAPACITY_ABSOLUTE_TOLERANCE_KW=0.1
CAPACITY_RELATIVE_TOLERANCE_PERCENT=1
```

The effective tolerance is the larger of the configured absolute and relative tolerance. This avoids rejecting harmless rounding differences while still detecting meaningful disagreements.

### Effective date

The service uses:

```text
preferred_delivery_start
```

when supplied. Otherwise, it uses:

```text
contract_start_utc
```

This date is passed to the provider because a current SAP status is not necessarily the status that applied on the requested start date.

Validity is interpreted as a half-open interval:

```text
valid_from <= effective_at < valid_to
```

An absent `valid_to` means open-ended.

## 12. Decisions and Statuses

The request workflow uses:

- `RECEIVED`
- `VALIDATING`
- `VALIDATION_FAILED`
- `VERIFICATION_IN_PROGRESS`
- `SOURCE_UNAVAILABLE`
- `VERIFIED`
- `MANUAL_REVIEW`
- `REJECTED`

The final decision is derived centrally from findings and provider results.

### `VALIDATION_FAILED`

The request cannot safely be processed because its shape or local values are invalid.

Examples:

- Missing both identifier and tranche
- Invalid timestamp
- Invalid postal code
- Reversed contract dates
- Unknown identifier structure

### `VERIFIED`

The mock/authoritative provider found the record and all mandatory comparisons passed.

With the mock provider, this means the mock scenario passed. It must not be presented as real external verification.

### `MANUAL_REVIEW`

The data is present but ambiguous, conflicting, or requires an operational decision.

Examples:

- Multiple SAP matches
- Capacity mismatch outside tolerance
- Technology mismatch
- Nonfatal address discrepancy
- Identifier not found where the business process permits investigation

### `REJECTED`

The configuration should not proceed because a blocking authoritative condition failed.

The current implementation rejects definitive blocking comparisons such as a wrong network match or an error-severity mismatch.

### `SOURCE_UNAVAILABLE`

The authoritative source could not be reached or configured. This is not a business rejection. The request can be retried.

This distinction prevents a SAP outage from incorrectly rejecting a valid applicant.

## 13. API

### Create verification

```http
POST /api/v1/producer-verifications
Content-Type: application/json
Idempotency-Key: crm-producer-00789
```

The response is normally:

```http
202 Accepted
```

```json
{
  "verification_id": "uuid",
  "status": "VERIFICATION_IN_PROGRESS",
  "received_at": "2026-10-15T10:30:00.000Z"
}
```

The request can be rejected synchronously with `400` when its JSON shape or local business data contains blocking errors. The semantically valid request is still persisted before that final validation result is returned.

### Idempotency

`Idempotency-Key` is mandatory.

The backend calculates a SHA-256 hash over deterministic canonical JSON. Object keys are sorted before hashing, so equivalent key ordering produces the same hash.

The same key and same payload return the original verification ID. The same key with a different payload returns `409 Conflict`.

This prevents retries by the registration app from creating duplicate verification requests.

### Get result

```http
GET /api/v1/producer-verifications/{verification_id}
```

The result includes:

- Current workflow status
- Final decision, when available
- Schema version
- Receipt timestamp
- Local validation status and findings
- SAP verification status and checks

Submitted and authoritative values are shown separately.

### Retry

```http
POST /api/v1/producer-verifications/{verification_id}/retry
```

Retry is currently allowed for `SOURCE_UNAVAILABLE` requests. It resets the verification state and enqueues the provider call again.

### Health

```http
GET /health/live
GET /health/ready
```

`live` confirms that the process is running. `ready` checks database connectivity.

### Swagger

Swagger is available at:

```text
http://localhost:3000/docs
```

It is enabled by default unless `SWAGGER_ENABLED=false`.

## 14. Persistence Model

The Prisma schema defines four core models.

### `VerificationRequest`

Stores the submitted application, normalized payload, hash, status, decision, and lifecycle timestamps.

The unique `idempotencyKey` is enforced by PostgreSQL, not only by application code.

### `ValidationFinding`

Stores local validation failures, warnings, and informational findings. Findings belong to the request and are deleted with it.

### `VerificationCheck`

Stores each comparison with the authoritative provider:

- Rule ID
- Submitted value
- Authoritative value
- Result
- Severity
- Source system
- Source record ID
- Effective date
- Check timestamp
- Structured details

This is why a SAP value is not written over the submitted value. The comparison itself is evidence.

### `IntegrationAttempt`

Stores provider call metadata:

- Provider
- Operation
- Attempt number
- Correlation ID
- Technical status
- Start and completion time
- Error code/message where relevant
- Minimized request/response metadata

Credentials and full sensitive provider payloads must not be logged.

## 15. Why the Process Is Asynchronous

The API does not hold the registration application request open while waiting for SAP.

The sequence is:

```text
POST request
  -> validate request shape
  -> hash and enforce idempotency
  -> store raw and normalized data
  -> enqueue job
  -> return verification ID

worker job
  -> call SAP provider
  -> store integration attempt
  -> compare values
  -> store checks
  -> derive decision

registration application
  -> GET verification result
```

This design handles slow SAP responses, temporary outages, and retry behavior without making a technical outage look like a business rejection.

## 16. Configuration

Copy `.env.example` to `.env`.

| Variable | Purpose |
|---|---|
| `NODE_ENV` | `development`, `test`, or `production` |
| `PORT` | HTTP port, default `3000` |
| `DATABASE_URL` | Prisma PostgreSQL connection string |
| `JOB_DATABASE_URL` | PostgreSQL connection for `pg-boss`; defaults to `DATABASE_URL` |
| `SAP_PROVIDER` | `mock` or `odata` |
| `SAP_BASE_URL` | Future approved SAP API base URL |
| `SAP_CLIENT_ID` | Future SAP authentication configuration placeholder |
| `SAP_CLIENT_SECRET` | Future SAP authentication configuration placeholder; never commit it |
| `SAP_REQUEST_TIMEOUT_MS` | Future provider timeout |
| `SAP_RETRY_COUNT` | Future provider retry count |
| `CAPACITY_ABSOLUTE_TOLERANCE_KW` | Absolute capacity comparison tolerance |
| `CAPACITY_RELATIVE_TOLERANCE_PERCENT` | Relative capacity comparison tolerance |
| `EXPECTED_NETWORK_OPERATOR_ID` | Configured VNB identity used by the future provider policy |
| `SWAGGER_ENABLED` | Enables/disables Swagger |
| `AUTH_ENABLED` | Reserved hook for real bearer-token authentication |

The current mock provider does not need real SAP credentials.

## 17. Local Setup

Requirements:

- Node.js 20 or later
- npm
- Docker Desktop or another Docker installation for PostgreSQL

Install dependencies:

```powershell
npm.cmd install
```

Create local configuration:

```powershell
Copy-Item .env.example .env
```

Start PostgreSQL:

```powershell
```

Generate Prisma Client:

```powershell
npm.cmd exec prisma generate
```

Create/apply the development migration:

```powershell
npm.cmd exec prisma migrate dev --name init
```

Start the API:

```powershell
npm.cmd run start:dev
```

Submit the example payload:

```powershell
$body = Get-Content .\examples\producer-onboarding.json -Raw
Invoke-RestMethod -Method Post `
  -Uri http://localhost:3000/api/v1/producer-verifications `
  -Headers @{ 'Idempotency-Key' = 'crm-producer-00789' } `
  -ContentType 'application/json' `
  -Body $body
```

Then retrieve the returned verification ID:

```powershell
Invoke-RestMethod -Method Get `
  -Uri http://localhost:3000/api/v1/producer-verifications/{verification_id}
```

## 18. Development Commands

```powershell
npm.cmd run start:dev       # Start NestJS in watch mode
npm.cmd run build           # Compile TypeScript
npm.cmd test                # Run Jest tests
npm.cmd run lint            # Run ESLint
npm.cmd run format          # Format source and JSON
npm.cmd exec prisma generate
npm.cmd exec prisma validate
npm.cmd exec prisma migrate dev --name <migration-name>
npm.cmd exec prisma migrate deploy
```

## 19. Testing

The current tests cover:

- Normalization of producer data
- Lowercasing of email addresses
- Reporting a MeLo-shaped identifier
- Missing identifier/tranche condition
- Reversed contract dates
- Malformed timestamps becoming structured findings instead of runtime errors

The intended next integration-test layer should cover:

- API creation and retrieval
- Same-key idempotent retries
- Idempotency conflicts
- Mock SAP full match
- Mock SAP mismatch and manual review
- Wrong network match and rejection
- SAP unavailable and retry
- PostgreSQL persistence of checks and attempts

## 20. Data Still Needed for Real Verification

The onboarding payload is enough for local validation, but it is not enough to prove that the plant and location are real, correctly connected, or eligible. The following data would be needed from the hypothetical SAP/VNB landscape or other authoritative systems.

### Identifier master data

- Canonical MaLo ID
- Canonical MeLo ID
- Explicit identifier type for every identifier
- MaLo-to-MeLo relationship
- Import/export/generation role of each location
- Valid-from and valid-to dates
- Identifier status: active, inactive, blocked, retired
- Source-system record ID

**Why it is needed:** The workbook field is semantically ambiguous and appears to contain MeLo-shaped values. Explicit types and relationships prevent the backend from joining a plant or meter to the wrong market object.

### VNB responsibility and network area

- Authoritative grid-operator/VNB market-partner ID
- Network-area membership
- Connection point or grid-connection ID
- Grid level where relevant
- Effective dates for network responsibility

**Why it is needed:** A syntactically valid location can still belong to another VNB. The backend must not approve an onboarding request for an area it does not operate.

### Connection topology

- Connection object ID
- Premise or building reference
- Network connection point
- Approved metering concept ID
- Relationships between generation, household, residual-supply, import, and export locations
- Validity period of the topology

**Why it is needed:** A shared `building_id` from the registration application does not prove that locations are physically or operationally related. Topology data verifies that the proposed group is a real VNB configuration.

### Plant master data

- Authoritative plant/unit ID
- Technology
- Installed capacity
- Approved grid-connection capacity
- Commissioning date
- Decommissioning date, if applicable
- Operational status
- Export limitation, if applicable
- Plant registration reference where applicable
- Technical-resource or controllability reference where applicable

**Why it is needed:** This verifies that the declared solar/wind/etc. plant exists, is active at the requested date, and has the declared capacity. It also makes capacity plausibility checks meaningful.

### Meter and device data

- Meter number
- MeLo assignment
- Register or OBIS reference
- Import/export direction
- Metering-system type
- Device installation and removal dates
- Metering operator/MSB identifier
- Meter status

**Why it is needed:** The current producer payload does not identify the physical measurement device. A plant can have a valid market location but still have a changed, removed, or incorrectly assigned meter.

### Contract and activation data

- Accepted activation start
- Accepted activation end, if applicable
- Technical approval status
- Contract status
- Contract effective dates
- Plant/operator authorization reference
- Existing active supplier or sharing configuration
- Conflicting or blocked contract status

**Why it is needed:** `preferred_delivery_start` is only the applicant’s requested date. SAP/VNB data must confirm when the configuration is actually accepted and operational. This prevents activation before technical or contractual prerequisites are complete.

### Party and authorization data

- Authoritative business-partner ID
- Producer/operator relationship
- Authorization to act for the plant or connection
- Supplier role
- Metering-operator role
- VNB role
- Effective dates for each role

**Why it is needed:** A person can submit a valid-looking payload without being authorized to register the plant. Identity and technical existence are separate checks.

### Market-partner data

- Stable market-partner identifiers
- Party names and roles
- Validity periods
- Communication endpoint or routing reference where applicable

**Why it is needed:** Names such as `DSK GmbH` or `Tawanir` are not sufficient identifiers for reliable market communication. Stable IDs avoid ambiguity and spelling problems.

### Evidence and provenance

- Source system
- Source record ID
- Source-record version
- Last changed timestamp in the source
- Retrieval timestamp
- Verification timestamp
- Rule version used for the comparison

**Why it is needed:** The VNB must be able to explain which authoritative record supported a decision and what information was available at the time.

## 21. Data Not Needed From SAP for This Minimal Backend

The following may be useful in a wider operational system but are not required for the current producer onboarding verification decision:

- Participant hourly consumption
- Generation interval readings
- Retail tariffs
- Market prices
- Billing amounts
- Metering fees
- Household participation records
- Financial settlement rules

Those belong to later participant, metering, allocation, or settlement workflows. Adding them now would make this minimal verification service larger without improving producer onboarding verification.

## 22. Important Limitations

### Mock verification is not external verification

With `SAP_PROVIDER=mock`, the service demonstrates behavior but cannot prove that a real location or plant exists.

### The current provider interface is intentionally narrow

The current implementation resolves an identifier and returns a combined canonical record. A production implementation may need separate provider operations for location, plant, topology, meter, contract, and authorization records.

### The current service does not process Excel uploads

The workbook was inspected to define the JSON contract. The production registration application is expected to send JSON. Excel support could be added as a separate controlled ingestion adapter if required.

### The current service does not make legal eligibility decisions

It validates configured technical and data-quality rules. The exact legal eligibility criteria depend on the selected German model, the VNB’s role, market-process decisions, and the authoritative SAP/data landscape.

### Authentication is a hook, not a production identity integration

The repository contains configuration for enabling authentication, but a real deployment must connect the API to the organization’s identity provider and service-to-service authorization model.

## 23. Production Integration Next Steps

1. Identify the exact SAP product/version and the owner of each authoritative fact.
2. Create a source-of-truth matrix for MaLo, MeLo, meter, plant, topology, contract, and authorization data.
3. Define the approved SAP OData/REST or integration-layer contract.
4. Implement the real provider behind `SapVerificationProvider`.
5. Add response-schema validation for every SAP response.
6. Add real authentication, TLS, timeouts, retries, and rate limits.
7. Add PostgreSQL integration tests using a disposable database.
8. Define the VNB’s exact blocking/manual-review policy with business and regulatory owners.
9. Add audit retention and GDPR controls.
10. Recheck activation-critical SAP data immediately before accepting an activation date.

The key design principle is to keep the submitted claim, normalized representation, authoritative SAP value, and verification decision separate. That separation is what allows the VNB to validate data, verify it against the correct source, explain the result, and correct the integration later without losing the original evidence.
