const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { createWorkbookRepository } = require('../srv/lib/workbook-loader');

const XLSX = require('xlsx');

const english = createWorkbookRepository(path.join(__dirname, '..', '..', 'Dataset_English.xlsx')).getSnapshot();

// The loader reads the English workbook only, so the German one is normalised into the same shape here.
function germanSnapshot() {
  const workbook = XLSX.readFile(path.join(__dirname, '..', '..', 'Datensatz_Deutsch.xlsx'));
  const rows = name => XLSX.utils.sheet_to_json(workbook.Sheets[name], { defval: null });
  return {
    participants: rows('MK7 Teilnehmer').map(r => ({ buildingId: r.gebaeude_id, importMarketLocationId: String(r.marktlokation_id_bezug_MaLo), exportMarketLocationId: r.marktlokation_id_einspeisung_MaLo ? String(r.marktlokation_id_einspeisung_MaLo) : null, meteringLocationId: r.messlokation_id_MeLo, cityPostalCode: r.stadt_postleitzahl, streetAddress: r.strassenadresse, city: r.stadt })),
    producerOnboardings: rows('Erzeuger Registrierung').map(r => ({ buildingId: r.building_id, marketLocationIdentifier: String(r.market_location_identifier), deliveryZipCode: String(r.deliv_address_zipcode), deliveryStreet: r.deliv_address_street, deliveryCity: r.deliv_address_city })),
    generation: rows('Stündliche Erzeugung').map(r => ({ marketLocationId: String(r.marktlokation_id_MaLo) }))
  };
}
const german = germanSnapshot();

test('producers are identified by unique 11-digit MaLos that match plant export MaLo and generation rows', () => {
  for (const snapshot of [english, german]) {
    const ids = snapshot.producerOnboardings.map(row => row.marketLocationIdentifier);
    assert.equal(new Set(ids).size, 3);
    assert.ok(ids.every(id => /^\d{11}$/.test(id)));
    const exports = snapshot.participants.filter(row => row.exportMarketLocationId).map(row => row.exportMarketLocationId);
    assert.deepEqual([...exports].sort(), [...ids].sort());
    assert.deepEqual([...new Set(snapshot.generation.map(row => row.marketLocationId))].sort(), [...ids].sort());
    assert.equal(snapshot.generation.length, 26280);
  }
});

test('every building has one postcode and the real city names and streets', () => {
  for (const snapshot of [english, german]) {
    for (const building of ['B-FRA-01', 'B-CGN-01', 'B-MUL-01']) {
      const rows = snapshot.participants.filter(row => row.buildingId === building);
      assert.equal(new Set(rows.map(row => row.cityPostalCode)).size, 1, building);
      const producer = snapshot.producerOnboardings.find(row => row.buildingId === building);
      assert.ok(rows.every(row => row.cityPostalCode.endsWith(String(producer.deliveryZipCode))), building);
    }
    const text = JSON.stringify(snapshot.participants) + JSON.stringify(snapshot.producerOnboardings);
    assert.doesNotMatch(text, /Müllheim|Vilbelerlandstrß/);
    assert.match(text, /Mülheim an der Ruhr 45470/);
    assert.match(text, /Vilbeler Landstraße 21/);
  }
});

test('both language workbooks carry identical master data', () => {
  const pick = rows => rows.map(row => [row.buildingId, row.importMarketLocationId, row.exportMarketLocationId, row.meteringLocationId, row.cityPostalCode, row.streetAddress]);
  assert.deepEqual(pick(english.participants).map(r => r.map(String)), pick(german.participants).map(r => r.map(String)));
  assert.deepEqual(english.producerOnboardings.map(row => row.marketLocationIdentifier), german.producerOnboardings.map(row => row.marketLocationIdentifier));
});
