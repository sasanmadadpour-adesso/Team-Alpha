const fs = require('node:fs');
const path = require('node:path');
const XLSX = require('xlsx');

const DEFAULT_WORKBOOK = path.resolve(__dirname, '../../../Dataset_English.xlsx');
const REQUIRED_SHEETS = [
  'Producer Onboarding',
  'MK7 Participants',
  'Hourly Consumption',
  'Hourly Generation',
  'Energy Pricing',
  'Field Descriptions',
  'Financial Rules'
];

const REQUIRED_COLUMNS = {
  'Producer Onboarding': ['first_name', 'last_name', 'building_id'],
  'MK7 Participants': ['mk7_role', 'Teilnahme MK7', 'metering_location_id_MeLo', 'building_id'],
  'Hourly Consumption': ['start_time', 'building_id', 'metering_location_id_MeLo', 'consumption_kwh'],
  'Hourly Generation': ['start_time', 'building_id', 'generation_kwh'],
  'Energy Pricing': ['start_time', 'market_price_eur_kwh', 'retail_price_eur_kwh'],
  'Field Descriptions': ['field', 'requirement', 'description'],
  'Financial Rules': ['section', 'item', 'calculation_or_rule']
};

function value(row, key) {
  return row[key] === undefined || row[key] === '' ? null : row[key];
}

function text(row, key) {
  const v = value(row, key);
  return v === null ? null : String(v);
}

function number(row, key) {
  const v = value(row, key);
  return v === null ? null : Number(v);
}

function boolean(row, key) {
  const v = value(row, key);
  if (v === null) return null;
  return v === true || String(v).toLowerCase() === 'true' || String(v).toLowerCase() === 'ja';
}

function timestamp(raw) {
  if (raw === null || raw === undefined || raw === '') return null;
  if (typeof raw === 'number') {
    return new Date(Date.UTC(1899, 11, 30) + raw * 86400000).toISOString();
  }
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.valueOf())) throw new Error(`Invalid timestamp: ${raw}`);
  return parsed.toISOString();
}

function rows(workbook, sheetName) {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) throw new Error(`Missing required worksheet: ${sheetName}`);
  return XLSX.utils.sheet_to_json(sheet, { defval: null, raw: true });
}

function validate(workbook) {
  for (const sheetName of REQUIRED_SHEETS) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) throw new Error(`Missing required worksheet: ${sheetName}`);
    const headers = XLSX.utils.sheet_to_json(sheet, { header: 1, range: 0, blankrows: false })[0] || [];
    for (const column of REQUIRED_COLUMNS[sheetName]) {
      if (!headers.includes(column)) throw new Error(`Worksheet "${sheetName}" is missing column "${column}"`);
    }
  }
}

