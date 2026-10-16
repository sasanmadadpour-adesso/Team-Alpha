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

test('portal GET client has no end-user identifiers in its request contract', () => {
  const client = fs.readFileSync(path.join(root, 'app/member-app/webapp/api/portal-api.mjs'), 'utf8');
  assert.match(client, /GET|method: 'GET'/);
  assert.match(client, /range=/);
  assert.doesNotMatch(client, /malo=|memberId=|buildingId=/);
  assert.match(client, /config\.credentials \|\| 'same-origin'/);
  assert.match(client, /Accept: 'application\/json'/);
});

test('white-label page is configured for the external portal interface', () => {
  const index = fs.readFileSync(path.join(root, 'app/member-app/webapp/index.html'), 'utf8');
  const app = fs.readFileSync(path.join(root, 'app/member-app/webapp/app.js'), 'utf8');
  const client = fs.readFileSync(path.join(root, 'app/member-app/webapp/api/portal-api.mjs'), 'utf8');
  assert.match(index, /WHITE_LABEL_CONFIG/);
  assert.match(index, /portalPath: '\/api\/v1\/house-member-portal'/);
  assert.match(app, /import \{ getPortalData \} from '\.\/api\/portal-api\.mjs'/);
  assert.match(client, /apiBaseUrl/);
  assert.match(client, /config\.portalPath/);
});
