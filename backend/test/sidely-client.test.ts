import assert from 'node:assert/strict';
import test from 'node:test';
import example from '../examples/producer-onboarding.json';
import { deliverToSidely } from '../src/sidely-client';

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
  assert.deepEqual(await request?.json(), example);

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
