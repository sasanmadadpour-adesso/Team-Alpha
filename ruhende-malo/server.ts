import cds from '@sap/cds';
import express from 'express';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { accessCodeRequired, accessCodeValid, actionOf, allowed, createLimiter, hashKey, isKeyToken, needFor, verifySession, type Principal, type Role } from './srv/auth.js';

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

const loginLimiter = createLimiter(8, 5 * 60_000);   // 8 failed sign-ins per 5 minutes per address

/** Security headers for the HTML shell (the API sends JSON only). */
const HTML_HEADERS: Record<string, string> = {
  'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; font-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY',
};

cds.on('bootstrap', (app: express.Express) => {
  app.set('trust proxy', true);   // behind Cloudflare / a reverse proxy: req.ip is the real client

  // The built UI is served by the same process (one port, one container). Hash routing: no history fallback needed.
  const uiDir = path.resolve(process.env.UI_DIR ?? 'app/dist');
  if (existsSync(path.join(uiDir, 'index.html'))) {
    app.use(express.static(uiDir, {
      index: 'index.html',
      setHeaders: (res, file) => {
        if (file.endsWith('.html')) { res.setHeader('Cache-Control', 'no-cache'); Object.entries(HTML_HEADERS).forEach(([k, v]) => res.setHeader(k, v)); }
        else if (file.includes(`${path.sep}assets${path.sep}`)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      },
    }));
    // Clean English URLs (/cases, /constructs/B-MUL-01 …): every page request that is not API, OData or a file gets the app shell.
    app.get(/^\/(?!api\/|odata\/)[^.]*$/, (_req, res) => {
      Object.entries(HTML_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(path.join(uiDir, 'index.html'));
    });
  }

  app.use('/api/v1', express.json({ limit: '25mb' }), async (req, res, next) => {
    const started = Date.now();
    delete req.headers['x-ruhend-actor']; delete req.headers['x-ruhend-role']; delete req.headers['x-ruhend-via'];
    let principal: Principal | undefined;
    try { principal = await principalOf(req.headers.authorization); } catch { principal = undefined; }
    if (principal) { req.headers['x-ruhend-actor'] = principal.actor; req.headers['x-ruhend-role'] = principal.role; req.headers['x-ruhend-via'] = principal.via; }

    if (req.method === 'POST') {
      const action = actionOf(req.path);
      const need = needFor(action);
      if (action === 'login' && accessCodeRequired()) {
        const ip = req.ip ?? 'unknown';
        if (loginLimiter.blocked(ip)) return reject(res, 429, 'TOO_MANY_ATTEMPTS', 'Too many failed attempts. Try again later.');
        if (!accessCodeValid((req.body as { code?: string } | undefined)?.code)) { loginLimiter.fail(ip); return reject(res, 401, 'CODE_INVALID', 'The access code is not correct.'); }
        loginLimiter.reset(ip);
      }
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
