const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const keys = file => new Set(fs.readFileSync(path.join(root, file), 'utf8').split('\n').filter(line => line.includes('=') && !line.startsWith('#')).map(line => line.split('=')[0]));

test('every i18n key used by annotations exists in all CDS bundles', () => {
  const annotations = fs.readFileSync(path.join(root, 'srv', 'energy-overview-annotations.cds'), 'utf8');
  const used = [...new Set([...annotations.matchAll(/i18n>([A-Za-z0-9_]+)/g)].map(match => match[1]))];
  for (const file of ['_i18n/i18n.properties', '_i18n/i18n_de.properties', '_i18n/i18n_en.properties']) {
    const present = keys(file);
    assert.deepEqual(used.filter(key => !present.has(key)), [], file);
  }
});

test('webapp bundles define the same keys in German and English', () => {
  const base = 'app/building-overview/webapp/i18n/';
  const de = keys(`${base}i18n_de.properties`);
  const en = keys(`${base}i18n_en.properties`);
  assert.deepEqual([...de].filter(key => !en.has(key)), []);
  assert.deepEqual([...en].filter(key => !de.has(key)), []);
});
