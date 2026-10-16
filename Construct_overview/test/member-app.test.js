const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('member app is listed from the CAP application root', () => {
  const index = read('app/index.html');
  assert.match(index, /member-app\/webapp\/index\.html/);
  assert.doesNotMatch(index, /building-overview\/webapp\/index\.html/);
});

test('member app provides exactly two protected content destinations', () => {
  const app = read('app/member-app/webapp/app.js');
  assert.match(app, /location\.hash = '#member'/);
  assert.match(app, /href="#building"/);
  assert.match(app, /api\(`trend\?scope=\$\{kind\}&range=\$\{range\}`\)/);
  assert.match(app, /api\('member'\)/);
  assert.match(app, /api\('building'\)/);
  assert.match(app, /api\('logout', \{ method: 'POST' \}\)/);
  assert.match(app, /finally \{ localStorage.removeItem\('member-malo'\); location.hash = ''; login\(\); \}/);
  assert.doesNotMatch(app, /Constructs\('\$\{/);
  assert.doesNotMatch(app, /Buildings\('\$\{/);
});

test('member app presents aggregate building data only', () => {
  const server = read('srv/server.js');
  assert.match(server, /consumerCount: building\.memberCount/);
  assert.doesNotMatch(server, /createWorkbookRepository/);
  assert.doesNotMatch(server, /data\.consumers/);
});

test('member app uses scoped trend ranges and localized status labels', () => {
  const app = read('app/member-app/webapp/app.js');
  const server = read('srv/server.js');
  assert.match(app, /api\(`trend\?scope=\$\{kind\}&range=\$\{range\}`\)/);
  assert.match(app, /switchoverStatus === 'COMPLETED'/);
  assert.match(app, /completed: 'Umstellung abgeschlossen'/);
  assert.match(app, /completed: 'Switch-over completed'/);
  assert.match(app, /member\.meLo/);
  assert.match(app, /<br>\$\{t\('melo'\)\}/);
  assert.doesNotMatch(app, /pill/);
  assert.match(server, /ranges = new Set/);
  assert.match(server, /cachedPortalData\(session\.malo, range\)/);
  assert.match(server, /cachedPortalData/);
  assert.match(server, /PORTAL_CACHE_TTL_MS = 30_000/);
});
