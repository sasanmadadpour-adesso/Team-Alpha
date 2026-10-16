const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const examplePath = path.join(root, 'app/member-app/webapp/api/portal-response.example.json');

async function contract() {
  return import('../app/member-app/webapp/api/portal-contract.mjs');
}

test('portal example follows the public response contract', async () => {
  const { validatePortalData } = await contract();
  const payload = JSON.parse(fs.readFileSync(examplePath, 'utf8'));
  assert.equal(validatePortalData(payload), payload);
});

test('portal contract rejects sensitive or unknown fields', async () => {
  const { validatePortalData, PortalContractError } = await contract();
  const payload = JSON.parse(fs.readFileSync(examplePath, 'utf8'));
  payload.member.email = 'private@example.org';
  assert.throws(() => validatePortalData(payload), PortalContractError);
});

test('portal contract rejects unordered trend points', async () => {
  const { validatePortalData, PortalContractError } = await contract();
  const payload = JSON.parse(fs.readFileSync(examplePath, 'utf8'));
  payload.trends.member.points.push({ ...payload.trends.member.points[0], timestamp: '2026-10-08T00:00:00.000Z' });
  assert.throws(() => validatePortalData(payload), PortalContractError);
});

test('portal GET client uses the configured external request contract', () => {
  const client = fs.readFileSync(path.join(root, 'app/member-app/webapp/api/portal-api.mjs'), 'utf8');
  assert.match(client, /GET|method: 'GET'/);
  assert.match(client, /malo: String\(malo\)/);
  assert.match(client, /range/);
  assert.doesNotMatch(client, /memberId=|buildingId=/);
  assert.match(client, /Authorization/);
  assert.match(client, /Accept: 'application\/json'/);
});

test('white-label page is configured for the external portal interface', () => {
  const index = fs.readFileSync(path.join(root, 'app/member-app/webapp/index.html'), 'utf8');
  const app = fs.readFileSync(path.join(root, 'app/member-app/webapp/app.js'), 'utf8');
  const client = fs.readFileSync(path.join(root, 'app/member-app/webapp/api/portal-api.mjs'), 'utf8');
  assert.doesNotMatch(index, /WHITE_LABEL_CONFIG|white-label-api|ruhend\.sidely\.dev/);
  assert.match(app, /fetch\(`\/member-api\/\$\{path\}/);
  assert.match(client, /apiBaseUrl/);
  assert.match(client, /config\.portalPath/);
  assert.doesNotMatch(index, /rk_[A-Za-z0-9_-]+/);
});

test('white-label proxy is server-side and forwards only allowed query parameters', () => {
  const server = fs.readFileSync(path.join(root, 'srv/server.js'), 'utf8');
  assert.match(server, /ruhend-member-client/);
  assert.match(server, /ruhend-member-client/);
  assert.match(server, /cachedPortalData\(session\.malo/);
  assert.doesNotMatch(server, /white-label-api/);
  assert.doesNotMatch(server, /console\.log\([^\n]*RUHEND_API_TOKEN/);
});

test('member adapter is separate from the VNB XLSX service', () => {
  const service = fs.readFileSync(path.join(root, 'srv/energy-overview-service.js'), 'utf8');
  const client = fs.readFileSync(path.join(root, 'srv/lib/ruhend-member-client.js'), 'utf8');
  assert.match(service, /createWorkbookRepository/);
  assert.match(client, /Authorization: `Bearer \$\{token\}`/);
  assert.match(client, /api\/v1\/house-member-portal/);
});

test('white-label-only mode disables the workbook service and VNB app', () => {
  const service = fs.readFileSync(path.join(root, 'srv/energy-overview-service.js'), 'utf8');
  const server = fs.readFileSync(path.join(root, 'srv/server.js'), 'utf8');
  assert.match(service, /WHITE_LABEL_ONLY/);
  assert.match(service, /This application is disabled in white-label mode/);
  assert.match(server, /app\.use\('\/building-overview'/);
});

test('external participant validation discovers MaLos through maloOverview and uses a bearer token', async () => {
  globalThis.WHITE_LABEL_CONFIG = { apiBaseUrl: 'https://ruhend.sidely.dev', token: 'test-token' };
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return { ok: true, json: async () => [{ maloId: '50539603888', participates: true, role: 'Haushaltsverbrauch', streetAddress: 'Vilbeler Landstraße 21' }] };
  };
  const { validateHouseMember } = require('../srv/lib/ruhend-member-client');
  assert.equal(await validateHouseMember('50539603888', '21'), true);
  assert.match(calls[0].url, /^https:\/\/ruhend\.sidely\.dev\/api\/v1\/maloOverview\(\)\?/);
  assert.match(calls[0].options.headers.Authorization, /^Bearer /);
});

test('external participant validation rejects non-matching household data', async () => {
  globalThis.fetch = async () => ({ ok: true, json: async () => [{ maloId: '50539603888', participates: true, role: 'Haushaltsverbrauch', streetAddress: 'Vilbeler Landstraße 21' }] });
  const { validateHouseMember } = require('../srv/lib/ruhend-member-client');
  assert.equal(await validateHouseMember('50539603888', '999'), false);
});

test('external portal timeout is exposed as a gateway timeout', async () => {
  globalThis.fetch = async () => { const error = new Error('request timed out'); error.name = 'TimeoutError'; throw error; };
  const { getPortalData } = require('../srv/lib/ruhend-member-client');
  await assert.rejects(() => getPortalData('50539603888', '7d'), error => {
    assert.equal(error.name, 'RuhendApiError');
    assert.equal(error.status, 504);
    assert.equal(error.message, 'External house-member service is unavailable.');
    return true;
  });
});

test('external portal network failure is exposed as a bad gateway', async () => {
  globalThis.fetch = async () => { throw new Error('connection refused'); };
  const { getPortalData } = require('../srv/lib/ruhend-member-client');
  await assert.rejects(() => getPortalData('50539603888', '7d'), error => error.status === 502);
});

test('member app distinguishes invalid credentials from endpoint failure', () => {
  const app = fs.readFileSync(path.join(root, 'app/member-app/webapp/app.js'), 'utf8');
  assert.match(app, /error\.status === 401 \? t\('wrongLogin'\) : t\('unavailable'\)/);
  assert.match(app, /response\.json\(\)/);
  assert.match(app, /response\.status/);
});
