const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const appRoot = path.join(__dirname, '..', 'app', 'building-overview', 'webapp');

function readAppFile(fileName) {
  return fs.readFileSync(path.join(appRoot, fileName), 'utf8');
}

test('ships a Fiori Elements app with a same-origin OData V4 data source', () => {
  const manifest = JSON.parse(readAppFile('manifest.json'));
  const service = manifest['sap.app'].dataSources.mainService;

  assert.equal(manifest['sap.app'].id, 'vnb.constructs');
  assert.equal(service.type, 'OData');
  assert.equal(service.uri, '/odata/v4/energy-overview/');
  assert.equal(service.settings.odataVersion, '4.0');
  assert.equal(manifest['sap.ui5'].models[''].dataSource, 'mainService');
});

test('has a UI5 bootstrap page and component entry point', () => {
  assert.match(readAppFile('index.html'), /sap-ui-bootstrap/);
  assert.match(readAppFile('index.html'), /vnb\.constructs/);
  assert.match(readAppFile('Component.js'), /sap\/fe\/core\/AppComponent/);
});

test('routes a single combined overview page instead of two list-report tabs', () => {
  const manifest = JSON.parse(readAppFile('manifest.json'));
  const { routes, targets } = manifest['sap.ui5'].routing;

  assert.equal(routes.find(route => route.pattern === ':?query:').target, 'Overview');
  assert.equal(targets.Overview.type, 'Component');
  assert.equal(targets.Overview.name, 'vnb.constructs.overview');
  assert.ok(!targets.ConstructsList, 'the old construct-participants tab target must be gone');
  assert.ok(!targets.BuildingsList, 'the old building-structure tab target must be gone');
  assert.equal(targets.ConstructsObjectPage.name, 'sap.fe.templates.ObjectPage');
  assert.equal(targets.BuildingsObjectPage.name, 'sap.fe.templates.ObjectPage');
  assert.match(JSON.stringify(routes), /Constructs\(\{key\}\)/);
  assert.match(JSON.stringify(routes), /Buildings\(\{key\}\)/);
  // No standalone "Buildings" list route/tab remains.
  assert.ok(!routes.some(route => route.pattern === 'Buildings:?query:'));
});

test('the overview component hosts a single tree table with building roots and members', () => {
  const overviewRoot = path.join(appRoot, 'overview');
  const componentManifest = JSON.parse(fs.readFileSync(path.join(overviewRoot, 'manifest.json'), 'utf8'));
  assert.equal(componentManifest['sap.app'].id, 'vnb.constructs.overview');
  assert.ok(componentManifest['sap.ui5'].dependencies.libs['sap.ui.table']);
  assert.equal(componentManifest['sap.ui5'].rootView.viewName, 'vnb.constructs.overview.view.Overview');

  const componentJs = fs.readFileSync(path.join(overviewRoot, 'Component.js'), 'utf8');
  assert.match(componentJs, /UIComponent\.extend\("vnb\.constructs\.overview\.Component"/);

  const view = fs.readFileSync(path.join(overviewRoot, 'view', 'Overview.view.xml'), 'utf8');
  assert.match(view, /sap\.ui\.table/);
  assert.match(view, /<table:TreeTable/);
  assert.match(view, /arrayNames: \['children'\]/);
  assert.match(view, /detailHash/);

  const controller = fs.readFileSync(path.join(overviewRoot, 'controller', 'Overview.controller.js'), 'utf8');
  assert.match(controller, /ConstructTreeNodes/);
  assert.match(controller, /children/);
  assert.match(controller, /ListActions/);
  // Starts collapsed: the controller never forces an expansion on load.
  assert.match(controller, /collapseAll\(\)/);
  assert.doesNotMatch(controller, /expandToLevel\(1\);\s*\n\s*\}\s*else/);
  assert.equal(JSON.parse(fs.readFileSync(path.join(overviewRoot, 'manifest.json'), 'utf8'))['sap.ui5'].dependencies.libs['sap.f'] !== undefined, true);
});

