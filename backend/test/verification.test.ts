import assert from 'node:assert/strict';
import test from 'node:test';
import example from '../examples/producer-onboarding.json';
import { producerOnboardingSchema } from '../src/onboarding-schema';
import { validate } from '../src/validation';
import { verifyProducer } from '../src/verification';
import { mockSapLocations } from '../src/mock-sap-data';

test('full mock SAP match is verified', async () => {
  const parsed = producerOnboardingSchema.parse(example);
  const result = await verifyProducer(parsed, validate(parsed));

  assert.equal(result.status, 'VERIFIED');
  assert.equal(result.onboarding_action, 'CONTINUE');
  assert.equal(result.validation.passed, true);
});

test('all city virtual-model examples are verified', async () => {
  const examples = [
    ['DE0073325707820000000000000088943', 'Solar', 6],
    ['DE0073325707820000000000000090001', 'Solar', 6],
    ['DE0073325707820000000000000880945', 'Wind', 7],
    ['DE0073325707820000000000000090002', 'Wind', 6],
    ['DE0001815707800000101300000139428', 'Solar', 5.5],
  ] as const;

  for (const [identifier, production_type, plant_capacity_kw] of examples) {
    const location = mockSapLocations.find((candidate) => candidate.identifier === identifier);
    assert.ok(location);
    const parsed = producerOnboardingSchema.parse({
      ...example,
      market_location_identifier: location.identifier,
      market_location_malo: location.market_location_malo,
      building_id: location.building_id,
      deliv_address_street: location.address.street,
      deliv_address_house_number: location.address.house_number,
      deliv_address_zipcode: location.address.postal_code,
      deliv_address_city: location.address.city,
      production_type,
      plant_capacity_kw,
    });
    const result = await verifyProducer(parsed, validate(parsed));
    assert.equal(result.status, 'VERIFIED', location.address.city);
  }
});

test('legacy Hamburg feed-in JSON remains verified without a client MaLo', async () => {
  const parsed = producerOnboardingSchema.parse({
    first_name: 'Anna',
    last_name: 'Schmidt',
    email: 'anna.schmidt@example.de',
    salutation: 'Frau',
    is_business: true,
    is_reverse_charge: false,
    deliv_address_street: 'Rathausmarkt',
    deliv_address_house_number: '1',
    deliv_address_zipcode: '20095',
    deliv_address_city: 'Hamburg',
    subscription_reason: 'E01',
    construct_type: 'FEED_IN',
    production_type: 'Solar',
    plant_capacity_kw: 6,
    plant_specifics: { latitude: 53.55, longitude: 10 },
    market_location_identifier: 'DE0073325707820000000000000090001',
    tranche: null,
    preferred_delivery_start: '2026-10-01T00:00:00Z',
    saas_customer_id: null,
    saas_contract_id: null,
    product_name: null,
    consumer_saas_contract_id: null,
    control_resource: null,
    technical_resources: null,
    contract_start_utc: '2026-10-01T00:00:00Z',
    contract_end_utc: '2027-10-01T00:00:00Z',
    building_id: 'B-HAM-01',
  });
  const result = await verifyProducer(parsed, validate(parsed));
  assert.equal(result.status, 'VERIFIED');
  assert.equal(result.verified, true);
  assert.equal(result.onboarding_action, 'CONTINUE');
});

test('city apartment MeLo examples are verified against their building MaLo', async () => {
  const apartmentIdentifiers = [
    'DE0001815707800000101300000139372',
    'DE0001815707800000101300000139373',
    'DE0001815707800000101300000139374',
    'DE0001815707800000101300000139375',
    'DE0001815707800000101300000139376',
  ];

  for (const identifier of apartmentIdentifiers) {
    const location = mockSapLocations.find((candidate) => candidate.identifier === identifier);
    assert.ok(location);
    const parsed = producerOnboardingSchema.parse({
      ...example,
      construct_type: 'BUILDING',
      subscription_reason: 'E02',
      market_location_identifier: location.identifier,
      market_location_malo: location.market_location_malo,
      building_market_location_malo: location.market_location_malo,
      building_id: location.building_id,
      production_type: 'Keine',
      plant_capacity_kw: 0,
      deliv_address_street: location.address.street,
      deliv_address_house_number: location.address.house_number,
      deliv_address_zipcode: location.address.postal_code,
      deliv_address_city: location.address.city,
      units: [{ name: 'Wohnung 1. OG links', kind: 'unit', melo: location.identifier }],
    });
    const result = await verifyProducer(parsed, validate(parsed));
    assert.equal(result.status, 'VERIFIED', location.address.city);
  }
});

test('capacity mismatch is rejected', async () => {
  const parsed = producerOnboardingSchema.parse({ ...example, plant_capacity_kw: 9 });
  const result = await verifyProducer(parsed, validate(parsed));

  assert.equal(result.status, 'REJECTED');
  assert.equal(result.onboarding_action, 'STOP');
});

test('unknown SAP location is not verifiable', async () => {
  const parsed = producerOnboardingSchema.parse({
    ...example,
    market_location_identifier: 'DE9999999999999999999999999999999',
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
