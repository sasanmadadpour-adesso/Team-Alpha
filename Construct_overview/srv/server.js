const cds = require('@sap/cds');
const crypto = require('node:crypto');
const { createWorkbookRepository } = require('./lib/workbook-loader');
const { project } = require('./lib/vnb-projector');
const { trends } = require('./lib/energy-trends');

const sessions = new Map();
const repository = createWorkbookRepository();

function normalize(value) {
  return String(value || '').trim().replace(/\s+/g, '').toUpperCase();
}

function houseNumber(address) {
  return String(address || '').match(/\b(\d+[A-Za-z]?)\b/)?.[1]?.toUpperCase() || '';
}

function memberForCredentials(malo, pin) {
  const normalizedMalo = normalize(malo);
  const normalizedPin = normalize(pin);
  const matches = repository.getSnapshot().participants.filter(row => (
    row.role === 'Household Consumption' &&
    row.participation === 'Ja' &&
    normalize(row.importMarketLocationId) === normalizedMalo &&
    houseNumber(row.streetAddress) === normalizedPin
  ));
  return matches.length === 1 ? matches[0] : null;
}

function sessionFrom(request) {
  const token = request.headers.cookie?.match(/(?:^|;\s*)member_session=([^;]+)/)?.[1];
  return token ? sessions.get(token) : null;
}

function jsonError(response, status, message) {
  response.status(status).json({ error: message });
}

function scopedData(session) {
  const data = project(repository.getSnapshot());
  const member = data.constructs.find(row => row.ID === session.constructID && row.roleCode === 'HOUSEHOLD');
  if (!member) return null;
  const building = data.buildings.find(row => row.ID === member.buildingID);
  if (!building) return null;
  const memberTrend = data.hourly.filter(row => row.constructID === member.ID).slice(-24).map(row => ({
    startTime: row.startTime,
    consumptionKwh: row.consumptionKwh,
    localEnergyKwh: row.localAllocationKwh,
    residualGridKwh: row.residualGridKwh
  }));
  const buildingTrend = data.buildingHourlyEnergy.filter(row => row.buildingID === building.ID).slice(-24).map(row => ({
    startTime: row.startTime,
    consumptionKwh: row.consumptionKwh,
    generationKwh: row.generationKwh,
    localEnergyKwh: row.localEnergyKwh,
    residualGridKwh: row.residualGridKwh,
    exportKwh: row.exportKwh
  }));
  return { member, building, memberTrend, buildingTrend };
}

const TREND_RANGES = { '24h': 1, '7d': 7, '30d': 30, '90d': 90, '1y': 365 };

function trendFor(session, scope, range) {
  const data = scopedData(session);
  if (!data || !TREND_RANGES[range]) return null;
  const snapshot = repository.getSnapshot();
  const latestRows = scope === 'building'
    ? snapshot.consumption.concat(snapshot.generation).filter(row => row.buildingId === data.building.ID)
    : snapshot.consumption.filter(row => row.meteringLocationId === data.member.meLo);
  const dates = latestRows.map(row => new Date(row.startTime)).filter(date => !Number.isNaN(date.valueOf())).sort((a, b) => a - b);
  const end = new Date((dates.at(-1) || new Date()).valueOf() + 3600000);
  const start = new Date(end.valueOf() - TREND_RANGES[range] * 86400000);
  if (scope === 'member') {
    const sourceRows = snapshot.consumption
      .filter(row => row.meteringLocationId === data.member.meLo)
      .map(row => ({ startTime: row.startTime, eligibleConsumptionKwh: row.consumptionKwh, generationKwh: 0, localEnergyKwh: 0, residualGridEnergyKwh: 0, exportEnergyKwh: 0 }));
    const projectedRows = project(snapshot).hourly.filter(row => row.constructID === data.member.ID);
    const byTime = new Map(projectedRows.map(row => [row.startTime, row]));
    for (const row of sourceRows) {
      const projected = byTime.get(row.startTime);
      if (projected) Object.assign(row, { localEnergyKwh: projected.localAllocationKwh, residualGridEnergyKwh: projected.residualGridKwh });
    }
    return trends(snapshot, { parentType: 'construct', parentId: data.member.ID, from: start.toISOString(), to: end.toISOString(), sourceRows });
  }
  return trends(snapshot, { parentType: 'building', parentId: data.building.ID, from: start.toISOString(), to: end.toISOString() });
}

