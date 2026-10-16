# Functionality Overview

This document explains, in plain terms, what the application actually checks,
why each check exists, and what every possible response means. For setup and
API usage instructions, see [`README.md`](./README.md).

## What the Application Does

A VNB (German distribution network operator) receives producer onboarding
data from an external application — for example, when someone wants to
register a solar or wind plant for a Mieterstrom/energy-sharing setup. Before
that onboarding can proceed, the data needs to be checked in two different
ways:

```text
1. Validation   — Is the submitted data well-formed and usable?
2. Verification — Does the submitted data agree with the VNB's own records?
```

This application performs both steps for a single onboarding request and
returns one combined result immediately.

```text
Onboarding application
        |
        | submits producer data
        v
   VALIDATION            (checks the data by itself)
        |
        v
   VERIFICATION           (checks the data against authoritative records)
        |
        v
   DECISION               (one clear status + recommended next action)
        |
        v
Response sent back to the onboarding application
```

## Why Two Separate Steps?

**Validation** can be done instantly using only the submitted form. It
answers: *"Does this look like a real, usable application?"* For example, an
email address that is missing the `@` symbol is invalid regardless of
anything else — no external check is needed to know that.

**Verification** answers a different question: *"Is what was submitted
actually true, according to the VNB's own authoritative records?"* A
capacity of `6 kW` is a perfectly valid number, but that alone doesn't prove
the plant is really 6 kW. Verification compares the claim against the
record the VNB holds for that installation (in this demo, a mock SAP
record standing in for the real system).

Validation always runs first. If the submitted data itself is broken,
there's no point comparing it against VNB records — the applicant needs to
fix the obvious problems first. Verification only happens once validation
passes.

---

## Part 1: Validation Checks

Validation looks only at the submitted request. Nothing is compared against
external records at this stage.

| # | Check | What it looks for | Why it matters |
|---|---|---|---|
| 1 | **Required fields present** | Name, email, address, technology, capacity, contract dates, building ID are all supplied and not empty/blank | An onboarding record missing basic information cannot be processed at all |
| 2 | **Email format** | The email looks like `someone@example.com` | Prevents obviously broken contact information from entering the system |
| 3 | **Postal code format** | Exactly 5 digits | German postal codes are always 5 digits; anything else is a typo or wrong country format |
| 4 | **Plant capacity** | A number greater than zero | A plant with zero or negative capacity cannot be a real generation installation |
| 5 | **Coordinates** | Latitude and longitude are either both present or both absent, and within valid Earth ranges (`-90..90`, `-180..180`) | Half a coordinate pair is useless; out-of-range values indicate a data entry or unit error |
| 6 | **Contract timestamps valid** | Start and end dates are real, parseable dates with an explicit timezone | Ambiguous dates (no timezone) could be misread as a different day depending on where the system runs |
| 7 | **Contract start before end** | `contract_start_utc` is earlier than `contract_end_utc` | A contract that ends before it starts is logically impossible |
| 8 | **Preferred start within contract period** | If supplied, the requested delivery start falls inside the contract window | The applicant can't request to start before the contract begins or after it ends |
| 9 | **Allowed category values** | `subscription_reason` is `E01`/`E02`/`E03`; `production_type` is `Solar`/`Wind`/`Gas`/`Hydro`/`Battery` | Only known, supported categories can be processed downstream |
| 10 | **Identifier or tranche supplied** | At least one of `market_location_identifier` or `tranche` is present | Without either, there is no way to identify which plant/location is being registered |
| 11 | **Identifier type is supported** | If only a `tranche` is given (no identifier), this is rejected with an explanation | This demo can only verify installations by `market_location_identifier` — tranche-based lookup isn't implemented, so it's better to say so clearly than to silently skip verification |
| 12 | **Identifier structure (MaLo/MeLo)** | The identifier is classified as `MALO` (11 digits), `MELO` (starts with "DE", longer form), or `UNKNOWN` | German energy-market identifiers come in two different formats that mean different things. The submitted data in this demo actually contains MeLo-shaped values in a field called "market location identifier" — the system flags this mismatch instead of silently treating one as the other |

