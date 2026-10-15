# Demo script (about 8 minutes)

Before you start: `npm run dev`, open http://localhost:5173, then click **Reset**.

1. **Process tab:** the board lists every participant of the 3 constructs, with the process steps as columns. These are the steps from the solution map and PDF §6: Prüfung → vSZ → Voraussetzungen → MeMa §6.1 → MaMa §6.2 → Ruhend → Übergabe. `Simulation · no SAP` is in the header.
2. **Run automatic process.** The cells fill left to right. **6 MaLos become ruhend in the first run**; the pipeline does not stop because of a single problem. Each problem is marked at its exact step (hover for the reason):
   - `50539603888`: in Frankfurt *and* Köln → Prüfung "!" (V05, never decided automatically)
   - `50539603876`: Abmeldung of the current supplier pending → Voraussetzungen "!" (V11)
   - `50539603103`: no iMSys at its MeLo → Voraussetzungen "✕" (V10)
   - Wind generator: MeLo with 34 characters → Prüfung "✕" (V02). Solar generators: shared Einspeise-MaLo (V14)
   - `50539603604`: Teilnahme nein → skipped, stays ACTIVE
3. **Müllheim → MeMa/MaMa:** MeMa from Reststrom-MaLo 50539603639 to the Bezugs-MeLos (§6.1), MaMa from each MaLo to 50539603639 from 01.10.2026 (§6.2). **Download the §5 list (CSV).**
4. **Korrektur tab** (badge = open findings):
   - V11 → **Abmeldung received**. This is a status input, the same call another system makes through `POST /updateSapState`.
   - V05 → reason → **Belongs to B-CGN-01**.
   - V10 → reason → **Confirm manually** (or **iMSys installed**).
5. **Process → Run again:** **9 of 9 ruhend**. Completed MaLos show `ALREADY_DONE` (nothing is done twice). Handover: UTILMD "Einzug Reststrom" per construct, emitted after the first ruhende MaLo. Schlussrechnung per MaLo. All recorded, nothing sent.
6. **Solar generators:** Korrektur V14 → reason → **Confirm manually** → Run → Einspeise-MeMa (MeMa only, no MaMa, §6.3). The wind generator stays blocked until its MeLo is corrected (V02 → **Fix value**).
7. **MaLo tab:** 50539603921 → **Reactivate** 01.12.2026 → **Check** → **Reactivate** → history shows the ACTIVE → RUHEND → ACTIVE Zeitscheiben.
8. **Notices:** Korrektur → *Notices*. The BDEW check digit (V03) fails for all workbook IDs: synthetic test data, flagged honestly, blocking nothing.
9. **API tab:** `processAll`, `updateSapState`, `relationshipList()`, `Outbox` with **Try it**; OpenAPI for other services.
10. **Self-check:** 18/18 business scenarios. CLI: `npm test`.
