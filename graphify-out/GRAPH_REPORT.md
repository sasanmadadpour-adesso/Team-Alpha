# Graph Report - Team-Alpha  (2026-10-16)

## Corpus Check
- 37 files · ~17,817 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 17 file(s) not represented in the graph (top: .properties 6, .css 3, .xml 3)

## Summary
- 370 nodes · 497 edges · 23 communities (15 shown, 8 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 20 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `c8a4a587`
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
- energy-trends.test.js
- AGENTS.md
- energy-overview-service.js
- BuildingHouse.js
- nav-logic.test.js
- NavHistory.js
- ref_node_assert

## God Nodes (most connected - your core abstractions)
1. `project()` - 15 edges
2. `settings` - 12 edges
3. `scripts` - 9 edges
4. `createWorkbookRepository()` - 9 edges
5. `sap.app` - 8 edges
6. `consumptionProfile()` - 8 edges
7. `mapWorkbook()` - 8 edges
8. `models` - 8 edges
9. `xlsx` - 7 edges
10. `calculate()` - 7 edges

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

## Communities (23 total, 8 thin omitted)

### Community 0 - "settings"
Cohesion: 0.07
Nodes (33): id, name, options, type, id, name, options, type (+25 more)

### Community 2 - "fix-master-data.js"
Cohesion: 0.07
Nodes (27): fs, path, root, workbooks, XLSX, applyFixes(), CITY_FIXES, configs (+19 more)

### Community 3 - "package.json"
Cohesion: 0.06
Nodes (35): cds, query, requires, dependencies, install, npx, playwright, @playwright/test (+27 more)

### Community 4 - "models"
Cohesion: 0.10
Nodes (20): models, name, npm, options, agent, build, plan, model (+12 more)

### Community 5 - "energy-calculator.test.js"
Cohesion: 0.07
Nodes (36): detect(), FIELDS, groupBy(), interpolate(), issue(), languageOf(), localize(), place() (+28 more)

### Community 6 - "libs"
Cohesion: 0.07
Nodes (27): libs, minUI5Version, desktop, phone, tablet, settings, type, icon (+19 more)

### Community 7 - "generate-year-data.js"
Cohesion: 0.19
Nodes (19): annualMeans(), apply(), buildSeries(), configs, consumptionProfile(), dayOfYear(), fitMean(), gauss() (+11 more)

### Community 8 - "sap.app"
Cohesion: 0.13
Nodes (15): version, mainService, settings, type, uri, sap.app, applicationVersion, dataSources (+7 more)

### Community 9 - "workbook-loader.js"
Cohesion: 0.10
Nodes (27): { calculate }, { createWorkbookRepository }, result, snapshot, boolean(), createWorkbookRepository(), DEFAULT_WORKBOOK, fs (+19 more)

### Community 10 - "Mieterstrom CAP Backend Simulator"
Cohesion: 0.25
Nodes (7): API areas, Data quality rules, Master data repair, Mieterstrom CAP Backend Simulator, Run locally, Tests, UI behaviour

### Community 12 - "energy-trends.test.js"
Cohesion: 0.24
Nodes (9): bucketStart(), granularity(), parseDate(), trends(), VALUE_FIELDS, assert, { createWorkbookRepository }, test (+1 more)

### Community 17 - "energy-overview-service.js"
Cohesion: 0.10
Nodes (18): { apply }, { calculate }, cds, { createWorkbookRepository }, filterRows(), issueIndex, { localize, summarize }, { project } (+10 more)

### Community 19 - "nav-logic.test.js"
Cohesion: 0.33
Nodes (6): describe(), nextState(), parseHash(), assert, { parseHash, nextState, describe, normalize }, test

### Community 20 - "NavHistory.js"
Cohesion: 0.60
Nodes (5): bundle(), onHashChanged(), render(), text(), title()

### Community 23 - "ref_node_assert"
Cohesion: 0.09
Nodes (15): assert, { calculate }, { createWorkbookRepository }, test, assert, fs, path, root (+7 more)

## Knowledge Gaps
- **6 isolated node(s):** `minUI5Version`, `@playwright/test`, `install`, `npx`, `playwright` (+1 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 225 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **8 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `xlsx` connect `fix-master-data.js` to `workbook-loader.js`, `package.json`, `generate-year-data.js`?**
  _High betweenness centrality (0.115) - this node is a cross-community bridge._
- **What connects `minUI5Version`, `@playwright/test`, `install` to the rest of the system?**
  _6 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `settings` be split into smaller, more focused modules?**
  _Cohesion score 0.06628787878787878 - nodes in this community are weakly interconnected._
- **Why does `@sap/cds` connect `package.json` to `energy-overview-service.js`?**
  _High betweenness centrality (0.032) - this node is a cross-community bridge._
- **Should `fix-master-data.js` be split into smaller, more focused modules?**
  _Cohesion score 0.06722689075630252 - nodes in this community are weakly interconnected._
- **Why does `sap.ui5` connect `libs` to `settings`?**
  _High betweenness centrality (0.028) - this node is a cross-community bridge._
- **Should `package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.05555555555555555 - nodes in this community are weakly interconnected._