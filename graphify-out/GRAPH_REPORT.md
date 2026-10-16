# Graph Report - Team-Alpha  (2026-10-16)

## Corpus Check
- 54 files · ~25,529 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 20 file(s) not represented in the graph (top: .properties 6, .css 5, .xml 4)

## Summary
- 501 nodes · 733 edges · 35 communities (25 shown, 10 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 27 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `1314fb67`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- settings
- set-switchover-progress.js
- package.json
- models
- vnb-projector.js
- portal-contract.mjs
- generate-year-data.js
- sap.app
- workbook-loader.js
- Mieterstrom CAP Backend Simulator
- Team-Alpha
- overview/manifest.json
- AGENTS.md
- query.test.js
- BuildingHouse.js
- NavHistory.js
- ref_node_assert
- fix-master-data.js
- data-quality.js
- energy-overview-service.js
- server.js
- app.js
- vnb-projector.test.js
- switchover.js
- app.test.js
- i18n.test.js
- switchover-progress.test.js
- member-app.test.js

## God Nodes (most connected - your core abstractions)
1. `project()` - 20 edges
2. `renderMember()` - 13 edges
3. `renderBuilding()` - 13 edges
4. `validatePortalData()` - 11 edges
5. `createWorkbookRepository()` - 10 edges
6. `t()` - 9 edges
7. `chart()` - 9 edges
8. `scripts` - 9 edges
9. `sap.app` - 8 edges
10. `PortalContractError` - 8 edges

## Surprising Connections (you probably didn't know these)
- `getPortalData()` --calls--> `validatePortalData()`  [EXTRACTED]
  Construct_overview/app/member-app/webapp/api/portal-api.mjs → Construct_overview/app/member-app/webapp/api/portal-contract.mjs
- `filterRows()` --calls--> `apply()`  [EXTRACTED]
  Construct_overview/srv/energy-overview-service.js → Construct_overview/srv/lib/query.js
- `project()` --calls--> `detect()`  [EXTRACTED]
  Construct_overview/srv/lib/vnb-projector.js → Construct_overview/srv/lib/data-quality.js
- `project()` --calls--> `summarize()`  [EXTRACTED]
  Construct_overview/srv/lib/vnb-projector.js → Construct_overview/srv/lib/data-quality.js
- `project()` --calls--> `calculate()`  [EXTRACTED]
  Construct_overview/srv/lib/vnb-projector.js → Construct_overview/srv/lib/energy-calculator.js

## Import Cycles
- None detected.

## Communities (35 total, 10 thin omitted)

### Community 0 - "settings"
Cohesion: 0.05
Nodes (40): id, name, options, type, id, name, options, type (+32 more)

### Community 2 - "set-switchover-progress.js"
Cohesion: 0.25
Nodes (6): fs, path, root, UNFINISHED_STEPS, workbooks, XLSX

### Community 3 - "package.json"
Cohesion: 0.06
Nodes (35): cds, query, requires, dependencies, install, npx, playwright, @playwright/test (+27 more)

### Community 4 - "models"
Cohesion: 0.10
Nodes (20): models, name, npm, options, agent, build, plan, model (+12 more)

### Community 5 - "vnb-projector.js"
Cohesion: 0.18
Nodes (15): worstSeverity(), average(), averageGrouped(), { calculate }, { detect, summarize, worstSeverity, SEVERITY }, direction(), key(), latest24() (+7 more)

### Community 6 - "portal-contract.mjs"
Cohesion: 0.19
Nodes (19): address(), energy(), GRANULARITIES, noExtraKeys(), number(), PortalContractError, RANGES, required() (+11 more)

### Community 7 - "generate-year-data.js"
Cohesion: 0.19
Nodes (19): annualMeans(), apply(), buildSeries(), configs, consumptionProfile(), dayOfYear(), fitMean(), gauss() (+11 more)

### Community 8 - "sap.app"
Cohesion: 0.08
Nodes (25): version, mainService, desktop, phone, tablet, icon, minUI5Version, settings (+17 more)

### Community 9 - "workbook-loader.js"
Cohesion: 0.07
Nodes (34): { calculate }, { createWorkbookRepository }, result, snapshot, boolean(), createWorkbookRepository(), DEFAULT_WORKBOOK, fs (+26 more)

### Community 10 - "Mieterstrom CAP Backend Simulator"
Cohesion: 0.25
Nodes (7): API areas, Data quality rules, Master data repair, Mieterstrom CAP Backend Simulator, Run locally, Tests, UI behaviour

### Community 12 - "overview/manifest.json"
Cohesion: 0.06
Nodes (32): version, libs, minUI5Version, desktop, phone, tablet, settings, type (+24 more)

### Community 17 - "query.test.js"
Cohesion: 0.22
Nodes (10): filterRows(), apply(), call(), compare(), evaluate(), operand(), { apply }, assert (+2 more)

### Community 20 - "NavHistory.js"
Cohesion: 0.60
Nodes (5): bundle(), onHashChanged(), render(), text(), title()

### Community 23 - "ref_node_assert"
Cohesion: 0.07
Nodes (24): describe(), describeOverview(), nextState(), parseHash(), distance(), findMatches(), haystack(), similarity() (+16 more)

### Community 24 - "fix-master-data.js"
Cohesion: 0.22
Nodes (10): applyFixes(), CITY_FIXES, configs, path, PLANT_MALO, root, sheetTable(), STREET_FIXES (+2 more)

### Community 26 - "data-quality.js"
Cohesion: 0.14
Nodes (18): detect(), FIELDS, groupBy(), interpolate(), issue(), languageOf(), localize(), place() (+10 more)

### Community 28 - "energy-overview-service.js"
Cohesion: 0.14
Nodes (9): { apply }, { calculate }, cds, { createWorkbookRepository }, issueIndex, { localize, summarize }, { project }, { stepLabel } (+1 more)

### Community 29 - "server.js"
Cohesion: 0.09
Nodes (22): bucketStart(), granularity(), parseDate(), trends(), VALUE_FIELDS, cds, { createWorkbookRepository }, crypto (+14 more)

### Community 30 - "app.js"
Cohesion: 0.18
Nodes (27): getPortalData(), PORTAL_API_BASE_URL, PORTAL_API_PATH, PortalApiError, api(), app, bindTrend(), cards() (+19 more)

### Community 31 - "vnb-projector.test.js"
Cohesion: 0.20
Nodes (6): calculate(), assert, { createWorkbookRepository }, { project }, test, { TOTAL_STEPS }

### Community 32 - "switchover.js"
Cohesion: 0.67
Nodes (3): languageOf(), STEP_LABELS, stepLabel()

### Community 33 - "app.test.js"
Cohesion: 0.29
Nodes (5): appRoot, assert, fs, path, test

### Community 34 - "i18n.test.js"
Cohesion: 0.25
Nodes (5): assert, fs, path, root, test

### Community 36 - "switchover-progress.test.js"
Cohesion: 0.25
Nodes (7): assert, fs, path, root, test, XLSX, xlsx

### Community 37 - "member-app.test.js"
Cohesion: 0.25
Nodes (5): assert, fs, path, root, test

## Knowledge Gaps
- **7 isolated node(s):** `minUI5Version`, `minUI5Version`, `@playwright/test`, `install`, `npx` (+2 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 290 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **10 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `xlsx` connect `switchover-progress.test.js` to `set-switchover-progress.js`, `package.json`, `generate-year-data.js`, `workbook-loader.js`, `fix-master-data.js`?**
  _High betweenness centrality (0.089) - this node is a cross-community bridge._
- **What connects `minUI5Version`, `minUI5Version`, `@playwright/test` to the rest of the system?**
  _7 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `settings` be split into smaller, more focused modules?**
  _Cohesion score 0.052564102564102565 - nodes in this community are weakly interconnected._
- **Why does `@sap/cds` connect `package.json` to `energy-overview-service.js`, `server.js`?**
  _High betweenness centrality (0.026) - this node is a cross-community bridge._
- **Should `package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.05555555555555555 - nodes in this community are weakly interconnected._
- **Should `models` be split into smaller, more focused modules?**
  _Cohesion score 0.09523809523809523 - nodes in this community are weakly interconnected._
- **Should `sap.app` be split into smaller, more focused modules?**
  _Cohesion score 0.07692307692307693 - nodes in this community are weakly interconnected._