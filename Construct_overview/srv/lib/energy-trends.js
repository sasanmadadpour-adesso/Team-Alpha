const MAX_DAYS = 365;
const VALUE_FIELDS = [
  ['eligibleConsumptionKwh', 'consumptionKwh'],
  ['generationKwh', 'generationKwh'],
  ['localEnergyKwh', 'localEnergyKwh'],
  ['residualGridEnergyKwh', 'residualGridKwh'],
  ['exportEnergyKwh', 'exportKwh']
];
const round = (value, digits = 3) => Number((Number(value) || 0).toFixed(digits));

function parseDate(value, fallback) {
  const date = value ? new Date(value) : fallback;
  return Number.isNaN(date.valueOf()) ? fallback : date;
}

function granularity(start, end) {
  const days = (end - start) / 86400000;
  return days <= 7 ? 'hour' : days <= 90 ? 'day' : 'week';
}

function bucketStart(date, level) {
  const value = new Date(date);
  if (level === 'hour') value.setUTCMinutes(0, 0, 0);
  else if (level === 'day') value.setUTCHours(0, 0, 0, 0);
  else {
    value.setUTCHours(0, 0, 0, 0);
    const day = value.getUTCDay() || 7;
    value.setUTCDate(value.getUTCDate() - day + 1);
  }
  return value;
}

/**
 * Aggregates hourly balances into hour, day or week buckets.
 *
 * Day and week buckets hold the average kWh per hourly interval (sum divided by
 * the number of hours that actually fall into the bucket). Partial edge buckets
 * therefore stay comparable with full buckets instead of looking like a drop.
 */
function trends(snapshot, { parentType, parentId, from, to, sourceRows } = {}) {
  const calculated = sourceRows || snapshot.hourlyBalances ? snapshot : require('./energy-calculator').calculate(snapshot);
  const source = sourceRows || (parentType === 'building' ? calculated.hourlyBalances.filter(row => row.buildingId === parentId) : calculated.hourlyBalances);
  const dates = source.map(row => new Date(row.startTime)).filter(date => !Number.isNaN(date.valueOf())).sort((a, b) => a - b);
  const defaultFrom = dates[0] || new Date(Date.UTC(2026, 0, 1));
  const defaultTo = dates.at(-1) || defaultFrom;
  const start = parseDate(from, defaultFrom);
  const end = parseDate(to, defaultTo);
  if (end < start) throw new Error('Trend end must be after trend start');
  if ((end - start) / 86400000 > MAX_DAYS) throw new Error('Trend range cannot exceed 365 days');
  const level = granularity(start, end);
  const buckets = new Map();
  for (const row of source) {
    const date = new Date(row.startTime);
    if (Number.isNaN(date.valueOf()) || date < start || date >= end) continue;
    const bucket = bucketStart(date, level);
    const id = bucket.toISOString();
    if (!buckets.has(id)) {
      buckets.set(id, {
        ID: `${parentId || 'portfolio'}-${id}-${level}`,
        parentID: parentId || 'portfolio',
        bucketStart: id,
        bucketEnd: new Date(bucket.valueOf() + (level === 'hour' ? 3600000 : level === 'day' ? 86400000 : 604800000)).toISOString(),
        bucketLabel: level === 'hour' ? id.slice(0, 16).replace('T', ' ') : id.slice(0, 10),
        granularity: level,
        consumptionKwh: 0,
        generationKwh: 0,
        localEnergyKwh: 0,
        residualGridKwh: 0,
        exportKwh: 0,
        hours: new Set()
      });
    }
    const target = buckets.get(id);
    target.hours.add(date.toISOString());
    for (const [sourceField, targetField] of VALUE_FIELDS) target[targetField] += Number(row[sourceField]) || 0;
  }
  return [...buckets.values()]
    .sort((a, b) => a.bucketStart.localeCompare(b.bucketStart))
    .map(({ hours, ...row }) => {
      const intervalCount = hours.size || 1;
      const result = { ...row, intervalCount };
      for (const field of ['consumptionKwh', 'generationKwh', 'localEnergyKwh', 'residualGridKwh', 'exportKwh']) result[field] = round(result[field] / intervalCount);
      return result;
    });
}

module.exports = { trends, granularity, MAX_DAYS };
