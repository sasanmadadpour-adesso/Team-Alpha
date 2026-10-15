const test = require('node:test');
const assert = require('node:assert/strict');
const { createWorkbookRepository } = require('../srv/lib/workbook-loader');
const { detect, localize, summarize, TEXTS } = require('../srv/lib/data-quality');

const snapshot = createWorkbookRepository().getSnapshot();
const issues = detect(snapshot);
const count = code => issues.filter(row => row.issueCode === code).length;

test('detects the real data problems of the workbook', () => {
  assert.equal(count('MALO_USED_AS_MELO'), 0);
  assert.equal(count('POSTCODE_MISMATCH'), 0);
  assert.equal(count('DUPLICATE_IMPORT_MALO'), 2);
  assert.equal(count('SHARED_EXPORT_MALO'), 0);
  assert.equal(count('EXCLUDED_WITH_READINGS'), 1);
  assert.equal(count('UNRECOGNIZED_PARTICIPATION'), 0);
  assert.equal(new Set(issues.map(row => row.ID)).size, issues.length);
});

test('flags a participant postcode that differs from the building postcode, but never checks MaLo/MeLo check digits', () => {
  const changed = { ...snapshot, participants: snapshot.participants.map(row => (row.sourceRow === 5 ? { ...row, cityPostalCode: 'Frankfurt am Main 60999' } : row)) };
  const found = detect(changed).filter(row => row.issueCode === 'POSTCODE_MISMATCH');
  assert.equal(found.length, 1);
  assert.match(localize(found[0], 'en').issueText, /postcode 60999 in row 5/);
  assert.match(localize(found[0], 'de').recommendation, /auf 60388/);
  assert.equal(issues.some(row => /check/i.test(row.issueCode)), false);
});

test('flags shared export MaLos when two plants use the same one', () => {
  const plants = snapshot.participants.filter(row => row.exportMarketLocationId);
  const changed = { ...snapshot, participants: snapshot.participants.map(row => (row.ID === plants[1].ID ? { ...row, exportMarketLocationId: plants[0].exportMarketLocationId } : row)) };
  assert.equal(detect(changed).filter(row => row.issueCode === 'SHARED_EXPORT_MALO').length, 2);
});

test('flags participation values that are neither Ja nor nein', () => {
  const changed = { ...snapshot, participants: snapshot.participants.map(row => (row.sourceRow === 4 ? { ...row, participation: 'vielleicht' } : row)) };
  const found = detect(changed).filter(row => row.issueCode === 'UNRECOGNIZED_PARTICIPATION');
  assert.equal(found.length, 1);
  assert.match(localize(found[0], 'de').issueText, /„vielleicht“/);
});

test('messages are plain-language, parameter-complete and localized', () => {
  for (const row of issues) {
    for (const locale of ['de', 'en-US']) {
      const text = localize(row, locale);
      assert.doesNotMatch(`${text.issueText} ${text.title} ${text.recommendation}`, /\{\w+\}|undefined|\[object/, `${row.issueCode} ${locale}`);
      assert.ok(text.title && text.issueText && text.recommendation && text.severityLabel && text.fieldLabel);
      assert.equal('params' in text, false);
    }
  }
  const duplicate = issues.find(row => row.issueCode === 'DUPLICATE_IMPORT_MALO');
  assert.match(localize(duplicate, 'en').issueText, /import MaLo 50539603888 is listed in row \d+/);
  assert.match(localize(duplicate, 'de').issueText, /Bezugs-MaLo 50539603888 ist in Zeile \d+/);
  assert.notEqual(localize(duplicate, 'de').title, localize(duplicate, 'en').title);
});

test('every rule has German and English texts and summaries mention extra issues', () => {
  for (const [code, texts] of Object.entries(TEXTS)) for (const language of ['de', 'en']) assert.ok(texts[language].title && texts[language].text && texts[language].action, `${code}/${language}`);
  const first = issues[0];
  const several = [first, { ...first, issueCode: 'POSTCODE_MISMATCH' }];
  assert.match(summarize(several, 'en'), /\(\+1\)$/);
  assert.equal(summarize([], 'en'), null);
});
