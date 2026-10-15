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

test('configures the building list report and object page', () => {
  const manifest = JSON.parse(readAppFile('manifest.json'));
  const targets = manifest['sap.ui5'].routing.targets;

  assert.equal(targets.ConstructsList.options.settings.contextPath, '/Constructs');
  assert.equal(targets.ConstructsList.name, 'sap.fe.templates.ListReport');
  assert.equal(targets.ConstructsObjectPage.name, 'sap.fe.templates.ObjectPage');
  assert.match(JSON.stringify(manifest['sap.ui5'].routing.routes), /Constructs\(\{key\}\)/);
  const views = targets.ConstructsList.options.settings.views.paths;
  assert.deepEqual(views.map(view => view.key), ['constructParticipants', 'buildingStructure']);
  assert.deepEqual(views.map(view => view.entitySet), ['Constructs', 'Buildings']);
   assert.equal(views[0].label, '{i18n>constructParticipantsView}');
   assert.equal(views[1].label, '{i18n>buildingStructureView}');
  assert.equal(targets.ConstructsList.options.settings.navigation.Buildings.detail.route, 'BuildingsObjectPage');
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
  assert.match(manifestText, /BuildingsList/);
  assert.match(manifestText, /BuildingSchematic/);
  assert.match(readAppFile('ext/BuildingSchematic.fragment.xml'), /energyConceptCurrentStep/);
  assert.match(annotations, /UI\.Chart #Trend/);
  assert.match(annotations, /ENERGY_TREND/);
});
