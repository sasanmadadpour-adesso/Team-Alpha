const RANGES = Object.freeze({ '24h': 24 * 3600000, '7d': 7 * 86400000, '30d': 30 * 86400000, '90d': 90 * 86400000, '1y': 365 * 86400000 });

function configuredUrls() {
  let origin = 'http://localhost:4020';
  try { origin = new URL(process.env.REGISTERED_API_URL || `${origin}/api/constructs`).origin; } catch {}
  return {
    portal: process.env.HOUSE_MEMBER_PORTAL_API_URL || `${origin}/api/v1/house-member-portal`,
    data: process.env.RUHENDE_DATA_API_URL || `${origin}/odata/v4/data`
  };
}

function headers() {
  const key = process.env.EXTERNAL_API_KEY;
  return { Accept: 'application/json', ...(key ? { 'x-api-key': key, Authorization: `Bearer ${key}` } : {}) };
}

async function requestJson(url, fetchImpl, timeoutMs = 30000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { headers: headers(), signal: controller.signal });
    const text = await response.text();
    let body;
    try { body = text ? JSON.parse(text) : {}; } catch { body = {}; }
    if (!response.ok) {
      const error = new Error(body?.error?.message || `Ruhende request failed with HTTP ${response.status}`);
      error.status = response.status;
      error.code = body?.error?.code;
      throw error;
    }
    return body;
  } finally {
    clearTimeout(timer);
  }
}

function bucketStart(iso, granularity) {
  const date = new Date(iso);
  if (granularity === 'hour') return date.toISOString().slice(0, 13) + ':00:00.000Z';
  date.setUTCHours(0, 0, 0, 0);
  if (granularity === 'week') {
    const day = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() - day + 1);
  }
  return date.toISOString();
}

function bucketEnd(start, granularity) {
  return new Date(Date.parse(start) + (granularity === 'hour' ? 3600000 : granularity === 'week' ? 7 * 86400000 : 86400000)).toISOString();
}

const round = value => Math.round((Number(value || 0) + Number.EPSILON) * 1000) / 1000;

function trendRows(points, { malo, range, granularity, source = 'HOSTED_PORTAL' }) {
  return points.map((point, index) => ({
    ID: `${source}-${malo}-${range}-${index}`,
    parentID: malo,
    bucketStart: point.timestamp,
    bucketEnd: bucketEnd(point.timestamp, granularity),
    bucketLabel: point.timestamp,
    granularity,
    consumptionKwh: round(point.consumptionKwh),
    generationKwh: round(point.generationKwh),
    localEnergyKwh: round(point.localEnergyKwh),
    residualGridKwh: round(point.gridImportKwh),
    exportKwh: round(point.gridExportKwh),
    intervalCount: Number(point.intervalCount || 0)
  }));
}

function energyTotals(rows) {
  const sum = field => round(rows.reduce((total, row) => total + Number(row[field] || 0), 0));
  return {
    totalConsumptionKwh: sum('consumptionKwh'),
    totalGenerationKwh: sum('generationKwh'),
    localEnergyKwh: sum('localEnergyKwh'),
    residualGridKwh: sum('residualGridKwh'),
    exportKwh: sum('exportKwh'),
    latestMeasurementTime: rows.length ? rows.at(-1).bucketEnd : null
  };
}

function portalRows(payload, malo, range) {
  const trend = payload?.trends?.member;
  if (!trend || !Array.isArray(trend.points)) throw Object.assign(new Error('Hosted portal returned no member trend'), { status: 502 });
  return trendRows(trend.points, { malo, range, granularity: trend.granularity });
}

function odataUrl(base, entity, parameters) {
  const url = new URL(`${String(base).replace(/\/$/, '')}/${entity}`);
  for (const [name, value] of Object.entries(parameters)) url.searchParams.set(name, value);
  // CAP's OData parser does not interpret `+` as a space inside expressions.
  return url.toString().replace(/\+/g, '%20');
}

async function odataRows(url, fetchImpl) {
  const rows = [];
  let next = url;
  while (next) {
    const payload = await requestJson(next, fetchImpl);
    rows.push(...(payload.value || []));
    next = payload['@odata.nextLink'] ? new URL(payload['@odata.nextLink'], next).toString() : '';
  }
  return rows;
}

