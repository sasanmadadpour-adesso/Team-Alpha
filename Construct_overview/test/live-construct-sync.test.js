const test = require('node:test');
const assert = require('node:assert/strict');
const { LiveSyncStore } = require('../srv/lib/live-sync-store');
const { LiveConstructSync, normalizeItem, unwrap } = require('../srv/lib/live-construct-sync');

function response(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

test('accepts common response envelopes and primary MaLo aliases', () => {
  assert.deepEqual(unwrap([{ maLo: '1' }]), [{ maLo: '1' }]);
  assert.deepEqual(unwrap({ value: [{ maLo: '1' }] }), [{ maLo: '1' }]);
  assert.equal(normalizeItem({ marketLocationIdentifier: ' 123 ', address: 'Main 1' }, 'pending').primaryMaLo, '123');
  assert.throws(() => normalizeItem({}, 'pending'), /primary MaLo/);
});

test('polls both sources, reconciles by primary MaLo and retains audit history', async t => {
  const store = new LiveSyncStore(':memory:');
  t.after(() => store.close());
  const fetch = async url => url.includes('pending')
    ? response({ value: [
      { maLo: '11111111111', meLo: 'DE-PENDING-1', city: 'Berlin' },
      { maLo: '22222222222', meLo: 'DE-PENDING-2', city: 'Bonn' }
    ] })
    : response([{ primaryMaLo: '11111111111', displayName: 'Registered one' }]);
  const sync = new LiveConstructSync({ store, fetch, pendingUrl: 'http://anmelden/pending', registeredUrl: 'http://umstellung/constructs' });

  await sync.syncNow();

  assert.deepEqual(sync.pending().map(item => item.primaryMaLo), ['22222222222']);
  assert.deepEqual(sync.registered().map(item => item.primaryMaLo), ['11111111111']);
  assert.equal(sync.audit()[0].reason, 'REGISTERED_IN_UMSTELLUNG');
  assert.equal(sync.statuses().every(status => status.stale === false), true);
});

test('keeps cached data and marks a source stale when polling fails', async t => {
  const store = new LiveSyncStore(':memory:');
  t.after(() => store.close());
  store.upsert('pending', normalizeItem({ maLo: '33333333333' }, 'pending'));
  const sync = new LiveConstructSync({ store, fetch: async () => { throw new Error('offline'); } });

  await sync.syncNow();

  assert.equal(sync.pending()[0].primaryMaLo, '33333333333');
  assert.equal(sync.statuses().find(status => status.ID === 'pending').stale, true);
  assert.match(sync.statuses().find(status => status.ID === 'pending').error, /offline/);
});

test('supports snapshot and event webhooks', t => {
  const store = new LiveSyncStore(':memory:');
  t.after(() => store.close());
  const sync = new LiveConstructSync({ store, fetch: async () => response([]) });

  sync.applyWebhook('pending', [{ maLo: '44444444444' }, { maLo: '55555555555' }]);
  sync.applyWebhook('pending', { event: 'UPSERT', data: { maLo: '66666666666' } });
  sync.applyWebhook('pending', { event: 'DELETE', data: { maLo: '44444444444' } });

  assert.deepEqual(sync.pending().map(item => item.primaryMaLo), ['55555555555', '66666666666']);
  assert.equal(sync.audit()[0].reason, 'WEBHOOK_DELETE');
});

test('an authoritative empty registered snapshot is not replaced by the workbook seed', async t => {
  const store = new LiveSyncStore(':memory:');
  t.after(() => store.close());
  const sync = new LiveConstructSync({ store, fetch: async () => response([]) });

  await sync.poll('registered');
  sync.seedRegistered([{ primaryMaLo: '77777777777' }]);

  assert.equal(sync.registeredIsAuthoritative(), true);
  assert.deepEqual(sync.registered(), []);
});

test('detail refresh preserves the cached ID used by UI navigation', async t => {
  const store = new LiveSyncStore(':memory:');
  t.after(() => store.close());
  store.upsert('registered', normalizeItem({ ID: 'stable-id', primaryMaLo: '88888888888', city: 'Old' }, 'registered'));
  const sync = new LiveConstructSync({ store, fetch: async () => response({ primaryMaLo: '88888888888', city: 'New' }) });

  const detail = await sync.detail('registered', '88888888888');

  assert.equal(detail.ID, 'stable-id');
  assert.equal(detail.city, 'New');
});
