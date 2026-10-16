/** Demo session: the Bearer token from login. Kept in sessionStorage so closing the tab signs out. */
export type Role = 'VIEWER' | 'MAINTAINER' | 'PIPELINE';
export interface Persona { id: string; name: string; title: string; role: Role }
const KEY = 'ruhend.session';
let token: string | null = null;
try { token = sessionStorage.getItem(KEY); } catch { /* storage unavailable */ }

export const getToken = () => token;
export function setToken(next: string | null) {
  token = next;
  try { if (next) sessionStorage.setItem(KEY, next); else sessionStorage.removeItem(KEY); } catch { /* storage unavailable */ }
}
export const SIGNED_OUT = 'ruhend:signed-out';
/** What a role may do — mirrors srv/auth.ts, which is the real enforcement. The UI only explains it. */
export const canWrite = (role?: Role | 'NONE') => role === 'MAINTAINER' || role === 'PIPELINE';
export const canAdmin = (role?: Role | 'NONE') => role === 'MAINTAINER';
