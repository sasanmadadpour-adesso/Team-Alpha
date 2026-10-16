import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Demo access control. NOT real authentication: personas are fixed, there are no passwords and no identity provider.
 * It exists so that every write call has a named actor and a role, as a real deployment would need.
 */
export type Role = 'VIEWER' | 'MAINTAINER' | 'PIPELINE';
export type Need = 'PUBLIC' | 'ANY' | 'WRITE' | 'MAINTAINER';
export interface Persona { id: string; name: string; title: string; role: Role }
export interface Principal { id: string; name: string; role: Role; via: 'SESSION' | 'KEY'; actor: string }

export const PERSONAS: Persona[] = [
  { id: 'm.weber', name: 'M. Weber', title: 'Sachbearbeiter', role: 'MAINTAINER' },
];
export const ROLES: Role[] = ['VIEWER', 'MAINTAINER', 'PIPELINE'];
export const SESSION_HOURS = 12;

const SECRET = process.env.RUHEND_SESSION_SECRET ?? createHash('sha256').update(`ruhend-demo-sessions:${process.cwd()}`).digest('hex');
const sign = (payload: string) => createHmac('sha256', SECRET).update(payload).digest('base64url');

export function signSession(personaId: string, now = Date.now()): { token: string; expiresAt: string } {
  const exp = now + SESSION_HOURS * 3_600_000;
  const payload = `${personaId}.${exp}`;
  return { token: `s1.${payload}.${sign(payload)}`, expiresAt: new Date(exp).toISOString() };
}

export function verifySession(token: string, now = Date.now()): Principal | undefined {
  const m = /^s1\.([a-z.]+)\.(\d+)\.([\w-]+)$/.exec(token);
  if (!m) return undefined;
  const [, id, exp, sig] = m;
  const expected = sign(`${id}.${exp}`);
  if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return undefined;
  if (Number(exp) < now) return undefined;
  const p = PERSONAS.find((x) => x.id === id);
  return p && { id: p.id, name: p.name, role: p.role, via: 'SESSION', actor: p.name };
}

export const hashKey = (token: string) => createHash('sha256').update(token).digest('hex');
export const newKeyToken = () => `rk_${randomBytes(24).toString('base64url')}`;
export const isKeyToken = (token: string) => token.startsWith('rk_');

/** Minimum permission per POST action (last path segment). Unlisted actions change state, so they need WRITE. */
const NEEDS: Record<string, Need> = {
  login: 'PUBLIC',
  preview: 'ANY', previewSwitch: 'ANY',
  resetDemo: 'MAINTAINER', importWorkbook: 'MAINTAINER', runSelfCheck: 'MAINTAINER', createApiKey: 'MAINTAINER', revokeApiKey: 'MAINTAINER',
};
export const needFor = (action: string): Need => NEEDS[action] ?? 'WRITE';
export const actionOf = (path: string) => path.split('?')[0].split('/').filter(Boolean).at(-1)?.replace(/\(.*\)$/, '') ?? '';

export function allowed(role: Role | undefined, need: Need): boolean {
  if (need === 'PUBLIC') return true;
  if (!role) return false;
  if (need === 'ANY') return true;
  if (need === 'WRITE') return role === 'MAINTAINER' || role === 'PIPELINE';
  return role === 'MAINTAINER';
}
