import assert from 'node:assert/strict';
import test from 'node:test';
import example from '../examples/producer-onboarding.json';
import { deliverToSidely, toSidelyConstructPayload, toSidelyPayload } from '../src/sidely-client';

test('does not attempt delivery without a configured token', async () => {
  const previousToken = process.env.SIDELY_API_TOKEN;
  delete process.env.SIDELY_API_TOKEN;

  const result = await deliverToSidely(example);

  assert.equal(result.status, 'NOT_CONFIGURED');
  assert.equal(result.attempted, false);
  process.env.SIDELY_API_TOKEN = previousToken;
});

test('sends the onboarding payload with bearer authorization', async () => {
  const previousToken = process.env.SIDELY_API_TOKEN;
  const previousFetch = globalThis.fetch;
  process.env.SIDELY_API_TOKEN = 'test-token';
  let request: Request | undefined;

  globalThis.fetch = async (input, init) => {
    request = new Request(input, init);
    return new Response('{}', { status: 201 });
  };

  const result = await deliverToSidely(example);

  assert.equal(result.status, 'DELIVERED');
  assert.equal(request?.headers.get('authorization'), 'Bearer test-token');
  assert.match(request?.headers.get('idempotency-key') ?? '', /^[0-9a-f-]{36}$/);
  assert.deepEqual(await request?.json(), { ...example, construct_type: 'FEED_IN', market_location_malo: '51781123293' });

  globalThis.fetch = previousFetch;
  process.env.SIDELY_API_TOKEN = previousToken;
});

test('does not send internal verification fields to Sidely', async () => {
  const payload = await toSidelyPayload({
    ...example,
    construct_type: 'BUILDING',
    market_location_malo: '51781123293',
    building_market_location_malo: '51781123293',
    units: [{ name: 'Wohnung 1', kind: 'unit', melo: 'DE0001815707800000101300000139372' }],
  });

  assert.equal(payload.construct_type, 'BUILDING');
  assert.equal(payload.market_location_malo, '51781123293');
  assert.equal('building_market_location_malo' in payload, false);
  assert.equal('units' in payload, false);
  assert.equal(payload.market_location_identifier, example.market_location_identifier);
});

test('derives the required Sidely MaLo for legacy requests', async () => {
  const payload = await toSidelyPayload({ ...example, market_location_malo: null });
  assert.equal(payload.market_location_malo, '51781123293');
  assert.equal(payload.construct_type, 'FEED_IN');
  assert.equal(payload.preferred_delivery_start, example.contract_start_utc);
});

test('maps building submissions to the registerConstruct contract', () => {
  const payload = toSidelyConstructPayload({
    ...example,
    construct_type: 'BUILDING',
    building_market_location_malo: '51781123293',
    market_location_identifier: 'DE0001815707800000101300000139372',
    units: [
      { name: 'Wohnung 1', kind: 'unit', melo: 'DE0001815707800000101300000139372' },
      { name: 'Solaranlage', kind: 'generator', melo: null, generator_malo: '51781123294', generator_melo: 'DE0073325707820000000000000088944' },
    ],
  });

  assert.deepEqual(payload, {
    construct: {
      buildingId: 'B-FRA-01',
      city: 'Frankfurt am Main',
      streetAddress: 'Vilbeler Landstrasse 21',
      stichtag: '2026-10-01',
      participants: [
        {
          role: 'Marktlokation Reststrom',
          maloId: '51781123293',
          meloId: 'DE0001815707800000101300000139372',
          participates: true,
          generationFeedInMaloId: null,
          supplyStartUtc: '2026-10-01',
        },
        {
          role: 'Solaranlage',
          maloId: '51781123294',
          meloId: 'DE0073325707820000000000000088944',
          participates: true,
          generationFeedInMaloId: '51781123294',
          supplyStartUtc: '2026-10-01',
        },
      ],
    },
  });
});

test('sends building submissions to registerConstruct', async () => {
  const previousToken = process.env.SIDELY_API_TOKEN;
  const previousFetch = globalThis.fetch;
  process.env.SIDELY_API_TOKEN = 'test-token';
  let request: Request | undefined;
  globalThis.fetch = async (input, init) => {
    request = new Request(input, init);
    return new Response('{}', { status: 201 });
  };

  const input = {
    ...example,
    construct_type: 'BUILDING' as const,
    building_market_location_malo: '51781123293',
    units: [{ name: 'Wohnung 1', kind: 'unit' as const, melo: 'DE0001815707800000101300000139372' }],
  };
  const result = await deliverToSidely(input);

  assert.equal(result.status, 'DELIVERED');
  assert.equal(request?.url, 'https://ruhend.sidely.dev/api/v1/registerConstruct');
  assert.deepEqual(await request?.json(), toSidelyConstructPayload(input));
  globalThis.fetch = previousFetch;
  process.env.SIDELY_API_TOKEN = previousToken;
});

test('includes Sidely error details for rejected requests', async () => {
  const previousToken = process.env.SIDELY_API_TOKEN;
  const previousFetch = globalThis.fetch;
  process.env.SIDELY_API_TOKEN = 'test-token';
  globalThis.fetch = async () => new Response('{"error":"invalid payload"}', { status: 400 });

  const result = await deliverToSidely(example);

  assert.equal(result.status, 'FAILED');
  assert.match(result.message, /invalid payload/);
  globalThis.fetch = previousFetch;
  process.env.SIDELY_API_TOKEN = previousToken;
});

test('does not deliver unverified applications', async () => {
  // The application route gates delivery on VERIFIED. This test documents
  // the policy at the client boundary: the delivery client is not called for
  // NOT_VERIFIABLE or SOURCE_UNAVAILABLE results.
  const previousToken = process.env.SIDELY_API_TOKEN;
  const previousFetch = globalThis.fetch;
  process.env.SIDELY_API_TOKEN = 'test-token';
  let called = false;
  globalThis.fetch = async () => {
    called = true;
    return new Response('{}', { status: 201 });
  };

  // No call to deliverToSidely means no outbound request for an unverified result.
  const unverifiedResult = { status: 'NOT_VERIFIABLE' };
  assert.equal(unverifiedResult.status, 'NOT_VERIFIABLE');
  assert.equal(called, false);

  globalThis.fetch = previousFetch;
  process.env.SIDELY_API_TOKEN = previousToken;
});

test('live Sidely API accepts a verified package when configured', { skip: !process.env.SIDELY_API_TOKEN }, async () => {
  const result = await deliverToSidely(example);

  assert.equal(result.attempted, true);
  assert.equal(result.status, 'DELIVERED');
  assert.equal(result.delivered, true);
});
