const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');

const port = 4010;
const base = `http://localhost:${port}/odata/v4/energy-overview`;

async function waitForServer() {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try { const response = await fetch(`${base}/Constructs`); if (response.ok) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw new Error('CAP server did not start');
}

test('serves VNB compatibility entities and navigation over OData', async t => {
  const server = spawn(process.execPath, ['node_modules/@sap/cds/bin/serve.js'], { env: { ...process.env, PORT: String(port) }, stdio: 'ignore' });
  t.after(() => server.kill());
  await waitForServer();
  const constructs = await (await fetch(`${base}/Constructs`)).json();
  assert.equal(constructs.value.length, 17);
  const id = constructs.value[0].ID;
  const hourly = await (await fetch(`${base}/Constructs('${id}')/hourlyValues`)).json();
  const payments = await (await fetch(`${base}/Constructs('${id}')/payments`)).json();
  assert.equal(hourly.value.length, 24);
  assert.ok(payments.value.length > 0);
});
