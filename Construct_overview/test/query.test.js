const test = require('node:test');
const assert = require('node:assert/strict');
const { apply } = require('../srv/lib/query');

const rows = [{ id: 1, city: 'Köln', n: 5, ok: true }, { id: 2, city: 'Frankfurt', n: 1, ok: false }, { id: 3, city: 'Kiel', n: 9, ok: true }];
const req = select => ({ query: { SELECT: select } });

test('filters, sorts and pages like OData', () => {
  assert.deepEqual(apply(rows, req({ where: [{ func: 'contains', args: [{ ref: ['city'] }, { val: 'ie' }] }] })).map(r => r.id), [3]);
  assert.deepEqual(apply(rows, req({ where: [{ ref: ['n'] }, '>', { val: 2 }, 'and', { ref: ['ok'] }, '=', { val: true }] })).map(r => r.id), [1, 3]);
  assert.deepEqual(apply(rows, req({ where: [{ ref: ['id'] }, '=', { val: 1 }, 'or', { ref: ['id'] }, '=', { val: 2 }] })).map(r => r.id), [1, 2]);
  assert.deepEqual(apply(rows, req({ orderBy: [{ ref: ['n'], sort: 'desc' }] })).map(r => r.id), [3, 1, 2]);
  const paged = apply(rows, req({ count: true, limit: { rows: { val: 1 }, offset: { val: 1 } } }));
  assert.equal(paged.length, 1);
  assert.equal(paged.$count, 3);
  assert.deepEqual(apply(rows, req({ columns: [{ func: 'count', as: '$count' }] }))[0].$count, 3);
});
