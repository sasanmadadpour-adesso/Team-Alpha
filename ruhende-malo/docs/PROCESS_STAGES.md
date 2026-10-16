# Process stages — what happens in each stage

The pipeline has **six stages**. They map 1:1 to the solution map *Marktrolle VNB*, the process description `Prozessschritte.pdf` and the requirements FR-01 to FR-25.

- The overview card of each construct shows them as a rail with counters.
- The construct page shows them as a timeline.
- The case drawer shows the same steps for a single MaLo.
- In the app: **Übersicht → Ablauf erklärt** (`#/ablauf`).

| # | Stage | Solution map | PDF | FRs |
|---|---|---|---|---|
| 1 | Anmeldung | Anmeldung Konstrukt | — | FR-01, FR-02, FR-05 |
| 2 | Prüfung & Korrektur | Prüfung der Daten, Korrektur Daten | — | FR-03, FR-04, FR-10, FR-20 |
| 3 | Aufbau vSZ | Aufbau vSZ / Übergabezähler | Steps 1–4.7 (pp. 2–9) | FR-06 |
| 4 | Voraussetzungen | (inside Prüfung / Aufbau vSZ) | Step 3 iMSys, §6.3 MCM | FR-09, FR-11 |
| 5 | MeMa / MaMa → ruhend | Umstellung auf ruhende MaLo inkl. MeMa/MaMa | §6.1, §6.2, §6.3 (pp. 10–16) | FR-07, FR-08, FR-12, FR-21, FR-22 |
| 6 | Übergabe | Einzug Reststrom Lieferant (UTILMD), Schlussrechnung (INVOIC), Anpassung EDM | §5 (p. 10) | FR-22 |

Principle for all stages: **a finding stops only the affected MaLo** (or, for construct-level problems, only that construct). Every manual decision needs a reason and is written to the audit log. After a decision or a status input, processing **continues automatically**.

---

## 1 · Anmeldung (registration)

**Input:** the sheet `MK7 Teilnehmer` of the workbook (import or reset), or `POST /api/v1/registerConstruct` (JSON).

**What happens automatically**
- Import / API registration only **receives** the list. The stage turns green when the process takes it over (first run). Before that it shows *Eingegangen*.
- Every row is normalized: building, role, Teilnahme, MaLo, MeLo, Einspeise-MaLo and dates. IDs stay strings and Excel dates are converted without timezone shifts.
- One **construct per building** (`gebaeude_id`) is created.
- The building's **Reststrom-MaLo** is derived from the row with role `Marktlokation Reststrom` (never hard-coded).
- The **Stichtag** is the earliest `mk7_versorgungsbeginn_utc` of the participating households (a demo default that can be changed with `setStichtag`).
- Household MaLos start as **ACTIVE** (documented assumption).
- The checklist for stage 3 is created (10 items).
- A registration through the API is processed immediately (event-driven). An import or reset waits for **Prozess starten**.

**By you:** nothing.
**Result:** construct with participants, Reststrom-MaLo and Stichtag. Audit event `REGISTER_CONSTRUCT`.

## 2 · Prüfung & Korrektur (validation and correction)

**What happens automatically:** rules V01–V14 run on all constructs together, because cross-construct rules need the full picture.

| Rule | Check | Severity | Blocks |
|---|---|---|---|
| V01 | Required fields (role, MaLo, MeLo) | Error | that MaLo |
| V02 | MaLo-ID 11 digits, first 1–9; MeLo-ID 33 characters `DE…` | Error | that MaLo / generator |
| V03 | BDEW check digit (Lok- und Waggon method) | Notice | nothing (the workbook IDs are synthetic) |
| V04 | Exactly one Reststrom-MaLo per construct | Error | the construct |
| V05 | Same MaLo in several constructs | Decision | that MaLo |
| V06 | Same MeLo on several MaLos | Decision | the affected rows |
| V07 | Teilnahme is Ja or nein | Error | that MaLo |
| V08 | Generator has an Einspeise-MaLo | Error | that generator |
| V12 | Valid Stichtag; no overlapping dormant Zeitscheibe | Error | the construct / MaLo |
| V13 | At least one participating household | Error | the construct |
| V14 | One Einspeise-MaLo used by several constructs | Decision | Einspeise-MeMa of those generators |

(V09–V11 belong to stage 4.)

**By you (Korrektur Daten), each decision with a reason, audited (`RESOLVE_ISSUE`), followed by an automatic re-check and continuation:**
- *Choose construct* (V05): the other assignment is excluded, not deleted.
- *Correct value* (V01/V02/V07/V08/V12), with live validation in the UI.
- *Exclude participant.*
- *Confirm* (V14).

**Result:** validated participants. Statuses: `DECISION`, `CORRECTION`, otherwise the MaLo continues.

## 3 · Aufbau vSZ (virtual summation meter setup)

**What "simulated" means here:** the demo has **no SAP connection**. Steps that happen in SAP in reality are **executed by the pipeline in a simulated SAP** (the local database) with the parameters the process description prescribes. The result of each step is recorded and shown. Whatever can be verified against our own data is really verified.

When the process runs, each step gets one of these outcomes:

