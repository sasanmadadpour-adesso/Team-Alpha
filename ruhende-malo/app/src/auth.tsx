import { createContext, useContext, useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { loadPersonas, login } from './api';
import { useI18n } from './i18n';
import { SIGNED_OUT, canAdmin, canWrite, setToken, type Persona, type Role } from './session';
import { BrandMark, SimTag, errorText } from './ui';

export interface Who { name: string; role: Role | 'NONE' }
interface Auth { who: Who; signedIn: boolean; write: boolean; admin: boolean; signOut: () => void; openSignIn: () => void }
export const AuthContext = createContext<Auth | undefined>(undefined);
export const useAuth = () => {
  const a = useContext(AuthContext);
  if (!a) throw new Error('AuthContext missing');
  return a;
};
const GUEST: Who = { name: '', role: 'NONE' };
export const makeAuth = (who: Who | null, setWho: (w: Who | null) => void, openSignIn: () => void): Auth => ({
  who: who ?? GUEST, signedIn: !!who, write: canWrite(who?.role), admin: canAdmin(who?.role),
  signOut: () => { setToken(null); setWho(null); },
  openSignIn,
});
export { SIGNED_OUT };

export const initials = (name: string) => name.split(/[\s.]+/).filter(Boolean).map((p) => p[0]).join('').slice(0, 2).toUpperCase();

/** Demo sign-in dialog. One demo user, no password: it exists so that manual actions have a named actor. */
export function SignIn({ onSignedIn, expired }: { onSignedIn: (w: Who) => void; expired: boolean }) {
  const { t } = useI18n();
  const [personas, setPersonas] = useState<Persona[]>();
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();
  useEffect(() => { loadPersonas().then(setPersonas).catch((e) => setError(errorText(t, e))); }, [t]);
  const go = async (p: Persona) => {
    setBusy(p.id); setError(undefined);
    try { const s = await login(p.id); setToken(s.token); onSignedIn({ name: s.user.name, role: s.user.role }); }
    catch (e) { setError(errorText(t, e)); setBusy(undefined); }
  };
  return (
    <main className="signin">
      <div className="signin-card">
        <div className="signin-brand"><BrandMark /><div className="brand-text"><span className="brand-line"><span className="brand-name">Ruhend</span><SimTag /></span><span className="brand-sub">{t('app.subtitle')}</span></div></div>
        <h1>{t('auth.title')}</h1>
        <p className="muted">{t('auth.sub')}</p>
        {expired && <div className="banner wait">{t('auth.expired')}</div>}
        {error && <div className="banner err">{error}</div>}
        <div className="persona-list">
          {!personas && !error && <div className="skeleton" style={{ height: 76 }} />}
          {personas?.map((p) => (
            <button key={p.id} className="persona" disabled={!!busy} onClick={() => void go(p)} aria-label={t('auth.signin', { name: p.name })}>
              <span className="av">{initials(p.name)}</span>
              <span className="persona-text"><b>{p.name}</b><span className={`role-tag ${p.role}`}>{t(`role.${p.role}`)}</span><small>{t(`role.${p.role}.d`)}</small></span>
              {busy === p.id ? <span className="spin" /> : <Check size={16} className="persona-go" />}
            </button>
          ))}
        </div>
        <p className="subtle">{t('auth.note')}</p>
      </div>
    </main>
  );
}

/** Read-only gate: controls inside are disabled for a viewer. The backend enforces the same rule; this only explains it. */
export function Gate({ children }: { children: React.ReactNode }) {
  const { write } = useAuth();
  const { t } = useI18n();
  return <fieldset className="ro" disabled={!write} title={write ? undefined : t('auth.guest')}>{children}</fieldset>;
}