function mapWorkbook(workbook) {
  validate(workbook);
  const source = {};
  for (const sheetName of REQUIRED_SHEETS) source[sheetName] = rows(workbook, sheetName);

  const producerOnboardings = source['Producer Onboarding'].map((r, i) => ({
    ID: `producer-${i + 1}`,
    sourceRow: i + 2,
    firstName: text(r, 'first_name'), lastName: text(r, 'last_name'), email: text(r, 'email'),
    salutation: text(r, 'salutation'), isBusiness: boolean(r, 'is_business'), isReverseCharge: boolean(r, 'is_reverse_charge'),
    deliveryStreet: text(r, 'deliv_address_street'), deliveryHouseNumber: text(r, 'deliv_address_house_number'),
    deliveryZipCode: text(r, 'deliv_address_zipcode'), deliveryCity: text(r, 'deliv_address_city'),
    subscriptionReason: text(r, 'subscription_reason'), productionType: text(r, 'production_type'),
    plantCapacityKw: number(r, 'plant_capacity_kw'), latitude: number(r, 'plant_specifics.latitude'), longitude: number(r, 'plant_specifics.longitude'),
    marketLocationIdentifier: text(r, 'market_location_identifier'), tranche: text(r, 'tranche'),
    preferredDeliveryStart: timestamp(value(r, 'preferred_delivery_start')), saasCustomerId: text(r, 'saas_customer_id'),
    saasContractId: text(r, 'saas_contract_id'), productName: text(r, 'product_name'), consumerSaasContractId: text(r, 'consumer_saas_contract_id'),
    controlResource: text(r, 'control_resource'), technicalResources: text(r, 'technical_resources'),
    contractStartUtc: timestamp(value(r, 'contract_start_utc')), contractEndUtc: timestamp(value(r, 'contract_end_utc')), buildingId: text(r, 'building_id')
  }));
  const participants = source['MK7 Participants'].map((r, i) => ({
    ID: text(r, 'metering_location_id_MeLo') || `participant-${i + 1}`,
    sourceRow: i + 2,
    city: text(r, 'city'), operator: text(r, 'mk7_operator'), streetAddress: text(r, 'street_address'), role: text(r, 'mk7_role'),
    participation: text(r, 'Teilnahme MK7'), supplyStartUtc: timestamp(value(r, 'mk7_supply_start_utc')),
    meteringLocationId: text(r, 'metering_location_id_MeLo'), meterNumber: text(r, 'meter_number'),
    importMarketLocationId: text(r, 'market_location_id_import_MaLo'), exportMarketLocationId: text(r, 'market_location_id_export_MaLo'),
    cityPostalCode: text(r, 'city_postal_code'), meteringOperator: text(r, 'metering_operator'), gridOperatorName: text(r, 'grid_operator_name_sap'),
    meteringSystem: text(r, 'metering_system'), contractStartUtc: timestamp(value(r, 'contract_start_utc')), contractEndUtc: timestamp(value(r, 'contract_end_utc')), buildingId: text(r, 'building_id')
  }));
  const consumption = source['Hourly Consumption'].map((r, i) => ({
    ID: `${text(r, 'building_id')}-${text(r, 'metering_location_id_MeLo')}-${text(r, 'start_time')}`,
    startTime: timestamp(value(r, 'start_time')), endTime: timestamp(value(r, 'end_time')), buildingId: text(r, 'building_id'),
    meteringLocationId: text(r, 'metering_location_id_MeLo'), marketLocationId: text(r, 'market_location_id_MaLo'), participation: text(r, 'Teilnahme MK7'),
    consumptionKwh: number(r, 'consumption_kwh'), energyUnit: text(r, 'energy_unit'), aggregationType: text(r, 'aggregation_type')
  }));
  const generation = source['Hourly Generation'].map(r => ({
    ID: `${text(r, 'building_id')}-${text(r, 'market_location_id_MaLo')}-${text(r, 'start_time')}`,
    startTime: timestamp(value(r, 'start_time')), endTime: timestamp(value(r, 'end_time')), buildingId: text(r, 'building_id'), marketLocationId: text(r, 'market_location_id_MaLo'),
    productionType: text(r, 'production_type'), plantCapacityKw: number(r, 'plant_capacity_kw'), generationKwh: number(r, 'generation_kwh'), energyUnit: text(r, 'energy_unit'), aggregationType: text(r, 'aggregation_type')
  }));
  const prices = source['Energy Pricing'].map(r => ({
    ID: `price-${text(r, 'start_time')}`, startTime: timestamp(value(r, 'start_time')), endTime: timestamp(value(r, 'end_time')), aggregationType: text(r, 'aggregation_type'),
    marketPriceEurKwh: number(r, 'market_price_eur_kwh'), retailPriceEurKwh: number(r, 'retail_price_eur_kwh'), plantPurchasePriceEurKwh: number(r, 'plant_purchase_price_eur_kwh'), exportRemunerationEurKwh: number(r, 'export_remuneration_eur_kwh'), mieterstromSubsidyEurKwh: number(r, 'mieterstrom_subsidy_eur_kwh'), meteringFeeEurPerMeter24h: number(r, 'metering_fee_eur_per_meter_24h'), reststromSupplier: text(r, 'reststrom_supplier'), networkOperator: text(r, 'network_operator'), meteringOperator: text(r, 'metering_operator')
  }));
  const fieldDescriptions = source['Field Descriptions'].map((r, i) => ({ ID: text(r, 'field') || `field-${i + 1}`, field: text(r, 'field'), requirement: text(r, 'requirement'), description: text(r, 'description') }));
  const financialRules = source['Financial Rules'].map((r, i) => ({ ID: `rule-${i + 1}`, section: text(r, 'section'), item: text(r, 'item'), payer: text(r, 'payer'), recipient: text(r, 'recipient'), rateSource: text(r, 'rate_source'), calculationOrRule: text(r, 'calculation_or_rule') }));
  return { producerOnboardings, participants, consumption, generation, prices, fieldDescriptions, financialRules };
}

function createWorkbookRepository(workbookPath = process.env.WORKBOOK_PATH || DEFAULT_WORKBOOK) {
  let modifiedAt = 0;
  let snapshot;
  return {
    getSnapshot() {
      const stat = fs.statSync(workbookPath);
      if (!snapshot || stat.mtimeMs !== modifiedAt) {
        const next = mapWorkbook(XLSX.readFile(workbookPath, { cellDates: false }));
        snapshot = next;
        modifiedAt = stat.mtimeMs;
      }
      return snapshot;
    },
    workbookPath
  };
}

module.exports = { createWorkbookRepository, mapWorkbook, timestamp, REQUIRED_SHEETS };
