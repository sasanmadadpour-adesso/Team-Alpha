const RANGES = new Set(['24h', '7d', '30d', '90d', '1y']);
const STATUSES = new Set(['COMPLETED', 'IN_PROGRESS']);
const GRANULARITIES = new Set(['hour', 'day', 'week']);

export class PortalContractError extends Error {
  constructor(message) { super(`Invalid house-member portal response: ${message}`); this.name = 'PortalContractError'; }
}

function required(object, field, path) {
  if (!object || object[field] === undefined) throw new PortalContractError(`${path}.${field} is required`);
  return object[field];
}
function string(value, path) { if (typeof value !== 'string' || !value) throw new PortalContractError(`${path} must be a non-empty string`); return value; }
function number(value, path, { min = 0, max } = {}) { if (typeof value !== 'number' || !Number.isFinite(value) || value < min || (max !== undefined && value > max)) throw new PortalContractError(`${path} must be a valid number`); return value; }
function energy(object, fields, path) { for (const field of fields) number(required(object, field, path), `${path}.${field}`); }
function address(object, path) { string(required(object, 'street', path), `${path}.street`); string(required(object, 'postalCode', path), `${path}.postalCode`); string(required(object, 'city', path), `${path}.city`); }
function noExtraKeys(object, allowed, path) { for (const key of Object.keys(object || {})) if (!allowed.has(key)) throw new PortalContractError(`${path}.${key} is not part of the public contract`); }
function trend(object, fields, path) {
  const points = required(object, 'points', path);
  if (!Array.isArray(points)) throw new PortalContractError(`${path}.points must be an array`);
  const granularity = string(required(object, 'granularity', path), `${path}.granularity`);
  if (!GRANULARITIES.has(granularity)) throw new PortalContractError(`${path}.granularity is unsupported`);
  string(required(object, 'unit', path), `${path}.unit`);
  let previous = '';
  for (const [index, point] of points.entries()) {
    const pointPath = `${path}.points[${index}]`;
    const timestamp = string(required(point, 'timestamp', pointPath), `${pointPath}.timestamp`);
    if (Number.isNaN(Date.parse(timestamp)) || timestamp <= previous) throw new PortalContractError(`${pointPath}.timestamp must be chronological ISO time`);
    previous = timestamp;
    number(required(point, 'intervalCount', pointPath), `${pointPath}.intervalCount`, { min: 1 });
    noExtraKeys(point, new Set(['timestamp', 'intervalCount', ...fields]), pointPath);
    energy(point, fields, pointPath);
  }
}

export function validatePortalData(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new PortalContractError('root must be an object');
  noExtraKeys(payload, new Set(['schemaVersion', 'generatedAt', 'range', 'brand', 'member', 'building', 'trends']), 'root');
  string(required(payload, 'schemaVersion', 'root'), 'root.schemaVersion');
  const generatedAt = string(required(payload, 'generatedAt', 'root'), 'root.generatedAt');
  if (Number.isNaN(Date.parse(generatedAt))) throw new PortalContractError('root.generatedAt must be ISO time');
  const range = string(required(payload, 'range', 'root'), 'root.range');
  if (!RANGES.has(range)) throw new PortalContractError('root.range is unsupported');
  const brand = required(payload, 'brand', 'root');
  noExtraKeys(brand, new Set(['name', 'portalName', 'logoUrl', 'primaryColor', 'accentColor']), 'root.brand');
  string(required(brand, 'name', 'root.brand'), 'root.brand.name');
  const portalName = required(brand, 'portalName', 'root.brand');
  noExtraKeys(portalName, new Set(['de', 'en']), 'root.brand.portalName');
  string(required(portalName, 'de', 'root.brand.portalName'), 'root.brand.portalName.de');
  string(required(portalName, 'en', 'root.brand.portalName'), 'root.brand.portalName.en');
  for (const field of ['logoUrl', 'primaryColor', 'accentColor']) string(required(brand, field, 'root.brand'), `root.brand.${field}`);
  const member = required(payload, 'member', 'root');
  noExtraKeys(member, new Set(['malo', 'melo', 'address', 'switchoverStatus', 'energy']), 'root.member');
  for (const field of ['malo', 'melo']) string(required(member, field, 'root.member'), `root.member.${field}`);
  address(required(member, 'address', 'root.member'), 'root.member.address');
  const status = string(required(member, 'switchoverStatus', 'root.member'), 'root.member.switchoverStatus');
  if (!STATUSES.has(status)) throw new PortalContractError('root.member.switchoverStatus is unsupported');
  const memberEnergy = required(member, 'energy', 'root.member');
  noExtraKeys(memberEnergy, new Set(['consumptionKwh', 'localEnergyKwh', 'gridImportKwh']), 'root.member.energy');
  energy(memberEnergy, ['consumptionKwh', 'localEnergyKwh', 'gridImportKwh'], 'root.member.energy');
  const building = required(payload, 'building', 'root');
  noExtraKeys(building, new Set(['displayId', 'address', 'productionTypes', 'installedCapacityKw', 'memberCount', 'energy']), 'root.building');
  string(required(building, 'displayId', 'root.building'), 'root.building.displayId');
  address(required(building, 'address', 'root.building'), 'root.building.address');
  const productionTypes = required(building, 'productionTypes', 'root.building');
  if (!Array.isArray(productionTypes) || productionTypes.some(type => typeof type !== 'string')) throw new PortalContractError('root.building.productionTypes must be strings');
  number(required(building, 'installedCapacityKw', 'root.building'), 'root.building.installedCapacityKw');
  number(required(building, 'memberCount', 'root.building'), 'root.building.memberCount');
  const buildingEnergy = required(building, 'energy', 'root.building');
  noExtraKeys(buildingEnergy, new Set(['consumptionKwh', 'generationKwh', 'localEnergyKwh', 'gridImportKwh', 'gridExportKwh', 'selfSufficiencyPercent']), 'root.building.energy');
  energy(buildingEnergy, ['consumptionKwh', 'generationKwh', 'localEnergyKwh', 'gridImportKwh', 'gridExportKwh'], 'root.building.energy');
  number(required(buildingEnergy, 'selfSufficiencyPercent', 'root.building.energy'), 'root.building.energy.selfSufficiencyPercent', { max: 100 });
  const trends = required(payload, 'trends', 'root');
  noExtraKeys(trends, new Set(['member', 'building']), 'root.trends');
  trend(required(trends, 'member', 'root.trends'), ['consumptionKwh', 'localEnergyKwh', 'gridImportKwh'], 'root.trends.member');
  trend(required(trends, 'building', 'root.trends'), ['consumptionKwh', 'generationKwh', 'localEnergyKwh', 'gridImportKwh', 'gridExportKwh'], 'root.trends.building');
  return payload;
}
