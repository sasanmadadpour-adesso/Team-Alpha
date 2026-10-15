const test = require('node:test');
const assert = require('node:assert/strict');
const { parseHash, nextState, describe, normalize } = require('../app/building-overview/webapp/ext/navLogic');

test('parses router hashes into page types', () => {
  assert.deepEqual(parseHash("#/Buildings('B-FRA-01')"), { type: 'building', id: 'B-FRA-01' });
  assert.deepEqual(parseHash("/Constructs('DE001')?x=1"), { type: 'construct', id: 'DE001' });
  assert.deepEqual(parseHash("#/Buildings(%27B-1%27)"), { type: 'building', id: 'B-1' });
  assert.deepEqual(parseHash(''), { type: 'list', id: null });
  assert.equal(normalize('#/a'), 'a');
});

test('stores the previous page as origin on a fresh navigation', () => {
  const state = nextState({ feLevel: 1 }, '', "/Buildings('B-FRA-01')");
  assert.equal(state.vnbNav, true);
  assert.equal(state.feLevel, 1);
  assert.deepEqual(state.from, { hash: '', type: 'list', id: null });
  const deeper = nextState({}, "/Buildings('B-FRA-01')", "/Constructs('DE1')");
  assert.deepEqual(deeper.from, { hash: "/Buildings('B-FRA-01')", type: 'building', id: 'B-FRA-01' });
});

test('has no origin on the first page load or when the hash did not change', () => {
  assert.equal(nextState(null, null, '').from, null);
  assert.equal(nextState({}, '/x', '/x').from, null);
});

test('keeps the stored origin for entries that were already visited (reload, back, forward)', () => {
  const existing = { vnbNav: true, from: { hash: 'a', type: 'list', id: null } };
  assert.equal(nextState(existing, "/Buildings('B')", "/Constructs('C')"), existing);
});

test('describes the back link text key', () => {
  assert.deepEqual(describe({ type: 'building', id: 'B1' }), { key: 'backToBuilding', arg: 'B1' });
  assert.deepEqual(describe({ type: 'construct', id: 'C1' }), { key: 'backToConstruct', arg: 'C1' });
  assert.deepEqual(describe({ type: 'list', id: null }), { key: 'backToList', arg: null });
  assert.equal(describe(null), null);
});