test('the overview header mirrors the list report: dynamic page, search with find/filter modes, match navigation and tiles', () => {
  const view = fs.readFileSync(path.join(appRoot, 'overview', 'view', 'Overview.view.xml'), 'utf8');
  assert.match(view, /<f:DynamicPage/);
  assert.match(view, /<f:DynamicPageTitle/);
  assert.match(view, /<f:DynamicPageHeader/);
  assert.match(view, /<SearchField/);
  assert.match(view, /SegmentedButton/);
  assert.match(view, /onPrevMatch/);
  assert.match(view, /onNextMatch/);
  assert.match(view, /statFinished/);
  assert.match(view, /onToggleLanguage/);
});

test('the tree shows owner, merged MK7/switch-over status and a row navigation arrow', () => {
  const view = fs.readFileSync(path.join(appRoot, 'overview', 'view', 'Overview.view.xml'), 'utf8');
  assert.match(view, /treeOwner/);
  assert.match(view, /ownerName/);
  assert.match(view, /treeStatus/);
  assert.match(view, /<table:rowActionTemplate>/);
  assert.match(view, /type="Navigation"/);
  assert.match(view, /<table:rowSettingsTemplate>/);
  // The switch-over progress is only shown on the detail page, not in the overview; only the MK7 status icon is shown.
  assert.doesNotMatch(view, /ProgressIndicator/);
  assert.doesNotMatch(view, /switchoverStepLabel/);
});

