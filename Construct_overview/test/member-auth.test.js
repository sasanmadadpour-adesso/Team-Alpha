const test = require('node:test');
const assert = require('node:assert/strict');
const { memberForCredentials } = require('../srv/server');

test('resolves a house member with MaLo and house number', () => {
  const member = memberForCredentials('50539603888', '21');
  assert.equal(member.role, 'Household Consumption');
  assert.equal(member.buildingId, 'B-FRA-01');
});

test('uses the house number to disambiguate duplicate MaLos', () => {
  assert.equal(memberForCredentials('50539603888', '10').buildingId, 'B-CGN-01');
  assert.equal(memberForCredentials('50539603888', '999'), null);
});

test('does not authenticate unknown or non-household credentials', () => {
  assert.equal(memberForCredentials('not-a-malo', '21'), null);
  assert.equal(memberForCredentials('50539603888', ''), null);
  assert.equal(memberForCredentials('50539603604', '24'), null);
});
