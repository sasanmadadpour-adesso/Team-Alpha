# Graph Report - Team-Alpha  (2026-10-16)

## Corpus Check
- 56 files · ~2,595,463 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 21 file(s) not represented in the graph (top: .properties 6, .css 5, .xml 4)

## Summary
- 523 nodes · 755 edges · 36 communities (26 shown, 10 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 30 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `353fa802`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- settings
- server.js
- package.json
- models
- Datensatz_Deutsch_37494581.md
- portal-contract.mjs
- generate-year-data.js
- sap.app
- workbook-loader.js
- Mieterstrom CAP Backend Simulator
- Team-Alpha
- overview/manifest.json
- AGENTS.md
- BuildingHouse.js
- NavHistory.js
- ref_node_assert
- overview-search.test.js
- fix-master-data.js
- vnb-projector.js
- energy-overview-service.js
- energy-trends.test.js
- app.js
- set-switchover-progress.js
- i18n.test.js
- ref_node_path
- app.test.js
- nav-logic.test.js
- odata.test.js
- switchover-progress.test.js

## God Nodes (most connected - your core abstractions)
1. `project()` - 17 edges
2. `validatePortalData()` - 11 edges
3. `renderMember()` - 10 edges
4. `renderBuilding()` - 10 edges
5. `t()` - 9 edges
6. `scripts` - 9 edges
7. `createWorkbookRepository()` - 9 edges
8. `sap.app` - 8 edges
9. `PortalContractError` - 8 edges
10. `trend()` - 8 edges

## Surprising Connections (you probably didn't know these)
- `filterRows()` --calls--> `apply()`  [EXTRACTED]
  Construct_overview/srv/energy-overview-service.js → Construct_overview/srv/lib/query.js
- `project()` --calls--> `calculate()`  [EXTRACTED]
  Construct_overview/srv/lib/vnb-projector.js → Construct_overview/srv/lib/energy-calculator.js
- `cachedPortalData()` --calls--> `getPortalData()`  [EXTRACTED]
  Construct_overview/srv/server.js → Construct_overview/srv/lib/ruhend-member-client.js
- `getPortalData()` --calls--> `validatePortalData()`  [EXTRACTED]
  Construct_overview/app/member-app/webapp/api/portal-api.mjs → Construct_overview/app/member-app/webapp/api/portal-contract.mjs
- `project()` --calls--> `detect()`  [EXTRACTED]
  Construct_overview/srv/lib/vnb-projector.js → Construct_overview/srv/lib/data-quality.js

## Import Cycles
- None detected.

## Communities (36 total, 10 thin omitted)

### Community 0 - "settings"
Cohesion: 0.05
Nodes (40): id, name, options, type, id, name, options, type (+32 more)

### Community 2 - "server.js"
Cohesion: 0.08
Nodes (27): baseUrl, extractHouseNumber(), fs, getPortalData(), participants(), path, request(), RuhendApiError (+19 more)

### Community 3 - "package.json"
Cohesion: 0.06
Nodes (35): cds, query, requires, dependencies, install, npx, playwright, @playwright/test (+27 more)

### Community 4 - "models"
Cohesion: 0.10
Nodes (20): models, name, npm, options, agent, build, plan, model (+12 more)

### Community 5 - "Datensatz_Deutsch_37494581.md"
Cohesion: 0.25
Nodes (7): Sheet: Erzeuger Registrierung, Sheet: Feldbeschreibungen, Sheet: MK7 Teilnehmer, Sheet: Strompreise, Sheet: Stündliche Erzeugung, Sheet: Stündlicher Verbrauch, Sheet: Zahlungsregeln

### Community 6 - "portal-contract.mjs"
Cohesion: 0.20
Nodes (18): getPortalData(), PORTAL_API_BASE_URL, PORTAL_API_PATH, PortalApiError, VALIDATE_MEMBER_PATH, validateHouseMember(), address(), energy() (+10 more)

### Community 7 - "generate-year-data.js"
Cohesion: 0.19
Nodes (19): annualMeans(), apply(), buildSeries(), configs, consumptionProfile(), dayOfYear(), fitMean(), gauss() (+11 more)

### Community 8 - "sap.app"
Cohesion: 0.08
Nodes (25): version, mainService, desktop, phone, tablet, icon, minUI5Version, settings (+17 more)

### Community 9 - "workbook-loader.js"
Cohesion: 0.07
Nodes (35): { calculate }, { createWorkbookRepository }, result, snapshot, calculate(), boolean(), createWorkbookRepository(), DEFAULT_WORKBOOK (+27 more)

### Community 10 - "Mieterstrom CAP Backend Simulator"
Cohesion: 0.25
Nodes (7): API areas, Data quality rules, Master data repair, Mieterstrom CAP Backend Simulator, Run locally, Tests, UI behaviour

### Community 12 - "overview/manifest.json"
Cohesion: 0.06
Nodes (32): version, libs, minUI5Version, desktop, phone, tablet, settings, type (+24 more)

### Community 20 - "NavHistory.js"
Cohesion: 0.60
Nodes (5): bundle(), onHashChanged(), render(), text(), title()

### Community 22 - "ref_node_assert"
Cohesion: 0.22
Nodes (5): assert, test, assert, f, test

### Community 23 - "overview-search.test.js"
Cohesion: 0.27
Nodes (8): distance(), findMatches(), haystack(), similarity(), assert, nodes, search, test

### Community 24 - "fix-master-data.js"
Cohesion: 0.22
Nodes (10): applyFixes(), CITY_FIXES, configs, path, PLANT_MALO, root, sheetTable(), STREET_FIXES (+2 more)

### Community 26 - "vnb-projector.js"
Cohesion: 0.07
Nodes (41): detect(), FIELDS, groupBy(), interpolate(), issue(), languageOf(), localize(), place() (+33 more)

### Community 28 - "energy-overview-service.js"
Cohesion: 0.08
Nodes (22): { apply }, { calculate }, cds, { createWorkbookRepository }, envPath, filterRows(), fs, issueIndex (+14 more)

### Community 29 - "energy-trends.test.js"
Cohesion: 0.24
Nodes (9): bucketStart(), granularity(), parseDate(), trends(), VALUE_FIELDS, assert, { createWorkbookRepository }, test (+1 more)

### Community 30 - "app.js"
Cohesion: 0.25
Nodes (22): api(), app, bindTrend(), cards(), chart(), dateLabel(), esc(), fmt() (+14 more)

### Community 34 - "set-switchover-progress.js"
Cohesion: 0.25
Nodes (6): fs, path, root, UNFINISHED_STEPS, workbooks, XLSX

### Community 35 - "i18n.test.js"
Cohesion: 0.25
Nodes (5): assert, fs, path, root, test

### Community 36 - "ref_node_path"
Cohesion: 0.29
Nodes (5): assert, fs, path, root, test

### Community 37 - "app.test.js"
Cohesion: 0.25
Nodes (5): appRoot, assert, fs, path, test

### Community 38 - "nav-logic.test.js"
Cohesion: 0.31
Nodes (7): describe(), describeOverview(), nextState(), parseHash(), assert, { parseHash, nextState, describe, describeOverview, normalize }, test

### Community 39 - "odata.test.js"
Cohesion: 0.29
Nodes (3): assert, { spawn }, test

### Community 40 - "switchover-progress.test.js"
Cohesion: 0.25
Nodes (7): assert, fs, path, root, test, XLSX, xlsx

## Knowledge Gaps
- **7 isolated node(s):** `minUI5Version`, `minUI5Version`, `@playwright/test`, `install`, `npx` (+2 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 304 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **10 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `xlsx` connect `switchover-progress.test.js` to `set-switchover-progress.js`, `package.json`, `generate-year-data.js`, `workbook-loader.js`, `fix-master-data.js`?**
  _High betweenness centrality (0.062) - this node is a cross-community bridge._
- **What connects `minUI5Version`, `minUI5Version`, `@playwright/test` to the rest of the system?**
  _7 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `settings` be split into smaller, more focused modules?**
  _Cohesion score 0.052564102564102565 - nodes in this community are weakly interconnected._
- **Why does `@sap/cds` connect `package.json` to `server.js`, `energy-overview-service.js`?**
  _High betweenness centrality (0.040) - this node is a cross-community bridge._
- **Should `server.js` be split into smaller, more focused modules?**
  _Cohesion score 0.08095238095238096 - nodes in this community are weakly interconnected._
- **Should `package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.05555555555555555 - nodes in this community are weakly interconnected._
- **Should `models` be split into smaller, more focused modules?**
  _Cohesion score 0.09523809523809523 - nodes in this community are weakly interconnected._