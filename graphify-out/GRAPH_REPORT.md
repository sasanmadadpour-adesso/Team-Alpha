# Graph Report - Team-Alpha  (2026-10-16)

## Corpus Check
- 45 files · ~21,520 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 19 file(s) not represented in the graph (top: .properties 6, .css 4, .xml 4)

## Summary
- 421 nodes · 558 edges · 28 communities (18 shown, 10 thin omitted)
- Extraction: 95% EXTRACTED · 5% INFERRED · 0% AMBIGUOUS · INFERRED: 26 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `20a0ebf9`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- settings
- fix-master-data.js
- package.json
- models
- energy-calculator.test.js
- libs
- generate-year-data.js
- sap.app
- workbook-loader.js
- Mieterstrom CAP Backend Simulator
- Team-Alpha
- overview/manifest.json
- AGENTS.md
- query.test.js
- BuildingHouse.js
- ref_node_assert
- NavHistory.js
- energy-trends.test.js
- search.js
- fix-master-data.js
- data-quality.js

## God Nodes (most connected - your core abstractions)
1. `project()` - 17 edges
2. `scripts` - 9 edges
3. `createWorkbookRepository()` - 9 edges
4. `sap.app` - 8 edges
5. `consumptionProfile()` - 8 edges
6. `mapWorkbook()` - 8 edges
7. `models` - 8 edges
8. `xlsx` - 7 edges
9. `calculate()` - 7 edges
10. `Mieterstrom CAP Backend Simulator` - 7 edges

## Surprising Connections (you probably didn't know these)
- `filterRows()` --calls--> `apply()`  [EXTRACTED]
  Construct_overview/srv/energy-overview-service.js → Construct_overview/srv/lib/query.js
- `project()` --calls--> `detect()`  [EXTRACTED]
  Construct_overview/srv/lib/vnb-projector.js → Construct_overview/srv/lib/data-quality.js
- `project()` --calls--> `summarize()`  [EXTRACTED]
  Construct_overview/srv/lib/vnb-projector.js → Construct_overview/srv/lib/data-quality.js
- `project()` --calls--> `worstSeverity()`  [EXTRACTED]
  Construct_overview/srv/lib/vnb-projector.js → Construct_overview/srv/lib/data-quality.js
- `project()` --calls--> `calculate()`  [EXTRACTED]
  Construct_overview/srv/lib/vnb-projector.js → Construct_overview/srv/lib/energy-calculator.js

## Import Cycles
- None detected.

## Communities (28 total, 10 thin omitted)

### Community 0 - "settings"
Cohesion: 0.09
Nodes (23): id, name, options, type, id, name, options, type (+15 more)

### Community 2 - "fix-master-data.js"
Cohesion: 0.07
Nodes (23): fs, path, root, UNFINISHED_STEPS, workbooks, XLSX, appRoot, assert (+15 more)

### Community 3 - "package.json"
Cohesion: 0.06
Nodes (35): cds, query, requires, dependencies, install, npx, playwright, @playwright/test (+27 more)

### Community 4 - "models"
Cohesion: 0.10
Nodes (20): models, name, npm, options, agent, build, plan, model (+12 more)

### Community 5 - "energy-calculator.test.js"
Cohesion: 0.07
Nodes (34): { apply }, { calculate }, cds, { createWorkbookRepository }, issueIndex, { localize, summarize }, { project }, { stepLabel } (+26 more)

### Community 6 - "libs"
Cohesion: 0.12
Nodes (17): libs, minUI5Version, settings, type, sap.f, sap.fe.templates, sap.m, sap.ui.core (+9 more)

### Community 7 - "generate-year-data.js"
Cohesion: 0.19
Nodes (19): annualMeans(), apply(), buildSeries(), configs, consumptionProfile(), dayOfYear(), fitMean(), gauss() (+11 more)

### Community 8 - "sap.app"
Cohesion: 0.08
Nodes (25): version, mainService, desktop, phone, tablet, icon, minUI5Version, settings (+17 more)

### Community 9 - "workbook-loader.js"
Cohesion: 0.09
Nodes (30): { calculate }, { createWorkbookRepository }, result, snapshot, boolean(), createWorkbookRepository(), DEFAULT_WORKBOOK, fs (+22 more)

### Community 10 - "Mieterstrom CAP Backend Simulator"
Cohesion: 0.25
Nodes (7): API areas, Data quality rules, Master data repair, Mieterstrom CAP Backend Simulator, Run locally, Tests, UI behaviour

### Community 12 - "overview/manifest.json"
Cohesion: 0.06
Nodes (32): version, libs, minUI5Version, desktop, phone, tablet, settings, type (+24 more)

### Community 17 - "query.test.js"
Cohesion: 0.22
Nodes (10): filterRows(), apply(), call(), compare(), evaluate(), operand(), { apply }, assert (+2 more)

### Community 19 - "ref_node_assert"
Cohesion: 0.07
Nodes (21): describe(), describeOverview(), nextState(), parseHash(), assert, { calculate }, { createWorkbookRepository }, test (+13 more)

### Community 20 - "NavHistory.js"
Cohesion: 0.60
Nodes (5): bundle(), onHashChanged(), render(), text(), title()

### Community 22 - "energy-trends.test.js"
Cohesion: 0.24
Nodes (9): bucketStart(), granularity(), parseDate(), trends(), VALUE_FIELDS, assert, { createWorkbookRepository }, test (+1 more)

### Community 23 - "search.js"
Cohesion: 0.70
Nodes (4): distance(), findMatches(), haystack(), similarity()

### Community 24 - "fix-master-data.js"
Cohesion: 0.22
Nodes (10): applyFixes(), CITY_FIXES, configs, path, PLANT_MALO, root, sheetTable(), STREET_FIXES (+2 more)

### Community 26 - "data-quality.js"
Cohesion: 0.14
Nodes (17): detect(), FIELDS, groupBy(), interpolate(), issue(), languageOf(), localize(), place() (+9 more)

## Knowledge Gaps
- **7 isolated node(s):** `minUI5Version`, `minUI5Version`, `@playwright/test`, `install`, `npx` (+2 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 252 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **10 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `xlsx` connect `fix-master-data.js` to `fix-master-data.js`, `workbook-loader.js`, `package.json`, `generate-year-data.js`?**
  _High betweenness centrality (0.101) - this node is a cross-community bridge._
- **What connects `minUI5Version`, `minUI5Version`, `@playwright/test` to the rest of the system?**
  _7 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `settings` be split into smaller, more focused modules?**
  _Cohesion score 0.09486166007905138 - nodes in this community are weakly interconnected._
- **Why does `@sap/cds` connect `package.json` to `energy-calculator.test.js`?**
  _High betweenness centrality (0.027) - this node is a cross-community bridge._
- **Should `fix-master-data.js` be split into smaller, more focused modules?**
  _Cohesion score 0.07056451612903226 - nodes in this community are weakly interconnected._
- **Should `package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.05555555555555555 - nodes in this community are weakly interconnected._
- **Should `models` be split into smaller, more focused modules?**
  _Cohesion score 0.09523809523809523 - nodes in this community are weakly interconnected._