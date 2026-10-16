const path = require('node:path');
const XLSX = require('xlsx');

const root = path.resolve(__dirname, '../..');
const START = Date.UTC(2025, 9, 16);
const HOURS = 365 * 24;
const SOLAR_YIELD_KWH_PER_KWP = 950;
const PRIMARY = 'Dataset_English.xlsx';

const configs = [
  { file: 'Dataset_English.xlsx', sheets: { consumption: 'Hourly Consumption', generation: 'Hourly Generation' }, keys: { start: 'start_time', meLo: 'metering_location_id_MeLo', maLo: 'market_location_id_MaLo', consumption: 'consumption_kwh', generation: 'generation_kwh', productionType: 'production_type', capacity: 'plant_capacity_kw' } },
  { file: 'Datensatz_Deutsch.xlsx', sheets: { consumption: 'Stündlicher Verbrauch', generation: 'Stündliche Erzeugung' }, keys: { start: 'beginn_utc', meLo: 'messlokation_id_MeLo', maLo: 'marktlokation_id_MaLo', consumption: 'verbrauch_kwh', generation: 'erzeugung_kwh', productionType: 'erzeugungsart', capacity: 'anlagenleistung_kw' } }
];

// Deterministic PRNG (mulberry32) so regenerating yields identical workbooks.
function seeded(seedText) {
  let seed = [...seedText].reduce((hash, character) => Math.imul(hash ^ character.charCodeAt(0), 16777619) >>> 0, 2166136261);
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gauss(random) {
  const u = Math.max(random(), 1e-12);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * random());
}

const localHour = index => (new Date(START + index * 3600000).getUTCHours() + 1) % 24; // CET approximation
const dayOfYear = index => Math.floor(index / 24);
const weekday = index => new Date(START + index * 3600000).getUTCDay();

// Scales a raw profile so its annual mean equals the target, clipped to [min, max].
function fitMean(raw, target, min, max) {
  let values = raw.slice();
  for (let iteration = 0; iteration < 4; iteration += 1) {
    const mean = values.reduce((total, value) => total + value, 0) / values.length || 1;
    const factor = target / mean;
    values = values.map(value => Math.min(max, Math.max(min, value * factor)));
  }
  return values.map(value => Number(value.toFixed(3)));
}

function consumptionProfile(identity, targetMean) {
  const random = seeded(`consumption|${identity}`);
  let noise = 0;
  const raw = [];
  for (let index = 0; index < HOURS; index += 1) {
    const hour = localHour(index);
    const day = dayOfYear(index);
    const morning = Math.exp(-((hour - 7.5) ** 2) / 3);
    const evening = Math.exp(-((hour - 19.5) ** 2) / 8);
    const midday = 0.15 * Math.exp(-((hour - 13) ** 2) / 10);
    const diurnal = 0.45 + 0.35 * morning + 0.75 * evening + midday;
    const weekend = weekday(index) === 0 || weekday(index) === 6 ? 1.12 : 1;
    const season = 1 + 0.15 * Math.cos(2 * Math.PI * (day - 15) / 365);
    noise = 0.6 * noise + 0.25 * gauss(random);
    raw.push(diurnal * weekend * season * Math.exp(0.5 * noise));
  }
  return fitMean(raw, targetMean, 0, Infinity);
}

function solarProfile(identity, capacityKw) {
  const random = seeded(`solar|${identity}`);
  const clouds = [];
  let cloud = 0.6;
  for (let day = 0; day < 365; day += 1) {
    cloud = 0.7 * cloud + 0.3 * random();
    clouds.push(0.25 + 0.75 * cloud);
  }
  const raw = [];
  for (let index = 0; index < HOURS; index += 1) {
    const day = dayOfYear(index);
    const hourMid = localHour(index) + 0.5;
    const daylight = 12 + 4 * Math.sin(2 * Math.PI * (day - 80) / 365);
    const sunrise = 13 - daylight / 2;
    const sunset = 13 + daylight / 2;
    const irradiance = hourMid < sunrise || hourMid > sunset ? 0 : Math.sin(Math.PI * (hourMid - sunrise) / daylight) ** 1.2;
    raw.push(irradiance * clouds[day] * (0.97 + 0.03 * random()));
  }
  return fitMean(raw, SOLAR_YIELD_KWH_PER_KWP * capacityKw / HOURS, 0, capacityKw);
}

