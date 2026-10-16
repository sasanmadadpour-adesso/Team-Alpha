const cds = require('@sap/cds');
const { getLiveConstructSync } = require('./srv/lib/live-construct-sync');
const { hostedEnergy } = require('./srv/lib/hosted-energy-client');

function authorized(req) {
  const expected = process.env.SYNC_API_KEY;
  if (!expected) return true;
  const bearer = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  return req.headers['x-api-key'] === expected || bearer === expected;
}

cds.on('bootstrap', app => {
  const sync = getLiveConstructSync();
  const router = require('express').Router();
  router.use(require('express').json({ limit: '2mb' }));
  for (const source of ['pending', 'registered']) {
    router.post(`/${source}`, (req, res) => {
      if (!authorized(req)) return res.status(401).json({ error: 'Invalid API key' });
      try {
        return res.status(202).json(sync.applyWebhook(source, req.body));
      } catch (error) {
        return res.status(400).json({ error: error.message });
      }
    });
  }
  app.use('/api/webhooks', router);

  // Browser-safe live energy proxy. Credentials are read from the server environment
  // and are never sent to the Fiori client.
  app.get('/api/live-energy', async (req, res) => {
    const malo = String(req.query.malo || '').trim();
    const range = String(req.query.range || '7d').trim();
    let building = String(req.query.building || '').trim();
    let member;
    if (!building && malo) {
      member = sync.registered().find(row => row.primaryMaLo === malo || row.importMaLo === malo || row.exportMaLo === malo);
      building = String(member?.buildingID || member?.buildingId || '');
    }
    if (!member && malo) member = sync.registered().find(row => row.primaryMaLo === malo || row.importMaLo === malo || row.exportMaLo === malo);
    try {
      res.setHeader('Cache-Control', 'private, max-age=30');
      return res.json(await hostedEnergy({ malo, building, range, roleCode: member?.roleCode }));
    } catch (error) {
      return res.status(error.status || 502).json({ error: { code: error.code || 'HOSTED_ENERGY_ERROR', message: error.message } });
    }
  });
});

// Register member portal middleware after the webhook router. Its intentionally
// small global JSON limit must not intercept full synchronization snapshots.
require('./srv/server');

cds.on('served', () => getLiveConstructSync().start());
cds.on('shutdown', () => getLiveConstructSync().stop());

module.exports = cds.server;
