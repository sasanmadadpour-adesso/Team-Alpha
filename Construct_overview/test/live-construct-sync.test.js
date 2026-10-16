const test = require('node:test');
const assert = require('node:assert/strict');
const { LiveSyncStore } = require('../srv/lib/live-sync-store');
const { LiveConstructSync, normalizeItem, registeredParticipant, unwrap } = require('../srv/lib/live-construct-sync');
const { externalBuildings, externalTreeNodes } = require('../srv/lib/live-construct-tree');

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

test('detail refresh preserves the selected duplicate source ID', async t => {
  const store = new LiveSyncStore(':memory:');
  t.after(() => store.close());
  store.replace('registered', [
    normalizeItem({ ID: 'duplicate-a', primaryMaLo: '999', buildingID: 'B-A' }, 'registered'),
    normalizeItem({ ID: 'duplicate-b', primaryMaLo: '999', buildingID: 'B-B' }, 'registered')
  ]);
  const sync = new LiveConstructSync({ store, registeredUrl: 'https://host/api/v1/maloOverview()' });
  const detail = await sync.detail('registered', '999', 'duplicate-b');
  assert.equal(detail.ID, 'duplicate-b');
  assert.equal(detail.buildingID, 'B-B');
});

test('maps hosted Ruhende maloOverview rows into the Overview contract', () => {
  const household = registeredParticipant({ sourceId: 'MK7 Participants:12', buildingId: 'B-1', role: 'Haushaltsverbrauch', maloId: '111', meloId: 'DE-1', participates: true, city: 'Köln' });
  const producer = registeredParticipant({ sourceId: 'MK7 Participants:13', buildingId: 'B-1', role: 'Solaranlage', maloId: '222', generationFeedInMaloId: '333', meloId: 'DE-2', city: 'Köln' });
  assert.deepEqual({ primaryMaLo: household.primaryMaLo, nodeType: household.nodeType, buildingID: household.buildingID }, { primaryMaLo: '111', nodeType: 'HOUSEHOLD', buildingID: 'B-1' });
  assert.equal(producer.primaryMaLo, '222');
  assert.equal(producer.importMaLo, '222');
  assert.equal(producer.exportMaLo, '333');
  assert.equal(/[\s'()%]/.test(household.ID), false);
});

test('falls back to a configured hosted MaLo resource when the compatibility route is unavailable', async t => {
  const store = new LiveSyncStore(':memory:');
  t.after(() => store.close());
  const urls = [];
  const sync = new LiveConstructSync({
    store,
    pendingUrl: 'http://pending',
    registeredUrl: 'https://host/api/constructs',
    registeredFallbackUrl: 'https://host/api/v1/maloOverview()',
    fetch: async url => {
      urls.push(url);
      if (url.endsWith('/api/constructs')) return response({}, 404);
      return response([{ sourceId: 'row 1', buildingId: 'B-1', role: 'Haushaltsverbrauch', maloId: '111', meloId: 'DE-1', participates: true }]);
    }
  });
  const rows = await sync.poll('registered');
  assert.deepEqual(urls, ['https://host/api/constructs', 'https://host/api/v1/maloOverview()']);
  assert.equal(rows[0].primaryMaLo, '111');
});

test('builds the expandable Overview hierarchy from a flat Ruhende-MaLo feed', () => {
  const rows = [
    { ID: 'row-1', primaryMaLo: '111', buildingID: 'B-1', nodeType: 'HOUSEHOLD', roleLabel: 'Haushaltsverbrauch', city: 'Berlin' },
    { ID: 'row-2', primaryMaLo: '222', buildingID: 'B-1', nodeType: 'PRODUCER', roleLabel: 'Solaranlage', city: 'Berlin' },
    { ID: 'row-3', primaryMaLo: '333', buildingID: 'B-2', nodeType: 'COUNTER', roleLabel: 'Marktlokation Reststrom', city: 'Bonn' }
  ];

  const tree = externalTreeNodes(rows, 'CURRENT');

  assert.equal(tree.filter(row => row.nodeType === 'BUILDING').length, 2);
  assert.equal(tree.find(row => row.ID === 'row-1').parentID, 'external-building-B-1');
  assert.equal(tree.find(row => row.ID === 'row-2').parentID, 'external-building-B-1');
  assert.equal(tree.find(row => row.ID === 'row-3').parentID, 'external-building-B-2');
  assert.equal(tree.find(row => row.ID === 'external-building-B-1').detailHash, "#/Buildings('B-1')");
  assert.equal(tree.every(row => row.syncState === 'CURRENT'), true);
});

test('builds link targets for external building roots', () => {
  const buildings = externalBuildings([
    { buildingID: 'B-1', roleCode: 'HOUSEHOLD', participates: true, city: 'Berlin' },
    { buildingID: 'B-1', roleCode: 'GENERATION', roleLabel: 'Solaranlage' }
  ]);
  assert.deepEqual(buildings.map(row => ({ ID: row.ID, city: row.city, consumers: row.consumerCount, solar: row.hasSolar })),
    [{ ID: 'B-1', city: 'Berlin', consumers: 1, solar: true }]);
});

test('external member links use URL-safe source IDs', () => {
  const [member] = externalTreeNodes([{ ID: 'ruhende-111-cm93LTE', primaryMaLo: '111', buildingID: '' }]);
  assert.equal(member.detailHash, "#/Constructs('ruhende-111-cm93LTE')");
  assert.equal(/\s/.test(member.detailHash), false);
});

test('retains registered members that share a primary MaLo across buildings', t => {
  const store = new LiveSyncStore(':memory:');
  t.after(() => store.close());
  store.replace('registered', [
    normalizeItem({ ID: 'row-a', primaryMaLo: '999', buildingID: 'B-A' }, 'registered'),
    normalizeItem({ ID: 'row-b', primaryMaLo: '999', buildingID: 'B-B' }, 'registered')
  ]);

  assert.deepEqual(store.items('registered').map(row => row.ID).sort(), ['row-a', 'row-b']);
  assert.equal(store.remove('registered', '999'), true);
  assert.deepEqual(store.items('registered'), []);
});