function windProfile(identity, capacityKw, targetMean) {
  const random = seeded(`wind|${identity}`);
  let weather = 0;
  const raw = [];
  for (let index = 0; index < HOURS; index += 1) {
    weather = 0.985 * weather + 0.15 * gauss(random);
    const speed = 0.5 + 0.5 * Math.tanh(0.9 * weather);
    const gust = Math.exp(0.12 * gauss(random));
    raw.push(capacityKw * Math.min(1, speed * gust) ** 1.6);
  }
  return fitMean(raw, targetMean, 0, capacityKw);
}

function annualMeans(rows, idKey, valueKey) {
  const totals = new Map();
  for (const row of rows) {
    const id = row[idKey];
    const entry = totals.get(id) || { sum: 0, count: 0 };
    entry.sum += Number(row[valueKey]) || 0;
    entry.count += 1;
    totals.set(id, entry);
  }
  return new Map([...totals].map(([id, entry]) => [id, entry.sum / Math.max(entry.count, 1)]));
}

// Targets come from the primary (English) workbook so both languages get identical values.
function buildSeries(primaryWorkbookPath) {
  const workbook = XLSX.readFile(primaryWorkbookPath);
  const primary = configs[0];
  const consumption = XLSX.utils.sheet_to_json(workbook.Sheets[primary.sheets.consumption], { defval: null });
  const generation = XLSX.utils.sheet_to_json(workbook.Sheets[primary.sheets.generation], { defval: null });
  const k = primary.keys;
  const consumptionMeans = annualMeans(consumption, k.meLo, k.consumption);
  const generationMeans = annualMeans(generation, k.maLo, k.generation);
  const capacities = new Map(generation.map(row => [row[k.maLo], Number(row[k.capacity]) || 0]));
  const types = new Map(generation.map(row => [row[k.maLo], String(row[k.productionType] || '').toLowerCase()]));
  const values = new Map();
  for (const [identity, mean] of consumptionMeans) {
    const series = consumptionProfile(identity, mean);
    series.forEach((value, index) => values.set(`C|${identity}|${index}`, value));
  }
  for (const [identity, mean] of generationMeans) {
    const capacity = capacities.get(identity);
    const isSolar = types.get(identity).includes('solar') || types.get(identity).includes('sonne');
    const series = isSolar ? solarProfile(identity, capacity) : windProfile(identity, capacity, mean);
    series.forEach((value, index) => values.set(`G|${identity}|${index}`, value));
  }
  return values;
}

function hourIndex(value) {
  return Math.round((new Date(value).valueOf() - START) / 3600000);
}

function apply(config, values) {
  const workbookPath = path.join(root, config.file);
  const workbook = XLSX.readFile(workbookPath);
  const k = config.keys;
  const stats = { consumption: 0, generation: 0 };
  const update = (sheetName, idKey, valueKey, prefix, field) => {
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: null });
    for (const row of rows) {
      const index = hourIndex(row[k.start]);
      const value = values.get(`${prefix}|${row[idKey]}|${index}`);
      if (value === undefined || index < 0 || index >= HOURS) throw new Error(`${config.file}: no generated value for ${row[idKey]} at ${row[k.start]}`);
      row[valueKey] = value;
      stats[field] += 1;
    }
    workbook.Sheets[sheetName] = XLSX.utils.json_to_sheet(rows);
  };
  update(config.sheets.consumption, k.meLo, k.consumption, 'C', 'consumption');
  update(config.sheets.generation, k.maLo, k.generation, 'G', 'generation');
  XLSX.writeFile(workbook, workbookPath);
  console.log(`${config.file}: ${stats.consumption} consumption, ${stats.generation} generation values written`);
}

const values = buildSeries(path.join(root, PRIMARY));
for (const config of configs) apply(config, values);
