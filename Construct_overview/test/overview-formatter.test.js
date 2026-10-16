const test = require('node:test');
const assert = require('node:assert/strict');
const f = require('../app/building-overview/webapp/overview/controller/formatter');

test('a household that reached the last step shows only the icon: no step name, no progress bar, no 8/8', () => {
  assert.equal(f.statusDetail('HOUSEHOLD', 8, 8), false);
  assert.equal(f.statusDetail('HOUSEHOLD', 5, 8), true);
  assert.equal(f.statusDetail('HOUSEHOLD', 2, 8), true, 'non-participating households below the last step still show progress');
  assert.equal(f.statusDetail('BUILDING', null, 8), false);
  assert.equal(f.statusDetail('PRODUCER', null, 8), false);
});

test('progress percentage is derived from the step and never rendered as text', () => {
  assert.equal(f.progressPercent(8, 8), 100);
  assert.equal(f.progressPercent(4, 8), 50);
  assert.equal(f.progressPercent(null, 8), 0);
});

test('the MK7 icon has three states: not participating, unfinished, finished', () => {
  assert.equal(f.mk7Icon(1), 'sap-icon://error');
  assert.equal(f.mk7Icon(2), 'sap-icon://alert');
  assert.equal(f.mk7Icon(3), 'sap-icon://accept');
  assert.match(f.mk7Class(1), /vnbOv-mk7-no/);
  assert.match(f.mk7Class(2), /vnbOv-mk7-warn/);
  assert.match(f.mk7Class(3), /vnbOv-mk7-yes/);
});

test('search rows are marked: current match strong, other matches light, others not marked', () => {
  assert.equal(f.rowHighlight('a', ['a', 'b'], 'a'), 'Warning');
  assert.equal(f.rowHighlight('b', ['a', 'b'], 'a'), 'Information');
  assert.equal(f.rowHighlight('c', ['a', 'b'], 'a'), 'None');
  assert.equal(f.rowHighlight('a', [], null), 'None');
});

test('only rows with a detail page get the navigation arrow', () => {
  assert.equal(f.hasLink("#/Constructs('X')"), true);
  assert.equal(f.hasLink(''), false);
  assert.equal(f.hasLink(undefined), false);
});
