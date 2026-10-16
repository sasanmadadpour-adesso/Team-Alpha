const test = require('node:test');
const assert = require('node:assert/strict');
const search = require('../app/building-overview/webapp/overview/controller/search');

const nodes = [
  { ID: 'BLD-B-FRA-01', displayName: 'B-FRA-01', city: 'Frankfurt am Main', streetAddress: 'Vilbeler Landstraße 21', ownerFirstName: 'Jan', ownerLastName: 'Koller', ownerName: 'Koller, Jan' },
  { ID: 'MBR-1', displayName: '50539603888', malo: '50539603888', roleLabel: 'Household Consumption', city: 'Frankfurt am Main', switchoverStepLabel: 'Belieferung aktiv' },
  { ID: 'BLD-B-MUL-01', displayName: 'B-MUL-01', city: 'Mülheim an der Ruhr', streetAddress: 'Franz-Fischer-Straße 24', ownerFirstName: 'Roman', ownerLastName: 'Weidenfeller', ownerName: 'Weidenfeller, Roman' },
  { ID: 'PRD-1', displayName: '51664053761', roleLabel: 'Solar', city: 'Frankfurt am Main' }
];

test('normalises case and accents so "muelheim" finds "Mülheim"', () => {
  assert.equal(search.normalize('Mülheim'), 'mulheim');
  const result = search.findMatches(nodes, 'MULHEIM');
  assert.equal(result.mode, 'exact');
  assert.deepEqual(result.ids, ['BLD-B-MUL-01']);
});

test('returns every exact match in display order, searching owners, MaLos and street names', () => {
  assert.deepEqual(search.findMatches(nodes, 'frankfurt').ids, ['BLD-B-FRA-01', 'MBR-1', 'PRD-1']);
  assert.deepEqual(search.findMatches(nodes, 'koller').ids, ['BLD-B-FRA-01']);
  assert.deepEqual(search.findMatches(nodes, 'jan koller').ids, ['BLD-B-FRA-01']);
  assert.deepEqual(search.findMatches(nodes, '50539603888').ids, ['MBR-1']);
  assert.deepEqual(search.findMatches(nodes, 'fischer').ids, ['BLD-B-MUL-01']);
  assert.deepEqual(search.findMatches(nodes, 'belieferung').ids, ['MBR-1']);
});

test('falls back to exactly one fuzzy match only when nothing matches exactly', () => {
  const result = search.findMatches(nodes, 'Weidenfler');
  assert.equal(result.mode, 'fuzzy');
  assert.deepEqual(result.ids, ['BLD-B-MUL-01']);
  assert.ok(result.score >= search.FUZZY_THRESHOLD);
});

test('does not run fuzzy matching when an exact match exists', () => {
  const result = search.findMatches(nodes, 'Koller');
  assert.equal(result.mode, 'exact');
  assert.equal(result.ids.length, 1);
});

test('returns no match for empty, very short fuzzy queries, or unrelated text', () => {
  assert.deepEqual(search.findMatches(nodes, '   '), { mode: 'none', ids: [] });
  assert.equal(search.findMatches(nodes, 'xq').mode, 'none');
  assert.equal(search.findMatches(nodes, 'zzzzqqqq').mode, 'none');
});