### What Validation Does *Not* Check

Validation never asks "is this true?" — only "is this well-formed?" For
example, it confirms an email *looks* valid, but does not confirm it
belongs to the applicant. That question belongs to verification (or, for
fields verification doesn't cover, remains simply unconfirmed).

### Small, Safe Corrections (Normalization)

Before validation runs, a few harmless cleanups happen automatically:

- Extra spaces are trimmed and collapsed (`"  Jan   Koller "` → `"Jan Koller"`)
- Email addresses are lowercased for comparison
- Blank optional fields become `null` instead of an empty string
- Valid timestamps are converted to a consistent UTC format

These are purely cosmetic and never change the *meaning* of the data —
addresses are never auto-corrected, and identifiers are never rewritten.

---

## Part 2: Verification Checks

Verification only runs if validation passed. It compares the submitted data
against an authoritative record (in production, this would be a real SAP
lookup; in this demo, it's a small set of mock records standing in for SAP).

| # | Check | Compared against | Why it matters |
|---|---|---|---|
| 1 | **Identifier exists** | The submitted identifier vs. the authoritative record's identifier | Confirms the location actually exists in the VNB's system — not just that it *looks* like a valid identifier |
| 2 | **Identifier type matches** | Detected type (MaLo/MeLo) vs. the authoritative type | Prevents a MeLo (metering point) from being mistakenly treated as a MaLo (market location), which are different business objects |
| 3 | **Network operator is this VNB** | A fixed value representing this VNB vs. the record's registered operator | The VNB must not approve an onboarding for a location that actually belongs to a *different* network operator |
| 4 | **Address matches** | Street, house number, postal code, city | Confirms the physical installation address matches what the VNB has on record (comparison ignores case and extra whitespace, but does not guess or auto-correct typos) |
| 5 | **Production technology matches** | `Solar`/`Wind`/etc. submitted vs. registered | The declared generation technology must match what is actually registered for that plant |
| 6 | **Plant capacity matches** | Submitted kW vs. registered kW, allowing a small tolerance of `±0.1 kW` | Confirms the applicant is describing the real, registered plant and not a different one (the tiny tolerance only absorbs rounding, not real discrepancies) |
| 7 | **Building reference matches** | Submitted `building_id` vs. registered building reference | Confirms the plant is linked to the correct building/energy-sharing group |
| 8 | **Active at the requested date** | The requested delivery date vs. the record's active status and valid-from/valid-to window | A plant that is not yet active, or no longer active, on the requested date should not be approved for that date |

Each individual check in the result includes the submitted value, the
authoritative value, whether they matched, a plain message, and an
explanation of *why* that particular check matters — so the result is
fully explainable rather than a single opaque pass/fail.

### What Is *Not* Verified in This Demo

Some submitted fields have no equivalent in the authoritative mock record,
so they are never claimed to be "verified" even though they may have passed
local validation:

- Salutation
- Product name
- Internal SaaS customer/contract IDs
- Reverse-charge tax status

This distinction matters: the response is always honest about what was
actually checked against an authority, versus what was only checked for
good formatting.

---

## Part 3: The Possible Outcomes

Every request produces exactly one of six outcomes. Each one comes with a
suggested action for the onboarding application to take.

### ✅ `VERIFIED`

**What happened:** Validation passed, an authoritative record was found,
and every verification check matched.

**Why:** This is the fully successful case — everything the applicant
submitted agrees with the VNB's own records.

**Suggested action:** `CONTINUE` — proceed with onboarding.

---

### ❌ `VALIDATION_FAILED`

**What happened:** One or more validation checks failed (missing field,
bad email format, invalid dates, tranche-only submission, etc.), or the
request body wasn't even valid JSON.

**Why:** The data itself is unusable, so there's no point comparing it
against anything yet.

**Suggested action:** `CORRECT_DATA` — show the applicant exactly which
fields are wrong (the response lists each failing check) and ask them to
resubmit.

---

### ⚠️ `MANUAL_REVIEW`

**What happened:** Validation passed, a matching authoritative record was
found, and the location belongs to this VNB — but at least one other
verification check didn't match (e.g. a different address, capacity, or
technology than what's on file).

**Why:** The data is plausible but disagrees with VNB records in a way
that an automated system shouldn't resolve on its own. It could be a typo,
an outdated plant record, or a genuinely different installation — a human
needs to look at it.

**Suggested action:** `PAUSE_FOR_REVIEW` — hold the application and route
it to VNB staff for a manual decision, showing them exactly which fields
disagreed and why each one matters.

---

### 🛑 `REJECTED`

**What happened:** An authoritative record was found, but it belongs to a
*different* network operator, not this VNB.

**Why:** This is the one case in the current rule set treated as a
definite blocker rather than something worth reviewing — this VNB simply
has no authority over that location.

**Suggested action:** `STOP` — do not proceed; the applicant likely needs
to contact the correct network operator.

---

### ❓ `NOT_VERIFIABLE`

**What happened:** Validation passed, but no authoritative record could be
found for the submitted identifier at all.

**Why:** The identifier might be mistyped, the plant might not yet be
registered in the VNB's system, or (in this demo) it simply isn't one of
the known mock identifiers. Either way, there's nothing to compare against.

**Suggested action:** `REQUEST_CLARIFICATION` — ask the applicant to
double-check the identifier, or flag the case for someone to look up the
location manually.

---

### 🔌 `SOURCE_UNAVAILABLE`

**What happened:** The lookup against the authoritative source itself
failed (a connection problem, timeout, or outage) — not a mismatch in the
data.

**Why:** This is deliberately kept separate from every other outcome. A
temporary technical failure in reaching SAP (or the mock standing in for
it) is not the applicant's fault and should never be confused with a
rejected or unverifiable application.

**Suggested action:** `RETRY_LATER` — the onboarding application should
try again after a short delay rather than asking the user to change
anything.

---

## Why the Outcomes Are Kept Separate Like This

It would be simpler to collapse everything into a single "pass/fail," but
that would hide important differences in *who* needs to act and *what* they
need to do:

| If we only had pass/fail... | We'd lose the distinction between... |
|---|---|
| "Fail" | A typo the applicant can fix themselves (`VALIDATION_FAILED`) vs. a conflict only VNB staff can resolve (`MANUAL_REVIEW`) vs. a hard "no" (`REJECTED`) |
| "Fail" | A problem with the *data* vs. a problem with the *connection to SAP* (`SOURCE_UNAVAILABLE`) — the second one should never block or blame the applicant |
| "Fail" | "We don't know yet" (`NOT_VERIFIABLE`) vs. "we know, and it's wrong" (`REJECTED`) |

Separating these outcomes means the onboarding application (and ultimately
VNB staff) always knows exactly what kind of problem occurred and who is
responsible for resolving it next.

## HTTP Status Codes

| Outcome | HTTP status | Reasoning |
|---|---|---|
| `VERIFIED`, `MANUAL_REVIEW`, `REJECTED`, `NOT_VERIFIABLE` | `200 OK` | The request was processed successfully — these are *business* outcomes, not technical errors |
| `VALIDATION_FAILED` | `400 Bad Request` | The request itself was malformed or incomplete |
| `SOURCE_UNAVAILABLE` | `503 Service Unavailable` | A technical/infrastructure failure, not a judgment about the data |

A rejected or flagged-for-review application is still a *successfully
processed* request from the API's point of view — only genuinely broken
requests or technical outages change the HTTP status.
