# Projektfortschritt

## Phase A — Bootstrap

Status: **VERIFIZIERT** am 15.10.2026.

### Umfang

- CAP-Backend mit CDS-Modell und OData-V4-Service
- persistente lokale SQLite-Konfiguration
- modulare Verzeichnisse für Domain, CAP-Service und Adapter
- React-/Vite-Shell mit UI5 Web Components
- Vite-Proxy zum CAP-Backend
- globaler Warnhinweis `SIMULATION — KEINE SAP-VERBINDUNG`
- Vitest, TypeScript-Prüfung und Build-Skripte

### Ausgeführte Verifikation

| Kommando/Prüfung | Ergebnis |
| --- | --- |
| `npm install` | PASS — 184 Pakete installiert; npm meldet 7 transitive Audit-Funde (4 high, 3 critical), keine automatische Breaking-Change-Korrektur durchgeführt |
| `npm run deploy:local` | PASS — `db.sqlite` angelegt und `SystemStatuses` aus CSV initialisiert |
| `npm test` | PASS — 1 Testdatei, 1 Test bestanden |
| `npm run typecheck` | PASS — Backend- und Frontend-TypeScript ohne Fehler |
| `npm run build` | PASS — CAP-Produktionsbuild und Vite-Build erfolgreich; Vite meldet lediglich einen Hinweis zur Chunk-Größe der UI5-Ressourcen |
| `npm run dev` | PASS — CAP auf Port 4004 und Vite auf Port 5173 gestartet |
| CAP OData `SystemStatuses` | PASS — persistierter Datensatz aus `db.sqlite` gelesen |
| CAP-Funktion `health()` | PASS — `OK`, `SIMULATION`, `NOT_CONFIGURED` |
| Vite `/` | PASS — HTML-Shell ausgeliefert |
| Vite-Proxy `/odata/v4/malo/SystemStatuses` | PASS — OData-Antwort über Frontend-Port erhalten |

### Gate Phase A

- [x] CAP startet erfolgreich.
- [x] SQLite ist persistent auf `db.sqlite` konfiguriert.
- [x] React/Vite startet erfolgreich.
- [x] Frontend-API-Pfad erreicht CAP über den Vite-Proxy.
- [x] Typecheck und Build sind erfolgreich.
- [x] Warnung `SIMULATION — KEINE SAP-VERBINDUNG` ist global in der App-Shell sichtbar.

### Bewusst offen nach Phase A

- Workbook-Import und echte Quelldatensätze (Phase B)
- Fachliche MaLo-Operationen und Lifecycle-Persistenz (ab Phase C)
- Optimierung des großen UI5-Frontend-Bundles
- Bewertung bzw. gezielte Aktualisierung der von `npm audit` gemeldeten transitiven Abhängigkeiten
