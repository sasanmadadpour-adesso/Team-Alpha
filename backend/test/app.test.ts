import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { app } from '../src/app';
import example from '../examples/producer-onboarding.json';

let server: Server;
let baseUrl: string;

before(() => {
  return new Promise<void>((resolve) => {
    server = app.listen(0, () => {
      const { port } = server.address() as AddressInfo;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
});

after(() => {
  return new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

async function postVerify(body: unknown): Promise<Response> {
  return fetch(`${baseUrl}/api/onboarding/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

test('valid example request returns HTTP 200 and VERIFIED', async () => {
  const response = await postVerify(example);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.status, 'VERIFIED');
  assert.equal(body.validation.passed, true);
});

test('local business validation failure returns HTTP 400', async () => {
  const response = await postVerify({ ...example, deliv_address_zipcode: 'bad' });
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.equal(body.status, 'VALIDATION_FAILED');
  assert.equal(body.validation.passed, false);
  assert.equal(body.onboarding_action, 'CORRECT_DATA');
});

test('schema validation failure returns HTTP 400', async () => {
  const { first_name: _omitted, ...withoutFirstName } = example;
  const response = await postVerify(withoutFirstName);
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.equal(body.status, 'VALIDATION_FAILED');
  assert.equal(body.validation.passed, false);
});

test('SAP source failure returns HTTP 503 and SOURCE_UNAVAILABLE', async () => {
  const response = await postVerify({
    ...example,
    market_location_identifier: 'DE000000000000UNAVAILABLE',
  });
  const body = await response.json();

  assert.equal(response.status, 503);
  assert.equal(body.status, 'SOURCE_UNAVAILABLE');
});

test('unknown SAP record returns HTTP 200 and NOT_VERIFIABLE', async () => {
  const response = await postVerify({
    ...example,
    market_location_identifier: 'DE9999999999999999999999999999999',
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.status, 'NOT_VERIFIABLE');
});

test('wrong network operator returns HTTP 200 and REJECTED', async () => {
  const response = await postVerify({
    ...example,
    market_location_identifier: 'DE000000000000WRONGNETWORK',
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.status, 'REJECTED');
});

test('malformed JSON returns a structured HTTP 400 response', async () => {
  const response = await fetch(`${baseUrl}/api/onboarding/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{ this is not valid json',
  });
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.equal(body.status, 'VALIDATION_FAILED');
  assert.equal(body.validation.passed, false);
  assert.equal(body.onboarding_action, 'CORRECT_DATA');
});

test('mock SAP endpoint returns HTTP 200 for a known identifier', async () => {
  const response = await fetch(
    `${baseUrl}/api/mock-sap/locations/DE0073325707820000000000000088943`,
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.source, 'MOCK_SAP_DEMONSTRATION');
  assert.equal(body.identifier, 'DE0073325707820000000000000088943');
});

test('mock SAP endpoint returns HTTP 404 for an unknown identifier', async () => {
  const response = await fetch(`${baseUrl}/api/mock-sap/locations/DE99999999999`);

  assert.equal(response.status, 404);
});
