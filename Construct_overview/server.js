const cds = require('@sap/cds');
const { getLiveConstructSync } = require('./srv/lib/live-construct-sync');

// Load the member portal bootstrap hooks added by the overview branch as well as
// the live synchronization webhooks defined below.
require('./srv/server');

function authorized(req) {
  const expected = process.env.SYNC_API_KEY;
  if (!expected) return true;
  const bearer = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  return req.headers['x-api-key'] === expected || bearer === expected;
}

cds.on('bootstrap', app => {
  const sync = getLiveConstructSync();
  app.use('/api/webhooks', require('express').json({ limit: '2mb' }));
  for (const source of ['pending', 'registered']) {
    app.post(`/api/webhooks/${source}`, (req, res) => {
      if (!authorized(req)) return res.status(401).json({ error: 'Invalid API key' });
      try {
        return res.status(202).json(sync.applyWebhook(source, req.body));
      } catch (error) {
        return res.status(400).json({ error: error.message });
      }
    });
  }
});

cds.on('served', () => getLiveConstructSync().start());
cds.on('shutdown', () => getLiveConstructSync().stop());

module.exports = cds.server;
