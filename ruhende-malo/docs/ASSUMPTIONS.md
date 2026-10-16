# Assumptions and Limitations

Everything in this application is a **local simulation**. There is no SAP connection; the SAP adapter fails closed with `NOT_CONFIGURED`. No result is ever labeled `SAP_VERIFIED`.

## Scope (solution map "Marktrolle VNB")

- **MVP boxes implemented:** Anmeldung Konstrukt, Prüfung der Daten, Korrektur Daten (manual lane), Konstrukt Übersicht, Umstellung auf ruhende MaLo inkl. MeMa/MaMa.
- **Aufbau vSZ (PDF pp. 2–9):** executed by the pipeline in stage 3 **in the simulated SAP**, with the parameters from the PDF, and verified against the data where possible (see `docs/PROCESS_STAGES.md`). Nothing is written to a real SAP system. Step 1 (DSO-DP order) comes from the simulated state; unknown constructs need a confirmation with evidence.
- **Downstream boxes** (Einzug Reststrom Lieferant UTILMD, Schlussrechnung/Abrechnung INVOIC, Anpassung EDM, Messwertprozesse MSCONS): not implemented. The process records **outbox events** with status `NOT_IMPLEMENTED` as the interface; nothing is sent. Timing:
  - EDM: when a construct passes the vSZ gate.
  - **UTILMD Einzug Reststrom:** only after the first ruhende MaLo of the construct. Grid-operator practice (e.g. Stromnetz Berlin) is that the virtual MaLo is assigned to the Reststrom supplier only after the first ruhende MaLo is confirmed.
  - INVOIC Schlussrechnung: per MaLo set ruhend.
- **§5 Excel list for billing:** provided as the relationship list (`relationshipList()` / CSV download). Its exact column layout for the billing team is unknown.

## Data

- The participant master list is the sheet `MK7 Teilnehmer` of `Datensatz_Deutsch.xlsx`. The workbook is never modified. Every original cell is kept as `sourceData`.
- One construct per `gebaeude_id`. The construct ID is the building ID.
- **Stichtag** of a construct defaults to the earliest `mk7_versorgungsbeginn_utc` of its participating households (2026-10-01). This is a **demo default**, not a confirmed legal date. It can be changed through `setStichtag`.
- `vertragsbeginn_utc` / `vertragsende_utc` (2026-10-01 → 2026-10-02 for every row) look like placeholders. They are displayed but not used as the dormancy window.
- **Baseline business state:** household MaLos start as `ACTIVE` (provenance `BASELINE_ASSUMED_ACTIVE`). The workbook contains no state; ACTIVE is the documented demo assumption.
- **Simulated SAP state.** Supplier Abmeldung per MaLo (V11), MCM per generator (V09) and the DSO-DP order (vSZ step 1) are *not* in the workbook (the column `vorlieferant` is empty). iMSys *is* in the workbook (`messsystem` = `iMS/TF` for every row) and is read from there, not simulated. In a real integration they would be read from SAP IS-U and market communication. For the demo they come from the explicitly labeled fixture `data/fixtures/sap-simulated-state.json`. The pipeline **reads** it at run time (audit event `SAP_READ`); nothing is pre-confirmed at import or reset, and only values that are still UNKNOWN are filled:
  - Default: Abmeldung CONFIRMED, MCM COMPLETED; DSO-DP order known for all three constructs.
  - Deliberate demo gaps (labeled as simulated): Abmeldung **PENDING** for `50539603876` and `50539603103`.
- **Only the sheet `MK7 Teilnehmer` is imported.** The sheets `Stündlicher Verbrauch`, `Stündliche Erzeugung`, `Strompreise`, `Zahlungsregeln`, `Feldbeschreibungen` and `Erzeuger Registrierung` belong to the wider energy-sharing / billing case and are outside this MVP.
  - Constructs registered through the API or by file upload start with **UNKNOWN** status and are blocked until the status arrives (`POST /updateSapState`) or a person confirms it with a reason.

## Business rules (from Prozessschritte.pdf)

- **§6.1 MeMa:** from the Reststrom-MaLo to every participating, cleared Bezugs-MeLo of the construct.
- **§6.2 MaMa:** every participating, cleared Bezugs-MaLo → Reststrom-MaLo, with the Zeitscheibe starting at the Stichtag.
- **§6.3 Einspeise-MeMa:** from the Einspeise-MaLo to the participating Bezugs-MeLos. MeMa only, never MaMa, and only after MCM is confirmed.
- **Zeitscheiben** are half-open `[validFrom, validToExclusive)`; an open end equals SAP `31.12.9999`.
- **What "ruhend" means in SAP is not specified by the PDF.** `RUHEND` is a simulated business state with its own lifecycle period. The ZP-Status dating in §4.5 is a setup step and is *not* used as the dormancy mechanism.
- The PDF reports that `/EKN/ESERVICE_UPD` did not work. It is not assumed to be a usable API.

## Prüfung and Korrektur

