const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('member app is listed from the CAP application root', () => {
  const index = read('app/index.html');
  assert.match(index, /member-app\/webapp\/index\.html/);
  assert.match(index, /building-overview\/webapp\/index\.html/);
});

test('member app provides exactly two protected content destinations', () => {
  const app = read('app/member-app/webapp/app.js');
  assert.match(app, /location\.hash = '#member'/);
  assert.match(app, /href="#building"/);
  assert.match(app, /getPortalData\('7d'\)/);
  assert.match(app, /result\.trends\[kind\]/);
  assert.doesNotMatch(app, /Constructs\('\$\{/);
  assert.doesNotMatch(app, /Buildings\('\$\{/);
});

test('member app presents aggregate building data only', () => {
  const server = read('srv/server.js');
  assert.match(server, /consumerCount: building\.consumerCount/);
  assert.doesNotMatch(server, /data\.consumers/);
  assert.doesNotMatch(server, /importMaLo: building/);
});

test('member app uses scoped trend ranges and localized status labels', () => {
  const app = read('app/member-app/webapp/app.js');
  const server = read('srv/server.js');
  assert.match(app, /getPortalData\(range\)/);
  assert.match(app, /switchoverStatus === 'COMPLETED'/);
  assert.match(app, /completed: 'Umstellung abgeschlossen'/);
  assert.match(app, /completed: 'Switch-over completed'/);
  assert.match(app, /member\.melo/);
  assert.match(app, /<br>\$\{t\('melo'\)\}/);
  assert.doesNotMatch(app, /pill/);
  assert.match(server, /row\.participation === 'Ja'/);
  assert.match(server, /TREND_RANGES/);
  assert.match(server, /require\('\.\/lib\/energy-trends'\)/);
});
