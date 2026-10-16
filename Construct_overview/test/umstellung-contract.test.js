const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { DEFAULTS } = require('../srv/lib/live-construct-sync');

test('Umstellung JSON contract matches the live synchronization query', () => {
  const contract = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'contracts', 'umstellung-constructs-api.json'), 'utf8'));
  assert.equal(contract.defaultBaseUrl, DEFAULTS.registeredUrl);
  assert.equal(contract.snapshotRequest.method, 'GET');
  assert.equal(contract.snapshotRequest.body, null);
  assert.equal(contract.snapshotRequest.pollIntervalMilliseconds, DEFAULTS.intervalMs);
  assert.equal(contract.detailRequest.method, 'GET');
  assert.ok(contract.constructFields.required.includes('primaryMaLo'));
  assert.equal(contract.reconciliation.matchField, 'primaryMaLo');
  assert.ok(Array.isArray(contract.snapshotResponse.valueEnvelopeExample.value));
});