| Step | PDF | What the pipeline does | Outcome |
|---|---|---|---|
| 1 Messkonzepte | p. 2 | Checks whether the DSO-DP order exists (C1001_M001 per Bezugs-MeLo, C1003_M001 per generator) | `CONFIRMED` (DSO-DP, simulated) or `UNKNOWN` |
| 2 Steckbriefe | p. 2 | Verifies the participant list: number of metering points, tenants, operator | `CHECKED` (data) |
| 3 iMSys | p. 2 | Counts participating Bezugs-MeLos with an iMSys | `CHECKED`, or `PARTIAL` (the rest is handled per MaLo in stage 4) |
| 4.1 Reststrom-MaLo + Anlage | pp. 2–3 | Verifies there is exactly one Reststrom-MaLo, then creates the Anlage (ES30): Stichtag, Sparte 01, AbrKl SLP, Tariftyp ES001, Serviceart 1001, Netzebene 01 | `DONE`, or `MISSING` |
| 4.2 Geräteinfosatz | p. 4 | Creates device `VG-<MaLo>`, material 117-1000002, Sparte 01, billing installation OBIS 1.8.0 (EG34) | `DONE` |
| 4.3 Zählpunktart | p. 5 | Sets Zählpunktart Marktlokation, description VBZS | `DONE` |
| 4.4 Lastprofil | p. 6 | Assigns load profile SLP to the Reststrom-MaLo Anlage from the Stichtag | `DONE` |
| 4.5 ZP-Status | p. 7 | Dates the ZP status to the IBN date (= Stichtag). Setup only, not the dormancy mechanism | `DONE` |
| 4.6 Bilanzierung | p. 8 | Stores SETTLEMALO data (KN-L), Zählverfahren E02 | `DONE` |
| 4.7 Services | p. 9 | Creates BIKO and MSB services via the maintenance transaction (the PDF says `/EKN/ESERVICE_UPD` did not work) | `DONE` |

Steps 4.2–4.7 are only executed when 4.1 succeeded. Audit event: `VSZ_SETUP`.

**By you:** for steps the pipeline can't complete (e.g. step 1 for a construct registered via API, which has no DSO-DP order), confirm with evidence (`confirmVsz`). A person's confirmation is never overwritten by a later run.
**Gate:** while a step is `UNKNOWN` or `MISSING`, no participant of this construct is switched (`VSZ_NOT_READY`). Other constructs continue. When the construct passes the gate, the event `EDM_ANPASSUNG` is recorded.

## 4 · Voraussetzungen (prerequisites per MaLo)

This is checked per participating MaLo:
- **V10 iMSys** at the Bezugs-MeLo (`INSTALLED`). A virtual summation meter needs an iMSys at every participating MeLo.
- **V11 Abmeldung:** the current supplier has deregistered the MaLo (`CONFIRMED`, UTILMD deregistration). A MaLo that still has a supplier cannot become ruhend.
- **V09 MCM** for generators (`COMPLETED`). The Einspeise-MeMa may only be maintained after the MCM process (PDF §6.3).

**Automatically:** at run time the status is read from the (simulated) SAP state. Only values that are still UNKNOWN are filled, so status inputs and manual confirmations are never overwritten. A status input from SAP / market communication / MSB (`POST /updateSapState`) clears the finding and **continues processing immediately**.
**By you (only if needed):** record the status in the case drawer, or confirm manually with a reason (`CONFIRMED_MANUAL`, audited).
**Result:** MaLos cleared for the switch. Otherwise the status is `WAITING`.

## 5 · MeMa / MaMa → ruhend

These are the PDF's core steps, executed per cleared MaLo:
- **§6.1 MeMa:** from the Reststrom-MaLo to **every participating Bezugs-MeLo**.
- **§6.2 MaMa:** each participating Bezugs-MaLo → Reststrom-MaLo, **Zeitscheibe from the Stichtag to 31.12.9999** (half-open `[from, to)`). Blocked if an open MaMa already points to another target.
- **§6.3 Einspeise-MeMa:** Einspeise-MaLo → the cleared Bezugs-MeLos. **MeMa only, never MaMa**, and only after MCM.
- Then the business state becomes **RUHEND** from the Stichtag (a new lifecycle period; the ACTIVE period is closed).
- **Read-back:** relationships and state are read back before `SUCCESS` is reported. A failed check rolls the transaction back.
- **Idempotent:** the key `SET_DORMANT|MaLo|construct|Stichtag` makes a repeat return `ALREADY_DONE`, with no duplicate relationships or audit events.

**By you:** nothing. Later lifecycle actions in the case drawer:
- *Wiederaktivierung:* RUHEND → ACTIVE.
- *Herauslösung:* closes MeMa/MaMa and removes the MaLo from the construct.
- *Korrektur:* moves the date.
- *Rücknahme:* compensating transition.

**Result:** ruhende MaLos with MeMa and MaMa. Status `DONE`. Audit events `SET_DORMANT`, `MAINTAIN_EINSPEISE_MEMA`.

## 6 · Übergabe (handover)

- **§5 relationship list** for billing: `GET /Constructs/{id}/relationshipList()` or the CSV download on the construct page.
- **`UTILMD_EINZUG_RESTSTROM_LIEFERANT`:** recorded **after the first ruhende MaLo** of the construct. In market practice, the virtual MaLo is assigned to the Reststrom supplier only after the first ruhende MaLo is confirmed.
- **`INVOIC_SCHLUSSRECHNUNG`:** one per ruhende MaLo (final bill for the previous supply).
- **`EDM_ANPASSUNG`:** when the construct passes the vSZ gate.

All events are written to `GET /Outbox` with status `NOT_IMPLEMENTED`. They define the interface to the follow-up processes and are **not sent**.

---

## How the stage indicators are computed (UI)

| Stage | Counter | Green when |
|---|---|---|
| 1 | Participants | taken over by the first run |
| 2 | Open decisions/corrections | validated and none open |
| 3 | vSZ steps done `x/10` | all 10 executed, checked, partial or confirmed |
| 4 | Participants with prerequisites met `x/y` | all met |
| 5 | Ruhende households `x/y` | all ruhend |
| 6 | Handover events | UTILMD recorded and all households ruhend |

Amber means waiting for a status, violet means a decision is needed, grey means not reached yet.
