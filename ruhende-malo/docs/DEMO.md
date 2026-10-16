# Demo script (about 7 minutes)

Before you start: `npm run dev`, open http://localhost:5173, then **⋯ → Demo zurücksetzen**.

1. **Übersicht:** three MK7 constructs from `Datensatz_Deutsch.xlsx`, each with the stage rail of the solution map. The topbar shows `Simulation · keine SAP-Verbindung` and the DE/EN switch.
2. **Prozess starten:** **6 MaLos become ruhend in the first run**. The cards fill up, and the Klärfälle badge shows the open findings.
3. **Open Frankfurt:** the timeline follows the PDF exactly. Expand MeMa §6.1 and MaMa §6.2 to see the generated relationships with Zeitscheibe 01.10.2026 – 31.12.9999. Übergabe → **download the §5 list**.
4. **Klärfälle:**
   - *Abmeldung des Lieferanten fehlt* → **Abmeldung liegt vor** (a status input, as another system would send it) → the process continues on its own → **Erledigt, ruhend**.
   - *MaLo in zwei Konstrukten* → compare both buildings side by side → reason → **Gehört zu Köln** → ruhend in Köln, Frankfurt excluded.
   - *ID-Format ungültig* (wind MeLo with 34 characters) → type the corrected MeLo. The counter turns green at 33 → reason → **Korrigieren**.
   - *Kein iMSys* → **iMSys ist eingebaut** or **Manuell bestätigen** with a reason.
5. **Übersicht:** 9 of 9 ruhend. Handover events: UTILMD after the first ruhende MaLo, plus INVOIC per MaLo. All recorded, nothing sent.
6. **Lifecycle:** open a ruhende MaLo → *Weitere Aktionen* → **Wiederaktivieren** 01.12.2026 → *Prüfen* → *Ausführen* → Zeitscheiben show Aktiv → Ruhend → Aktiv.
7. **EN:** switch the language. The same screens appear in English, and the market terms stay German.
8. **Schnittstelle:** `cases()`, `updateSapState`, `processAll` with *Try it*. **⋯ → Prüfszenarien ausführen:** 18/18.
