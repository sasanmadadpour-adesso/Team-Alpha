# MK7 Control Center — Simulation

Lokaler SAP-CAP-Prototyp für den Prozess „Umstellung auf ruhende MaLo“.

> **SIMULATION — KEINE SAP-VERBINDUNG**

Phase A stellt das technische Grundgerüst bereit. Es führt keine MaLo-Fachprozesse und keine SAP-Aufrufe aus.

## Voraussetzungen

- Node.js 22 oder neuer
- npm 11 oder neuer

## Start

```bash
npm install
npm run deploy:local
npm run dev
```

CAP läuft standardmäßig auf `http://localhost:4004`, Vite auf `http://localhost:5173`. Vite leitet `/odata` an CAP weiter. Die SQLite-Datei `db.sqlite` liegt lokal im Projektstamm und ist von Git ausgeschlossen.

## Verifikation

```bash
npm test
npm run typecheck
npm run build
```

Direkte API-Prüfung:

```bash
curl http://localhost:4004/odata/v4/malo/SystemStatuses
curl 'http://localhost:4004/odata/v4/malo/health()'
```

## Architektur

- `db/`: CDS-Persistenzmodell und Phase-A-Seed
- `srv/`: CAP-Transport, unabhängige Domänentypen und Adaptergrenzen
- `app/`: React/Vite-Oberfläche mit UI5 Web Components
- `tests/`: Vitest-Tests
- `docs/PROGRESS.md`: tatsächlich ausgeführte Verifikation
