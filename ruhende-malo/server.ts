import cds from '@sap/cds';
import express from 'express';
import { actionOf, allowed, hashKey, isKeyToken, needFor, verifySession, type Principal, type Role } from './srv/auth.js';

/**
 * Access layer for /api/v1 (demo, not real authentication): resolves the caller from "Authorization: Bearer <token>"
 * (session token from login, or API key), rejects writes the role may not do, forces the actor to the authenticated
 * name and logs every write call. The business logic never sees an unauthenticated write.
 */
const ns = (n: string) => `mk7.controlcenter.${n}`;
const reject = (res: express.Response, status: number, code: string, message: string, params: object = {}) =>
  res.status(status).json({ error: { code, message, args: [JSON.stringify(params)] } });

async function principalOf(header: string | undefined): Promise<Principal | undefined> {
  const token = /^Bearer\s+(\S+)$/i.exec(header ?? '')?.[1];
  if (!token) return undefined;
  if (!isKeyToken(token)) return verifySession(token);
  const key = await cds.db.run(SELECT.one.from(ns('ApiKeys')).columns('ID', 'name', 'role').where({ hash: hashKey(token), revokedAt: null })) as { ID: string; name: string; role: Role } | undefined;
  if (!key) return undefined;
  void cds.db.run(UPDATE(ns('ApiKeys')).set({ lastUsedAt: new Date().toISOString() }).where({ ID: key.ID })).catch(() => undefined);
  return { id: key.ID, name: key.name, role: key.role, via: 'KEY', actor: `Key: ${key.name}` };
}

cds.on('bootstrap', (app: express.Express) => {
  app.use('/api/v1', express.json({ limit: '25mb' }), async (req, res, next) => {
    const started = Date.now();
    delete req.headers['x-ruhend-actor']; delete req.headers['x-ruhend-role']; delete req.headers['x-ruhend-via'];
    let principal: Principal | undefined;
    try { principal = await principalOf(req.headers.authorization); } catch { principal = undefined; }
    if (principal) { req.headers['x-ruhend-actor'] = principal.actor; req.headers['x-ruhend-role'] = principal.role; req.headers['x-ruhend-via'] = principal.via; }

    if (req.method === 'POST') {
      const action = actionOf(req.path);
      const need = needFor(action);
      if (!allowed(principal?.role, need)) {
        return principal
          ? reject(res, 403, 'FORBIDDEN', `Role ${principal.role} may not call ${action}.`, { role: principal.role, action })
          : reject(res, 401, 'AUTH_REQUIRED', `Sign in or send an API key to call ${action}.`, { action });
      }
      if (action !== 'login') {
        res.on('finish', () => {
          void cds.db.run(INSERT.into(ns('ApiCalls')).entries({ at: new Date().toISOString(), actor: principal?.actor ?? 'anonymous', via: principal?.via ?? '-', method: req.method, path: req.originalUrl.split('?')[0].slice(0, 200), status: res.statusCode, durationMs: Date.now() - started })).catch(() => undefined);
        });
      }
    }
    next();
  });
});

export default cds.server;
