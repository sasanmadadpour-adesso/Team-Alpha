const test = require('node:test');
const assert = require('node:assert/strict');
test('member authentication is delegated to the external service', () => {
  const server = require('../srv/server');
  assert.ok(server.sessions instanceof Map);
  const source = require('node:fs').readFileSync(require('node:path').join(__dirname, '../srv/server.js'), 'utf8');
  assert.match(source, /validateHouseMember\(request\.body\?\.malo, request\.body\?\.pin\)/);
  assert.doesNotMatch(source, /createWorkbookRepository|memberForCredentials/);
});

test('server keeps logout as a session invalidation endpoint', () => {
  const source = require('node:fs').readFileSync(require('node:path').join(__dirname, '../srv/server.js'), 'utf8');
  assert.match(source, /app\.post\('\/member-api\/logout'/);
  assert.match(source, /sessions\.delete\(token\)/);
  assert.match(source, /Max-Age=0/);
});
