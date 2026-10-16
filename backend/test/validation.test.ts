import assert from 'node:assert/strict';
import test from 'node:test';
import { producerOnboardingSchema } from '../src/onboarding-schema';
import { classifyIdentifier, validate } from '../src/validation';
import example from '../examples/producer-onboarding.json';

test('validates the example producer request', () => {
  const parsed = producerOnboardingSchema.parse(example);
  const checks = validate(parsed);

  assert.equal(checks.some((check) => check.result === 'INVALID'), false);
});

test('classifies MaLo and MeLo-like identifiers', () => {
  assert.equal(classifyIdentifier('12345678901'), 'MALO');
  assert.equal(classifyIdentifier('DE0073325707820000000000000088943'), 'MELO');
  assert.equal(classifyIdentifier('bad'), 'UNKNOWN');
});

test('requires eleven-digit MaLo and 33-character MeLo identifiers', () => {
  assert.equal(classifyIdentifier('51781123293'), 'MALO');
  assert.equal(classifyIdentifier('DE0073325707820000000000000880945'), 'MELO');
  assert.equal(classifyIdentifier('DE00733257078200000000000000880945'), 'UNKNOWN');
  assert.equal(classifyIdentifier('5178112329'), 'UNKNOWN');
});

test('requires an identifier or tranche', () => {
  const parsed = producerOnboardingSchema.parse({
    ...example,
    market_location_identifier: null,
    tranche: null,
  });
  const checks = validate(parsed);

  const identifierOrTrancheCheck = checks.find(
    (check) => check.field === 'market_location_identifier_or_tranche',
  );

  assert.equal(identifierOrTrancheCheck?.result, 'INVALID');
});

test('rejects tranche-only submissions because SAP lookup is identifier-only', () => {
  const parsed = producerOnboardingSchema.parse({
    ...example,
    market_location_identifier: null,
    tranche: 'some-tranche-reference',
  });
  const checks = validate(parsed);

  const tranchePenaltyCheck = checks.find(
    (check) => check.field === 'market_location_identifier' && check.result === 'INVALID',
  );

  assert.ok(tranchePenaltyCheck, 'expected a validation error explaining tranche-only is unsupported');
});

test('rejects reversed contract dates', () => {
  const parsed = producerOnboardingSchema.parse({
    ...example,
    contract_start_utc: '2026-10-02T00:00:00Z',
    contract_end_utc: '2026-10-01T00:00:00Z',
  });
  const checks = validate(parsed);

  const contractPeriodCheck = checks.find((check) => check.field === 'contract_period');

  assert.equal(contractPeriodCheck?.result, 'INVALID');
});

test('rejects empty required text fields', () => {
  const parsed = producerOnboardingSchema.safeParse({
    ...example,
    first_name: '',
  });

  assert.equal(parsed.success, false);
});

test('rejects whitespace-only required text fields', () => {
  const parsed = producerOnboardingSchema.safeParse({
    ...example,
    building_id: '   ',
  });

  assert.equal(parsed.success, false);
});