test('contains annotation metadata for the building overview KPIs', () => {
   const annotations = fs.readFileSync(
    path.join(__dirname, '..', 'srv', 'energy-overview-annotations.cds'),
     'utf8'
   );
   const manifestText = readAppFile('manifest.json');

  for (const field of [
    'primaryMaLo',
    'buildingID',
    'totalConsumptionKwh',
    'totalGenerationKwh',
    'localEnergyKwh',
    'paymentBalanceEur'
  ]) {
    assert.match(annotations, new RegExp(`Value: ${field}`));
  }
   assert.match(manifestText, /EnergyTrend/);
  assert.match(annotations, /payments\/@UI\.LineItem/);
  assert.match(manifestText, /BuildingSchematic/);
  assert.doesNotMatch(annotations, /UI\.SelectionPresentationVariant/);
   const schematicFragment = readAppFile('ext/BuildingSchematic.fragment.xml');
   assert.match(schematicFragment, /vnb:BuildingHouse/);
   const houseControl = readAppFile('ext/BuildingHouse.js');
   for (const endpoint of ["Buildings('", '/consumers', '/solarProducers', '/windProducers']) assert.ok(houseControl.includes(endpoint), endpoint);
   assert.match(houseControl, /attachModelContextChange/);
   assert.match(houseControl, /hasSolar/);
   assert.match(houseControl, /hasWind/);
   assert.match(houseControl, /targetConstructID/);
   assert.match(houseControl, /averageGridImport24hKwh/);
   assert.match(houseControl, /averageGridExport24hKwh/);
   assert.match(houseControl, /participationCode/);
   // Three-state MK7 icon: not participating / participating-unfinished / participating-finished.
   assert.match(houseControl, /switchoverComplete/);
   assert.match(houseControl, /vnbBh-mk7-warn/);
   // The shared-meter MaLo in the roof is a link to its construct page, same as other MaLos.
   assert.match(houseControl, /sharedMeterConstructID/);
   assert.doesNotMatch(houseControl, /floorLabel|floor-number/);
   assert.match(readAppFile('css/building-house.css'), /\.vnbBh-scene/);
   assert.match(readAppFile('css/building-house.css'), /\.vnbBh-mk7-warn/);
   assert.match(manifestText, /css\/building-house\.css/);
   const topology = readAppFile('ext/Topology.fragment.xml');
   assert.match(topology, /vnb:LocationTopology/);
   const locations = readAppFile('ext/LocationTopology.js');
   for (const field of ['sharedMeterMaLo', 'sharedMeterMeLo', 'sharedMeterIsReal', 'isSharedMeter']) assert.ok(locations.includes(field), field);
   assert.doesNotMatch(locations, /hasDualMaLo|meterNumber/);
   // The "Echter Zähler (MaLo und MeLo)" / virtual-counter kind line was removed entirely.
   assert.doesNotMatch(locations, /meterReal|meterVirtual/);
   assert.match(manifestText, /css\/location-topology\.css/);
   const annotationsText = annotations;
   assert.doesNotMatch(annotationsText, /Value: hasDualMaLo|Value: meterNumber/);
   assert.match(annotationsText, /Value: address/);
   // Energy concept is a single numeric field shown as an SAP progress data point (8 steps).
   assert.match(annotationsText, /UI\.DataPoint #Switchover/);
   assert.match(annotationsText, /Visualization: #Progress/);
   assert.match(annotationsText, /TargetValue: switchoverTotalSteps/);
   // The shared energy counter's detail page shows whole-house grid import/export in the header.
   assert.match(annotationsText, /ResidualKpi/);
   assert.match(annotationsText, /counterKpiHidden/);
   assert.match(annotationsText, /SOLAR_GENERATION_KWH/);
   assert.match(annotationsText, /WIND_GENERATION_KWH/);
   assert.doesNotMatch(annotationsText, /HouseImport|HouseExport|houseGrid/);
   assert.doesNotMatch(annotationsText, /TestScenarios/);
   const trend = readAppFile('ext/EnergyTrend.js');
   assert.match(trend, /attachModelContextChange/);
   assert.match(trend, /detachModelContextChange/);
   assert.match(trend, /latestMeasurementTime/);
   assert.doesNotMatch(trend, /this\.\$\(\s*["']\./);
   assert.match(trend, /getElementById/);
   assert.match(trend, /ResizeObserver/);
   assert.match(trend, /vnbTrendTooltip/);
  assert.match(annotations, /UI\.Chart #Trend/);
  assert.match(annotations, /ENERGY_TREND/);
});

test('every sub-page gets a permanent link back to the index overview', () => {
  const navHistory = readAppFile('ext/NavHistory.js');
  const navLogic = readAppFile('ext/navLogic.js');
  assert.match(navLogic, /describeOverview/);
  assert.match(navHistory, /describeOverview/);
  assert.match(navHistory, /backToOverview|overviewDescription/);
});

test('the tree table has no inner height limit: fixed row count, page scrolls, no fit-to-content', () => {
  const view = fs.readFileSync(path.join(appRoot, 'overview', 'view', 'Overview.view.xml'), 'utf8');
  const controller = fs.readFileSync(path.join(appRoot, 'overview', 'controller', 'Overview.controller.js'), 'utf8');
  assert.match(view, /<f:DynamicPage id="overviewPage" fitContent="false"/);
  assert.match(view, /<rowmodes:Fixed rowCount="\{ui>\/rowCount\}"\/>/);
  assert.doesNotMatch(view, /visibleRowCountMode="Auto"/);
  assert.match(controller, /_syncRowCount/);
  assert.match(controller, /scrollIntoView/);
  assert.doesNotMatch(controller, /setFirstVisibleRow/);
});

test('the switch-over is shown as participant switch-over, not energy concept, and building progress is gone', () => {
  const annotations = fs.readFileSync(path.join(__dirname, '..', 'srv', 'energy-overview-annotations.cds'), 'utf8');
  const service = fs.readFileSync(path.join(__dirname, '..', 'srv', 'energy-overview-service.cds'), 'utf8');
  const de = fs.readFileSync(path.join(__dirname, '..', '_i18n', 'i18n_de.properties'), 'utf8');
  const en = fs.readFileSync(path.join(__dirname, '..', '_i18n', 'i18n_en.properties'), 'utf8');
  assert.match(de, /^SWITCHOVER=Teilnehmer Umstellung$/m);
  assert.match(en, /^SWITCHOVER=Participant switch-over$/m);
  assert.doesNotMatch(service, /averageEnergyConceptStep|totalEnergyConceptSteps/);
  assert.match(annotations, /Visualization: #Progress/);
  // Progress is only ever a whole number of steps.
  assert.match(service, /switchoverStep : Integer;/);
});