- Findings block **only the objects they affect** (one MaLo, one generator, or the whole construct). Other MaLos continue in the same run: the pipeline never stops globally. Each MaLo carries a step trace (Prüfung → vSZ → Voraussetzungen → MeMa → MaMa → Ruhend → Übergabe) that shows where it stopped and why.
- **Why V10/V11 exist:** in Mieterstrom/vSZ practice, every participating MeLo needs an iMSys, and a household MaLo can only become a ruhende MaLo once its current supplier has deregistered it (Abmeldung via UTILMD). The participants' MaLos are converted into ruhende MaLos placed under the virtual MaLo; in this construct, that is the MaMa to the Reststrom-MaLo.
- **V03, BDEW MaLo check digit:** implemented exactly as in the BDEW AWH *Identifikatoren in der Marktkommunikation* v1.2, §3.2/§3.3/§8.1 ("Lok- und Waggon-Kennzeichnungsverfahren"), and verified against the official example 4137355924 → 1. **All 17 MaLo IDs in the workbook fail this check**, so they are synthetic test IDs. V03 is therefore a *notice* that blocks nothing. A productive system would reject these IDs.
- **V02:** MaLo-ID = 11 digits with a first digit 1–9 (BDEW §3.2). MeLo-ID = 33 characters: `DE` + 31 alphanumeric characters.
- **V05** (the same MaLo in several constructs, `50539603888`) is never decided automatically. `CHOOSE_BUILDING` excludes the other assignments; it does not delete them.
- **V14:** all three generators share the Einspeise-MaLo `51664053767`. This is flagged for review and can be acknowledged (`CONFIRM_ASSUMPTION`) or excluded.
- **V02:** the wind MeLo in B-CGN-01 has 34 characters (a MeLo ID has 33). It must be fixed or excluded. Until then, that generator's Einspeise-MeMa is blocked.
- Every resolution requires a reason, writes an audit event and triggers a re-check. Findings that disappear after a re-check are closed as `AUTO_CLEARED`.

## Lifecycle after the Umstellung (manual mode)

- **Wiederaktivierung** closes the RUHEND period and opens an ACTIVE one. Relationships are kept (the real market rule is unknown). A reactivated MaLo is not switched again automatically.
- **Herauslösung** closes the MaLo's MaMa, its household MeMa and the Einspeise-MeMa to its MeLo as of the date, and removes the participant from the construct. The ACTIVE/RUHEND state is unchanged.
- **Korrektur** moves the date of a referenced transition (lifecycle periods and that MaLo's relationship start) and keeps the original audit event.
- **Rücknahme** appends a compensating transition. It requires a reason and a reference, and never deletes history.

## Technical

- Each API request runs in one CAP transaction. Writes are read back before `SUCCESS` is reported; a failed verification rolls the transaction back.
- Within one run, items are isolated at the *decision* level (a finding on one MaLo never stops another). A storage error rolls back the whole request rather than reporting a partial false success.
- Idempotency: the key `SET_DORMANT|MaLo|construct|Stichtag` makes a repeated run return `ALREADY_DONE`. A blocked attempt is retried on the same request record.
- **Reset Demo** re-registers the workbook baseline and clears the simulated state, the outbox and the audit history. This endpoint exists for the demo only.
- The automatic process is triggered by a click or an API call. It is not an unattended scheduler.

## Lifecycle semantics (verified by the end-to-end tests)

- **Herauslösung** ends the MaLo's MeMa and MaMa on the effective date, excludes the participant from the construct, and returns a RUHEND MaLo to ACTIVE (it needs a date after the dormant start). A later pipeline run does not switch it again.
- **Korrektur** moves the dormant start together with the MaMa, the household MeMa and the Einspeise-MeMa of that MaLo. The original request stays in the history; the audit keeps the reason.
- **Wiederaktivierung** returns the MaLo to ACTIVE. MeMa/MaMa stay open (assumption, not specified in the PDF).
- A request with status SUCCESS is never overwritten by a later run. "Already switched" is date-independent, so a Korrektur is not flagged as a conflict.

## Demo access, API keys and activity (not real authentication)

- **Sign-in is a demo.** Two fixed personas (M. Weber = Maintainer, A. Klein = Viewer), no password, no identity provider. The session token is an HMAC-signed value valid for 12 hours (`srv/auth.ts`).
- **Roles are enforced in the backend** (`server.ts`, before any business logic): without a token every write returns 401 `AUTH_REQUIRED`; a role without permission gets 403 `FORBIDDEN`. Viewer: reads and previews. Maintainer: everything. Pipeline (API keys only): all writes except reset, import, self-check and key management.
- **The actor is never trusted from the client.** A name sent in a request body is ignored; the audit log records the signed-in name or `Key: <name>`.
- **API keys:** the secret (`rk_…`) is shown once; only its SHA-256 is stored. Revoking takes effect at once. Resetting the demo removes all keys and the call log.
- **Activity panel:** merges the audit log with `ApiCalls` (every write call: who, path, status, duration). Reads are not logged.
- The API playground sends real requests; the "Effect in the app" numbers are measured from the real counters before and after the call.
