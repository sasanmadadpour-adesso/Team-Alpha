# Graph Report - Team-Alpha  (2026-10-15)

## Corpus Check
- 26 files · ~12,004 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 16 file(s) not represented in the graph (top: .properties 6, .xml 3, .cds 3)

## Summary
- 277 nodes · 350 edges · 19 communities (13 shown, 6 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 7 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `71b3a944`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- settings
- energy-overview-service.js
- energy-progress.test.js
- package.json
- models
- energy-calculator.test.js
- libs
- generate-year-data.js
- sap.app
- workbook-loader.js
- Mieterstrom CAP Backend Simulator
- Team-Alpha
- energy-trends.test.js
- AGENTS.md
- i18n
- BuildingHouse.js

## God Nodes (most connected - your core abstractions)
1. `settings` - 12 edges
2. `project()` - 12 edges
3. `sap.app` - 8 edges
4. `scripts` - 8 edges
5. `consumptionProfile()` - 8 edges
6. `mapWorkbook()` - 8 edges
7. `models` - 8 edges
8. `createWorkbookRepository()` - 7 edges
9. `sap.ui5` - 6 edges
10. `libs` - 6 edges

## Surprising Connections (you probably didn't know these)
- `project()` --calls--> `calculate()`  [EXTRACTED]
  Construct_overview/srv/lib/vnb-projector.js → Construct_overview/srv/lib/energy-calculator.js

## Import Cycles
- None detected.

## Communities (19 total, 6 thin omitted)

### Community 0 - "settings"
Cohesion: 0.06
Nodes (37): id, name, options, type, id, name, options, type (+29 more)

### Community 1 - "energy-overview-service.js"
Cohesion: 0.11
Nodes (17): { calculate }, cds, { createWorkbookRepository }, { project }, { trends }, calculate(), average(), averageGrouped() (+9 more)

### Community 2 - "energy-progress.test.js"
Cohesion: 0.09
Nodes (17): fs, path, root, workbooks, XLSX, appRoot, assert, fs (+9 more)

### Community 3 - "package.json"
Cohesion: 0.06
Nodes (30): cds, requires, dependencies, install, npx, playwright, @playwright/test, @sap/cds (+22 more)

### Community 4 - "models"
Cohesion: 0.10
Nodes (20): models, name, npm, options, agent, build, plan, model (+12 more)

### Community 5 - "energy-calculator.test.js"
Cohesion: 0.08
Nodes (19): { calculate }, { createWorkbookRepository }, result, snapshot, createWorkbookRepository(), assert, { calculate }, { createWorkbookRepository } (+11 more)

### Community 6 - "libs"
Cohesion: 0.25
Nodes (8): libs, minUI5Version, sap.f, sap.fe.templates, sap.m, sap.ui.core, sap.ui.layout, dependencies

### Community 7 - "generate-year-data.js"
Cohesion: 0.19
Nodes (19): annualMeans(), apply(), buildSeries(), configs, consumptionProfile(), dayOfYear(), fitMean(), gauss() (+11 more)

### Community 8 - "sap.app"
Cohesion: 0.08
Nodes (25): version, mainService, desktop, phone, tablet, icon, settings, type (+17 more)

### Community 9 - "workbook-loader.js"
Cohesion: 0.23
Nodes (14): boolean(), DEFAULT_WORKBOOK, fs, mapWorkbook(), number(), path, REQUIRED_COLUMNS, REQUIRED_SHEETS (+6 more)

### Community 10 - "Mieterstrom CAP Backend Simulator"
Cohesion: 0.40
Nodes (4): API areas, Mieterstrom CAP Backend Simulator, Run locally, Tests

### Community 12 - "energy-trends.test.js"
Cohesion: 0.24
Nodes (9): bucketStart(), granularity(), parseDate(), trends(), VALUE_FIELDS, assert, { createWorkbookRepository }, test (+1 more)

### Community 17 - "i18n"
Cohesion: 0.40
Nodes (5): settings, type, i18n, models, bundleName

## Knowledge Gaps
- **6 isolated node(s):** `minUI5Version`, `@playwright/test`, `install`, `npx`, `playwright` (+1 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 173 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **6 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `xlsx` connect `energy-progress.test.js` to `workbook-loader.js`, `package.json`, `generate-year-data.js`?**
  _High betweenness centrality (0.106) - this node is a cross-community bridge._
- **What connects `minUI5Version`, `@playwright/test`, `install` to the rest of the system?**
  _6 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `settings` be split into smaller, more focused modules?**
  _Cohesion score 0.05855855855855856 - nodes in this community are weakly interconnected._
- **Why does `sap.ui5` connect `settings` to `sap.app`, `i18n`, `libs`?**
  _High betweenness centrality (0.050) - this node is a cross-community bridge._
- **Should `energy-overview-service.js` be split into smaller, more focused modules?**
  _Cohesion score 0.10582010582010581 - nodes in this community are weakly interconnected._
- **Should `energy-progress.test.js` be split into smaller, more focused modules?**
  _Cohesion score 0.09420289855072464 - nodes in this community are weakly interconnected._
- **Should `package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.06451612903225806 - nodes in this community are weakly interconnected._