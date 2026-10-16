// Repairs master data in both workbooks (idempotent, edits cells in place):
//  1. Producers are identified by their own export MaLo instead of the plant's MeLo.
//     The new MaLo is also written to the plant's export MaLo and to all hourly generation rows.
//  2. One postcode per building (the postcode of the producer's delivery address).
//  3. City "Müllheim an der Ruhr" -> "Mülheim an der Ruhr"; street "Vilbelerlandstrß" -> "Vilbeler Landstraße".
// MaLo/MeLo check digits are intentionally not touched: they do not exist.
const path = require('node:path');
const XLSX = require('xlsx');

const root = path.resolve(__dirname, '../..');

// plant MeLo (the old producer identifier) -> its own export MaLo
const PLANT_MALO = new Map([
  ['DE0073325707820000000000000088943', '51664053761'],
  ['DE00733257078200000000000000880945', '51664053779'],
  ['DE0001815707800000101300000139428', '51664053787']
]);

const CITY_FIXES = [[/Müllheim an der Ruhr/g, 'Mülheim an der Ruhr']];
const STREET_FIXES = [[/Vilbelerlandstrß\s*/g, 'Vilbeler Landstraße ']];

const configs = [
  { file: 'Dataset_English.xlsx', producers: 'Producer Onboarding', participants: 'MK7 Participants', generation: 'Hourly Generation',
    cols: { producerId: 'market_location_identifier', zip: 'deliv_address_zipcode', pCity: 'deliv_address_city', pStreet: 'deliv_address_street', house: 'deliv_address_house_number', building: 'building_id', meLo: 'metering_location_id_MeLo', exportMaLo: 'market_location_id_export_MaLo', cityZip: 'city_postal_code', city: 'city', street: 'street_address', genMaLo: 'market_location_id_MaLo' } },
  { file: 'Datensatz_Deutsch.xlsx', producers: 'Erzeuger Registrierung', participants: 'MK7 Teilnehmer', generation: 'Stündliche Erzeugung',
    cols: { producerId: 'market_location_identifier', zip: 'deliv_address_zipcode', pCity: 'deliv_address_city', pStreet: 'deliv_address_street', house: 'deliv_address_house_number', building: 'gebaeude_id', meLo: 'messlokation_id_MeLo', exportMaLo: 'marktlokation_id_einspeisung_MaLo', cityZip: 'stadt_postleitzahl', city: 'stadt', street: 'strassenadresse', genMaLo: 'marktlokation_id_MaLo' } }
];

function sheetTable(workbook, name) {
  const sheet = workbook.Sheets[name];
  if (!sheet) throw new Error(`Missing sheet ${name}`);
  const range = XLSX.utils.decode_range(sheet['!ref']);
  const headers = new Map();
  for (let c = range.s.c; c <= range.e.c; c += 1) {
    const cell = sheet[XLSX.utils.encode_cell({ r: range.s.r, c })];
    if (cell) headers.set(String(cell.v), c);
  }
  const column = key => { if (!headers.has(key)) throw new Error(`${name}: missing column ${key}`); return headers.get(key); };
  const get = (r, key) => sheet[XLSX.utils.encode_cell({ r, c: column(key) })]?.v;
  const set = (r, key, value) => {
    const address = XLSX.utils.encode_cell({ r, c: column(key) });
    const cell = sheet[address] || (sheet[address] = { t: 's' });
    cell.v = value; cell.t = typeof value === 'number' ? 'n' : 's'; delete cell.w;
  };
  const rows = []; for (let r = range.s.r + 1; r <= range.e.r; r += 1) rows.push(r);
  return { rows, get, set };
}

function applyFixes(text, fixes) { return fixes.reduce((value, [pattern, replacement]) => value.replace(pattern, replacement), text); }

function update(config) {
  const k = config.cols;
  const workbook = XLSX.readFile(path.join(root, config.file));
  const producers = sheetTable(workbook, config.producers);
  const participants = sheetTable(workbook, config.participants);
  const generation = sheetTable(workbook, config.generation);

  // 2. postcode per building comes from the producer's delivery address
  const zipByBuilding = new Map();
  for (const r of producers.rows) zipByBuilding.set(String(producers.get(r, 'building_id')), String(producers.get(r, k.zip)));

  // 1. producers: MeLo-style identifier -> own export MaLo (already-migrated values stay)
  let changedProducers = 0;
  for (const r of producers.rows) {
    const current = String(producers.get(r, k.producerId));
    const next = PLANT_MALO.get(current);
    if (next) { producers.set(r, k.producerId, next); changedProducers += 1; }
    producers.set(r, k.pCity, applyFixes(String(producers.get(r, k.pCity)), CITY_FIXES).trim());
    producers.set(r, k.pStreet, applyFixes(String(producers.get(r, k.pStreet)), STREET_FIXES).trim());
  }

  let changedParticipants = 0;
  for (const r of participants.rows) {
    const meLo = String(participants.get(r, k.meLo));
    if (PLANT_MALO.has(meLo)) { participants.set(r, k.exportMaLo, PLANT_MALO.get(meLo)); changedParticipants += 1; }
    const building = String(participants.get(r, k.building));
    const city = applyFixes(String(participants.get(r, k.city)), CITY_FIXES).trim();
    participants.set(r, k.city, city);
    participants.set(r, k.cityZip, `${city} ${zipByBuilding.get(building)}`);
    participants.set(r, k.street, applyFixes(String(participants.get(r, k.street)), STREET_FIXES).replace(/\s+/g, ' ').trim());
  }

  let changedGeneration = 0;
  for (const r of generation.rows) {
    const next = PLANT_MALO.get(String(generation.get(r, k.genMaLo)));
    if (next) { generation.set(r, k.genMaLo, next); changedGeneration += 1; }
  }

  // validation
  const ids = producers.rows.map(r => String(producers.get(r, k.producerId)));
  if (new Set(ids).size !== ids.length || ids.some(id => !/^\d{11}$/.test(id))) throw new Error(`${config.file}: producer ids must be unique 11-digit MaLos`);
  const exports = participants.rows.map(r => participants.get(r, k.exportMaLo)).filter(Boolean).map(String);
  if (new Set(exports).size !== exports.length) throw new Error(`${config.file}: export MaLos must be unique`);
  const genIds = new Set(generation.rows.map(r => String(generation.get(r, k.genMaLo))));
  if (genIds.size !== ids.length || ids.some(id => !genIds.has(id))) throw new Error(`${config.file}: generation rows do not match producers`);

  XLSX.writeFile(workbook, path.join(root, config.file));
  console.log(`${config.file}: producers ${changedProducers}, participant export MaLos ${changedParticipants}, generation rows ${changedGeneration}`);
}

for (const config of configs) update(config);
