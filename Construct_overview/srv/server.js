const cds = require('@sap/cds');
const crypto = require('node:crypto');
const { RuhendApiError, getPortalData, validateHouseMember } = require('./lib/ruhend-member-client');

const sessions = new Map();
const ranges = new Set(['24h', '7d', '30d', '90d', '1y']);
const portalCache = new Map();
const PORTAL_CACHE_TTL_MS = 30_000;

async function cachedPortalData(malo, range) {
  const key = `${malo}:${range}`;
  const cached = portalCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.data;
  const data = await getPortalData(malo, range);
  portalCache.set(key, { data, expiresAt: Date.now() + PORTAL_CACHE_TTL_MS });
  return data;
}

function sessionFrom(request) {
  const token = request.headers.cookie?.match(/(?:^|;\s*)member_session=([^;]+)/)?.[1];
  return token ? sessions.get(token) : null;
}

function jsonError(response, status, message, upstreamStatus) {
  response.status(status).json({ error: message, ...(upstreamStatus ? { upstreamStatus } : {}) });
}

function externalError(response, error) {
  const status = error instanceof RuhendApiError && error.status === 401 || error.status === 403 ? 502 : error.status || 502;
  return jsonError(response, status, error.message, error.status);
}

function requireSession(request, response) {
  const session = sessionFrom(request);
  if (!session || session.expiresAt <= Date.now()) {
    jsonError(response, 401, 'Anmeldung erforderlich.');
    return null;
  }
  return session;
}

function memberResponse(data) {
  const member = data.member;
  return {
    ID: member.malo,
    malo: member.malo,
    meLo: member.melo,
    address: [member.address.street, [member.address.postalCode, member.address.city].filter(Boolean).join(' ')].filter(Boolean).join(', '),
    switchoverStatus: member.switchoverStatus,
    totalConsumptionKwh: member.energy.consumptionKwh,
    localEnergyKwh: member.energy.localEnergyKwh,
    residualGridKwh: member.energy.gridImportKwh
  };
}

function buildingResponse(data) {
  const building = data.building;
  return {
    ID: building.displayId,
    city: building.address.city,
    postalCode: building.address.postalCode,
    streetAddress: building.address.street,
    productionTypes: building.productionTypes.join(', '),
    installedCapacityKw: building.installedCapacityKw,
    consumerCount: building.memberCount,
    participatingConsumerCount: building.memberCount,
    totalConsumptionKwh: building.energy.consumptionKwh,
    totalGenerationKwh: building.energy.generationKwh,
    localEnergyKwh: building.energy.localEnergyKwh,
    residualGridKwh: building.energy.gridImportKwh,
    exportKwh: building.energy.gridExportKwh,
    selfSufficiencyPercent: building.energy.selfSufficiencyPercent,
    solarGenerationKwh: 0,
    windGenerationKwh: 0
  };
}

function trendResponse(data, scope) {
  const source = data.trends[scope];
  return {
    value: source.points.map(point => ({
      ID: `${source.granularity}-${point.timestamp}`,
      parentID: scope,
      bucketStart: point.timestamp,
      granularity: source.granularity,
      intervalCount: point.intervalCount,
      consumptionKwh: point.consumptionKwh,
      generationKwh: point.generationKwh || 0,
      localEnergyKwh: point.localEnergyKwh,
      residualGridKwh: point.gridImportKwh,
      exportKwh: point.gridExportKwh || 0
    }))
  };
}

cds.on('bootstrap', app => {
  app.use(require('express').json({ limit: '10kb' }));
  if (String(process.env.WHITE_LABEL_ONLY || '').toLowerCase() === 'true') {
    app.use('/building-overview', (_request, response) => response.status(404).json({ error: 'This application is disabled in white-label mode.' }));
  }

  app.post('/member-api/login', async (request, response) => {
    try {
      const valid = await validateHouseMember(request.body?.malo, request.body?.pin);
      if (!valid) return jsonError(response, 401, 'MaLo oder Hausnummer ist nicht korrekt.');
      const token = crypto.randomBytes(32).toString('hex');
      sessions.set(token, { malo: String(request.body.malo), expiresAt: Date.now() + 8 * 60 * 60 * 1000 });
      response.set('Set-Cookie', `member_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=28800`);
      return response.json({ ok: true });
    } catch (error) {
      return externalError(response, error);
    }
  });

  app.post('/member-api/logout', (request, response) => {
    const token = request.headers.cookie?.match(/(?:^|;\s*)member_session=([^;]+)/)?.[1];
    if (token) sessions.delete(token);
    response.set('Set-Cookie', 'member_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
    return response.json({ ok: true });
  });

  app.get('/member-api/session', (request, response) => response.json({ authenticated: Boolean(sessionFrom(request)?.expiresAt > Date.now()) }));

  app.get('/member-api/member', async (request, response) => {
    const session = requireSession(request, response);
    if (!session) return;
    try { return response.json(memberResponse(await cachedPortalData(session.malo, '7d'))); } catch (error) { return externalError(response, error); }
  });

  app.get('/member-api/building', async (request, response) => {
    const session = requireSession(request, response);
    if (!session) return;
    try { return response.json(buildingResponse(await cachedPortalData(session.malo, '7d'))); } catch (error) { return externalError(response, error); }
  });

  app.get('/member-api/trend', async (request, response) => {
    const session = requireSession(request, response);
    if (!session) return;
    const scope = request.query.scope === 'building' ? 'building' : request.query.scope === 'member' ? 'member' : null;
    const range = String(request.query.range || '7d');
    if (!scope || !ranges.has(range)) return jsonError(response, 400, 'Ungültiger Trendbereich.');
    try { return response.json(trendResponse(await cachedPortalData(session.malo, range), scope)); } catch (error) { return externalError(response, error); }
  });
});

module.exports = { sessions };