function escapeOData(value) { return String(value).replace(/'/g, "''"); }

async function latestEnd(dataUrl, entity, building, fetchImpl) {
  const url = odataUrl(dataUrl, entity, {
    '$filter': `buildingId eq '${escapeOData(building)}'`,
    '$select': 'endTime', '$orderby': 'endTime desc', '$top': '1'
  });
  return (await requestJson(url, fetchImpl)).value?.[0]?.endTime;
}

function aggregateHostedRows(consumption, generation, malo, range, roleCode) {
  const granularity = range === '24h' ? 'hour' : range === '1y' ? 'week' : 'day';
  const byHour = new Map();
  for (const row of consumption) {
    const point = byHour.get(row.startTime) || { member: 0, memberGeneration: 0, building: 0, generation: 0 };
    point.building += Number(row.consumptionKwh || 0);
    if (String(row.maloId) === String(malo)) point.member += Number(row.consumptionKwh || 0);
    byHour.set(row.startTime, point);
  }
  for (const row of generation) {
    const point = byHour.get(row.startTime) || { member: 0, memberGeneration: 0, building: 0, generation: 0 };
    point.generation += Number(row.generationKwh || 0);
    if (String(row.maloId) === String(malo)) point.memberGeneration += Number(row.generationKwh || 0);
    byHour.set(row.startTime, point);
  }
  const grouped = new Map();
  for (const [timestamp, hour] of [...byHour].sort(([a], [b]) => a.localeCompare(b))) {
    const local = Math.min(hour.building, hour.generation);
    const household = roleCode === 'HOUSEHOLD' || (!roleCode && hour.member > 0);
    const producer = roleCode === 'GENERATION' || (!roleCode && !household && hour.memberGeneration > 0);
    const counter = roleCode === 'RESIDUAL_SUPPLY';
    const selectedLocal = counter ? local : household
      ? (hour.building > 0 ? local * hour.member / hour.building : 0)
      : producer && hour.generation > 0 ? local * hour.memberGeneration / hour.generation : 0;
    const key = bucketStart(timestamp, granularity);
    const point = grouped.get(key) || { timestamp: key, intervalCount: 0, consumptionKwh: 0, generationKwh: 0, localEnergyKwh: 0, gridImportKwh: 0, gridExportKwh: 0 };
    point.intervalCount += 1;
    point.consumptionKwh += counter ? hour.building : household ? hour.member : 0;
    point.generationKwh += counter ? hour.generation : producer ? hour.memberGeneration : 0;
    point.localEnergyKwh += selectedLocal;
    point.gridImportKwh += counter ? Math.max(hour.building - hour.generation, 0) : household ? Math.max(hour.member - selectedLocal, 0) : 0;
    point.gridExportKwh += counter ? Math.max(hour.generation - hour.building, 0) : producer ? Math.max(hour.memberGeneration - selectedLocal, 0) : 0;
    grouped.set(key, point);
  }
  return trendRows([...grouped.values()], { malo, range, granularity, source: 'HOSTED_ODATA' });
}

async function odataFallback({ malo, building, range, roleCode, fetchImpl, dataUrl }) {
  if (!building) throw Object.assign(new Error('A building is required for hosted energy data'), { status: 400 });
  const [consumptionEnd, generationEnd] = await Promise.all([
    latestEnd(dataUrl, 'HourlyConsumption', building, fetchImpl),
    latestEnd(dataUrl, 'HourlyGeneration', building, fetchImpl)
  ]);
  const end = [consumptionEnd, generationEnd].filter(Boolean).sort()[0];
  if (!end) throw Object.assign(new Error('No hosted energy data is available'), { status: 422 });
  const start = new Date(Date.parse(end) - RANGES[range]).toISOString();
  const filter = `buildingId eq '${escapeOData(building)}' and startTime ge ${start} and endTime le ${end}`;
  const [consumption, generation] = await Promise.all([
    odataRows(odataUrl(dataUrl, 'HourlyConsumption', { '$filter': filter, '$select': 'startTime,endTime,maloId,consumptionKwh', '$orderby': 'startTime' }), fetchImpl),
    odataRows(odataUrl(dataUrl, 'HourlyGeneration', { '$filter': filter, '$select': 'startTime,endTime,maloId,generationKwh', '$orderby': 'startTime' }), fetchImpl)
  ]);
  const hasMemberData = consumption.some(row => String(row.maloId) === String(malo)) || generation.some(row => String(row.maloId) === String(malo));
  if (!hasMemberData && roleCode !== 'RESIDUAL_SUPPLY') throw Object.assign(new Error(`No hosted energy data exists for MaLo ${malo}`), { status: 404 });
  return aggregateHostedRows(consumption, generation, malo, range, roleCode);
}

async function hostedEnergy({ malo, building, range = '7d', roleCode, fetchImpl = global.fetch, urls = configuredUrls() }) {
  if (!malo) throw Object.assign(new Error('Query parameter malo is required'), { status: 400 });
  if (!RANGES[range]) throw Object.assign(new Error(`range must be one of ${Object.keys(RANGES).join(', ')}`), { status: 400 });
  const portalUrl = new URL(urls.portal);
  portalUrl.searchParams.set('malo', malo);
  portalUrl.searchParams.set('range', range);
  if (building) portalUrl.searchParams.set('building', building);
  try {
    if (roleCode && roleCode !== 'HOUSEHOLD') throw Object.assign(new Error('Portal supports household members only'), { status: 404 });
    const payload = await requestJson(portalUrl, fetchImpl);
    return { value: portalRows(payload, malo, range), source: 'HOSTED_PORTAL', generatedAt: payload.generatedAt || new Date().toISOString() };
  } catch (error) {
    if (![401, 403, 404, 422].includes(error.status)) throw error;
    const value = await odataFallback({ malo, building, range, roleCode, fetchImpl, dataUrl: urls.data });
    return { value, source: 'HOSTED_ODATA', portalStatus: error.status, generatedAt: new Date().toISOString() };
  }
}

module.exports = { RANGES, aggregateHostedRows, configuredUrls, energyTotals, hostedEnergy, portalRows };
