import assert from 'node:assert/strict';
import test from 'node:test';
import example from '../examples/producer-onboarding.json';
import { producerOnboardingSchema } from '../src/onboarding-schema';
import { validate } from '../src/validation';
import { verifyProducer } from '../src/verification';

test('full mock SAP match is verified', async () => {
  const parsed = producerOnboardingSchema.parse(example);
  const result = await verifyProducer(parsed, validate(parsed));

  assert.equal(result.status, 'VERIFIED');
  assert.equal(result.onboarding_action, 'CONTINUE');
  assert.equal(result.validation.passed, true);
});

test('capacity mismatch requires manual review', async () => {
  const parsed = producerOnboardingSchema.parse({ ...example, plant_capacity_kw: 9 });
  const result = await verifyProducer(parsed, validate(parsed));

  assert.equal(result.status, 'MANUAL_REVIEW');
  assert.equal(result.onboarding_action, 'PAUSE_FOR_REVIEW');
});

test('unknown SAP location is not verifiable', async () => {
  const parsed = producerOnboardingSchema.parse({
    ...example,
    market_location_identifier: 'DE99999999999',
  });
  const result = await verifyProducer(parsed, validate(parsed));

  assert.equal(result.status, 'NOT_VERIFIABLE');
  assert.equal(result.onboarding_action, 'REQUEST_CLARIFICATION');
});

test('wrong network operator is rejected', async () => {
  const parsed = producerOnboardingSchema.parse({
    ...example,
    market_location_identifier: 'DE000000000000WRONGNETWORK',
  });
  const result = await verifyProducer(parsed, validate(parsed));

  assert.equal(result.status, 'REJECTED');
  assert.equal(result.onboarding_action, 'STOP');
});

test('SAP source failure is not treated as rejection', async () => {
  const parsed = producerOnboardingSchema.parse({
    ...example,
    market_location_identifier: 'DE000000000000UNAVAILABLE',
  });
  const result = await verifyProducer(parsed, validate(parsed));

  assert.equal(result.status, 'SOURCE_UNAVAILABLE');
  assert.equal(result.onboarding_action, 'RETRY_LATER');
});

test('local validation failure returns a consistent VALIDATION_FAILED response', async () => {
  const parsed = producerOnboardingSchema.parse({
    ...example,
    deliv_address_zipcode: 'not-a-postal-code',
  });
  const checks = validate(parsed);
  const result = await verifyProducer(parsed, checks);

  assert.equal(result.status, 'VALIDATION_FAILED');
  assert.equal(result.valid, false);
  assert.equal(result.verified, false);
  assert.equal(result.validation.passed, false);
  assert.equal(result.verification.performed, false);
  assert.equal(result.onboarding_action, 'CORRECT_DATA');
});
