import { createContext, useContext, useEffect, useState } from 'react';
import { ArrowRight, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, Banner, Field } from '@/components/app/patterns';
import { Input } from '@/components/ui/input';
import { loadHealth, loadPersonas, login } from './api';
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


/** Demo sign-in dialog. One demo user, no password: it exists so that manual actions have a named actor. */
export function SignIn({ onSignedIn, expired }: { onSignedIn: (w: Who) => void; expired: boolean }) {
  const { t } = useI18n();
  const [personas, setPersonas] = useState<Persona[]>();
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();
  const [needCode, setNeedCode] = useState(false);
  const [code, setCode] = useState('');
  useEffect(() => { loadHealth().then((h) => setNeedCode(!!h.accessCode)).catch(() => undefined); }, []);
  useEffect(() => { loadPersonas().then(setPersonas).catch((e) => setError(errorText(t, e))); }, [t]);
  const go = async (p: Persona) => {
    setBusy(p.id); setError(undefined);
    try { const s = await login(p.id, code); setToken(s.token); onSignedIn({ name: s.user.name, role: s.user.role }); }
    catch (e) { setError(errorText(t, e)); setBusy(undefined); }
  };
  return (
    <main className="grid min-h-screen place-items-center bg-[radial-gradient(900px_420px_at_50%_-10%,var(--secondary),transparent_70%)] p-6">
      <Card className="w-full max-w-[440px] animate-rise gap-3.5 rounded-2xl p-7 shadow-float">
        <div className="group/brand mb-1.5 flex items-center gap-3">
          <BrandMark />
          <div className="grid gap-px leading-tight"><span className="flex items-center gap-2"><span className="text-[16.5px] font-semibold">Ruhend</span><SimTag /></span><span className="text-[12.5px] text-muted-foreground">{t('app.subtitle')}</span></div>
        </div>
        <h1 className="text-primary">{t('auth.title')}</h1>
        <p className="text-muted-foreground">{t('auth.sub')}</p>
        {expired && <Banner tone="wait" className="mb-0">{t('auth.expired')}</Banner>}
        {error && <Banner tone="err" className="mb-0">{error}</Banner>}
        {needCode && <Field label={t('auth.code')}><Input type="password" autoComplete="off" autoFocus value={code} onChange={(e) => setCode(e.target.value)} placeholder={t('auth.code.ph')} /></Field>}
        <div className="grid gap-2.5">
          {!personas && !error && <Skeleton className="h-[76px]" />}
          {personas?.map((p, i) => (
            <button key={p.id} disabled={!!busy || (needCode && !code)} onClick={() => void go(p)} aria-label={t('auth.signin', { name: p.name })} style={{ animationDelay: `${i * 70 + 120}ms` }}
              className="flex animate-rise items-center gap-3 rounded-xl border bg-card p-3.5 text-left transition hover:-translate-y-px hover:border-teal hover:shadow-[0_0_0_3px_var(--secondary)] disabled:opacity-60">
              <Avatar name={p.name} size="lg" />
              <span className="grid min-w-0 flex-1 gap-0.5"><b className="font-semibold">{p.name}</b><Badge variant="secondary" className="justify-self-start">{t(`role.${p.role}`)}</Badge><small className="text-[12.5px] leading-snug text-muted-foreground">{t(`role.${p.role}.d`)}</small></span>
              {busy === p.id ? <Loader2 className="animate-spin text-muted-foreground" size={16} /> : <ArrowRight size={16} className="text-muted-foreground/60" />}
            </button>
          ))}
        </div>
        <p className="text-[13px] text-muted-foreground">{t('auth.note')}</p>
      </Card>
    </main>
  );
}

/** Read-only gate: controls inside are disabled for a viewer. The backend enforces the same rule; this only explains it. */
export function Gate({ children }: { children: React.ReactNode }) {
  const { write } = useAuth();
  const { t } = useI18n();
  return <fieldset className="m-0 min-w-0 border-0 p-0 disabled:opacity-55 disabled:[&_*]:cursor-not-allowed" disabled={!write} title={write ? undefined : t('auth.guest')}>{children}</fieldset>;
}