cds.on('bootstrap', app => {
  app.use(require('express').json({ limit: '10kb' }));

  app.post('/member-api/login', (request, response) => {
    const member = memberForCredentials(request.body?.malo, request.body?.pin);
    if (!member) return jsonError(response, 401, 'MaLo oder Hausnummer ist nicht korrekt.');
    const token = crypto.randomBytes(32).toString('hex');
    sessions.set(token, { constructID: member.ID, expiresAt: Date.now() + 8 * 60 * 60 * 1000 });
    response.set('Set-Cookie', `member_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=28800`);
    return response.json({ ok: true });
  });

  app.post('/member-api/logout', (request, response) => {
    const token = request.headers.cookie?.match(/(?:^|;\s*)member_session=([^;]+)/)?.[1];
    if (token) sessions.delete(token);
    response.set('Set-Cookie', 'member_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
    return response.json({ ok: true });
  });

  app.get('/member-api/session', (request, response) => {
    const session = sessionFrom(request);
    return response.json({ authenticated: Boolean(session && session.expiresAt > Date.now()) });
  });

  app.get('/member-api/member', (request, response) => {
    const session = sessionFrom(request);
    if (!session || session.expiresAt <= Date.now()) return jsonError(response, 401, 'Anmeldung erforderlich.');
    const data = scopedData(session);
    if (!data) return jsonError(response, 403, 'Kein gültiger Hausmitglied-Zugriff.');
    const { member, memberTrend } = data;
    return response.json({
      ID: member.ID, malo: member.primaryMaLo, meLo: member.meLo, address: member.address,
      switchoverStatus: member.switchoverComplete && !member.hasDataWarning ? 'COMPLETED' : 'IN_PROGRESS',
      totalConsumptionKwh: member.totalConsumptionKwh,
      localEnergyKwh: member.localEnergyKwh, residualGridKwh: member.residualGridKwh, trend: memberTrend
    });
  });

  app.get('/member-api/trend', (request, response) => {
    const session = sessionFrom(request);
    if (!session || session.expiresAt <= Date.now()) return jsonError(response, 401, 'Anmeldung erforderlich.');
    const scope = request.query.scope === 'building' ? 'building' : 'member';
    const range = request.query.range || '7d';
    const rows = trendFor(session, scope, range);
    if (!rows) return jsonError(response, 400, 'Ungültiger Trendbereich.');
    return response.json({ value: rows });
  });

  app.get('/member-api/building', (request, response) => {
    const session = sessionFrom(request);
    if (!session || session.expiresAt <= Date.now()) return jsonError(response, 401, 'Anmeldung erforderlich.');
    const data = scopedData(session);
    if (!data) return jsonError(response, 403, 'Kein gültiger Hausmitglied-Zugriff.');
    const { building, buildingTrend } = data;
    return response.json({
      ID: building.ID, city: building.city, postalCode: building.postalCode, streetAddress: building.streetAddress,
      productionTypes: building.productionTypes, installedCapacityKw: building.installedCapacityKw,
      consumerCount: building.consumerCount, participatingConsumerCount: building.participatingConsumerCount,
      totalConsumptionKwh: building.totalConsumptionKwh, totalGenerationKwh: building.totalGenerationKwh,
      localEnergyKwh: building.localEnergyKwh, residualGridKwh: building.residualGridKwh,
      exportKwh: building.exportKwh, selfSufficiencyPercent: building.selfSufficiencyPercent,
      solarGenerationKwh: building.solarGenerationKwh, windGenerationKwh: building.windGenerationKwh,
      trend: buildingTrend
    });
  });
});

module.exports = { memberForCredentials, sessions };
