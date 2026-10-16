import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Copy, Download, KeyRound, Loader2, Play, Trash2 } from 'lucide-react';
import { type ApiKey, type Snapshot, createApiKey, loadApiKeys, loadHealth, loadSnapshot, revokeApiKey } from '../api';
import { Gate, useAuth } from '../auth';
import { confirmDialog } from '../confirm';
import { relTime, useI18n } from '../i18n';
import { getToken } from '../session';
import { errorText, openItems, useApp, useRoute } from '../ui';
import { Banner, Field, PageHeader } from '@/components/app/patterns';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

type Need = 'READ' | 'PUBLIC' | 'ANY' | 'WRITE' | 'MAINTAINER';
type Group = 'process' | 'malo' | 'read' | 'access';
interface Ep { id: string; method: 'GET' | 'POST'; path: string; group: Group; need: Need; title: string; body?: (d: Ctx) => object }
interface Ctx { construct: string; malo: string; issue: string }

/** Live defaults from the current data, so every example works on what is really in the system. */
const context = (d: Snapshot): Ctx => ({
  construct: d.constructs[0]?.constructId ?? 'B-MUL-01',
  malo: (d.cases.find((c) => c.kind === 'HOUSEHOLD' && ['DONE', 'REACTIVATED'].includes(c.status)) ?? d.cases.find((c) => c.kind === 'HOUSEHOLD'))?.maloId ?? '50539603921',
  issue: d.cases.flatMap((c) => c.issues).find((i) => i.allowedResolutions.includes('CONFIRM_ASSUMPTION'))?.ID ?? '{ID}',
});

const DEMO = { construct: 'B-API-01', reststrom: '50000000101', household: '50000000110', meloR: `DE${'0'.repeat(30)}9`, meloH: `DE${'0'.repeat(30)}1` };
const CATALOGUE: Ep[] = [
  { id: 'register', method: 'POST', path: '/registerConstruct', group: 'process', need: 'WRITE', title: 'api.e.register', body: () => ({ construct: { buildingId: DEMO.construct, city: 'Essen', stichtag: '2026-11-01', participants: [
    { role: 'Marktlokation Reststrom', maloId: DEMO.reststrom, meloId: DEMO.meloR },
    { role: 'Haushaltsverbrauch', maloId: DEMO.household, meloId: DEMO.meloH, participates: true }] } }) },
  { id: 'cases', method: 'GET', path: '/cases()', group: 'process', need: 'READ', title: 'api.e.cases' },
  { id: 'processAll', method: 'POST', path: '/processAll', group: 'process', need: 'WRITE', title: 'api.e.processAll', body: () => ({}) },
  { id: 'process', method: 'POST', path: '/Constructs/{construct}/process', group: 'process', need: 'WRITE', title: 'api.e.process', body: () => ({}) },
  { id: 'previewSwitch', method: 'POST', path: '/Constructs/{construct}/previewSwitch', group: 'process', need: 'ANY', title: 'api.e.preview', body: () => ({}) },
  { id: 'executeSwitch', method: 'POST', path: '/Constructs/{construct}/executeSwitch', group: 'process', need: 'WRITE', title: 'api.e.executeSwitch', body: () => ({}) },
  { id: 'sapState', method: 'POST', path: '/updateSapState', group: 'process', need: 'WRITE', title: 'api.e.sapState', body: () => ({ attribute: 'abmeldung', objectId: '50539603876', value: 'CONFIRMED' }) },
  { id: 'resolve', method: 'POST', path: '/Issues/{issue}/resolve', group: 'process', need: 'WRITE', title: 'api.e.resolve', body: () => ({ resolution: 'CONFIRM_ASSUMPTION', reason: 'Confirmed from the API playground' }) },
  { id: 'vsz', method: 'POST', path: '/Constructs/{construct}/confirmVsz', group: 'process', need: 'WRITE', title: 'api.e.vsz', body: () => ({ evidence: 'DSO-DP order confirmed by phone' }) },
  { id: 'relList', method: 'GET', path: '/Constructs/{construct}/relationshipList()', group: 'process', need: 'READ', title: 'api.e.relList' },
  { id: 'outbox', method: 'GET', path: '/Outbox', group: 'process', need: 'READ', title: 'api.e.outbox' },
  { id: 'opPreview', method: 'POST', path: '/preview', group: 'malo', need: 'ANY', title: 'api.e.opPreview', body: (c) => ({ command: { operation: 'REACTIVATE', maloId: c.malo, buildingId: c.construct, effectiveDate: '2026-12-01' } }) },
  { id: 'opExecute', method: 'POST', path: '/execute', group: 'malo', need: 'WRITE', title: 'api.e.opExecute', body: (c) => ({ command: { operation: 'REACTIVATE', maloId: c.malo, buildingId: c.construct, effectiveDate: '2026-12-01' } }) },
  { id: 'constructs', method: 'GET', path: '/Constructs', group: 'read', need: 'READ', title: 'api.e.constructs' },
  { id: 'malos', method: 'GET', path: "/MarketLocations?$filter=businessState eq 'RUHEND'", group: 'read', need: 'READ', title: 'api.e.malos' },
  { id: 'periods', method: 'GET', path: "/LifecyclePeriods?$filter=maloId eq '{malo}'", group: 'read', need: 'READ', title: 'api.e.periods' },
  { id: 'audit', method: 'GET', path: '/AuditEvents?$orderby=eventTime desc&$top=10', group: 'read', need: 'READ', title: 'api.e.audit' },
  { id: 'calls', method: 'GET', path: '/ApiCalls?$orderby=at desc&$top=10', group: 'read', need: 'READ', title: 'api.e.calls' },
  { id: 'health', method: 'GET', path: '/health()', group: 'read', need: 'READ', title: 'api.e.health' },
  { id: 'login', method: 'POST', path: '/login', group: 'access', need: 'PUBLIC', title: 'api.e.login', body: () => ({ user: 'm.weber' }) },
  { id: 'me', method: 'GET', path: '/me()', group: 'access', need: 'READ', title: 'api.e.me' },
  { id: 'createKey', method: 'POST', path: '/createApiKey', group: 'access', need: 'MAINTAINER', title: 'api.e.createKey', body: () => ({ name: 'ERP-Test', role: 'PIPELINE' }) },
];
const GROUPS: { id: Group; key: string }[] = [{ id: 'process', key: 'api.g.process' }, { id: 'malo', key: 'api.g.malo' }, { id: 'read', key: 'api.g.read' }, { id: 'access', key: 'api.g.access' }];

/** The example flow: a brand-new construct, from registration to the relationship list. */
const RECIPE: { key: string; ep: string; path?: string; body?: object }[] = [
  { key: 'api.recipe.1', ep: 'register' },
  { key: 'api.recipe.2', ep: 'sapState', body: { attribute: 'imsys', objectId: DEMO.meloH, value: 'INSTALLED' } },
  { key: 'api.recipe.3', ep: 'sapState', body: { attribute: 'abmeldung', objectId: DEMO.household, value: 'CONFIRMED' } },
  { key: 'api.recipe.4', ep: 'vsz', path: `/Constructs/${DEMO.construct}/confirmVsz`, body: { evidence: 'DSO-DP order C1001_M001 confirmed by phone' } },
  { key: 'api.recipe.5', ep: 'relList', path: `/Constructs/${DEMO.construct}/relationshipList()` },
];

const shortPath = (p: string) => p.split('?')[0].replace('{construct}', '{id}').replace('{issue}', '{id}').replace('{malo}', '{id}').replace(/^\//, '');
const fill = (path: string, c: Ctx) => path.replace('{construct}', c.construct).replace('{issue}', c.issue).replace('{malo}', c.malo);
const pretty = (o: unknown) => JSON.stringify(o, null, 2);
const metrics = (s: Snapshot) => ({
  cases: openItems(s.cases).length,
  dormant: s.cases.filter((c) => c.kind === 'HOUSEHOLD' && c.businessState === 'RUHEND').length,
  rel: s.relationships.filter((r) => !r.validToExclusive).length,
  outbox: s.outbox.length,
  constructs: s.constructs.length,
  events: s.events.filter((e) => e.operation !== 'VALIDATE').length,
});
type Metrics = ReturnType<typeof metrics>;
const METRIC_KEYS: (keyof Metrics)[] = ['cases', 'dormant', 'rel', 'outbox', 'constructs', 'events'];

interface Sent { status: number; ms: number; text: string; before: Metrics; after: Metrics }

export function ApiPage() {
  const { t } = useI18n();
  const { data, refresh, toast, go } = useApp();
  const auth = useAuth();
  const ctx = useMemo(() => context(data), [data]);
  const [epId, setEpId] = useState('processAll');
  const ep = CATALOGUE.find((e) => e.id === epId)!;
  const [path, setPath] = useState(fill(ep.path, ctx));
  const [body, setBody] = useState(ep.body ? pretty(ep.body(ctx)) : '');
  const [bodyErr, setBodyErr] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<Sent>();
  const [done, setDone] = useState<number[]>([]);
  const [step, setStep] = useState<number>();
  // The address other systems call: RUHEND_PUBLIC_URL when set (your domain), otherwise the address this page is served from.
  const [base, setBase] = useState(location.origin);
  useEffect(() => { loadHealth().then((h) => { if (h.publicUrl) setBase(h.publicUrl); }).catch(() => undefined); }, []);

  const select = (id: string, override?: { path?: string; body?: object }, recipeStep?: number) => {
    setStep(recipeStep);
    const next = CATALOGUE.find((e) => e.id === id)!;
    setEpId(id); setPath(override?.path ?? fill(next.path, ctx));
    setBody(override?.body ? pretty(override.body) : next.body ? pretty(next.body(ctx)) : ''); setBodyErr(false); setSent(undefined);
  };
  const route = useRoute();
  useEffect(() => { if (route.endsWith('/zugang')) setTimeout(() => document.getElementById('keys')?.scrollIntoView({ behavior: 'smooth' }), 80); }, [route]);

  const copy = async (text: string) => { try { await navigator.clipboard.writeText(text); toast(t('api.copied')); } catch { toast(text); } };
  const curl = `curl -X ${ep.method} "${base}/api/v1${encodeURI(path)}"${ep.need === 'READ' || ep.need === 'PUBLIC' ? '' : ' \\\n  -H "Authorization: Bearer $TOKEN"'}${ep.method === 'POST' ? ` \\\n  -H "Content-Type: application/json" -d '${body.replace(/\s+/g, ' ')}'` : ''}`;

  const send = async () => {
    if (ep.method === 'POST') { try { JSON.parse(body || '{}'); } catch { setBodyErr(true); return; } }
    setBodyErr(false); setBusy(true);
    try {
      const before = metrics(await loadSnapshot());
      const started = performance.now();
      const headers: Record<string, string> = getToken() ? { Authorization: `Bearer ${getToken()}` } : {};
      if (ep.method === 'POST') headers['Content-Type'] = 'application/json';
      const res = await fetch(`/api/v1${encodeURI(path)}`, ep.method === 'POST' ? { method: 'POST', headers, body: body || '{}' } : { headers });
      const ms = Math.round(performance.now() - started);
      const raw = await res.text();
      let text = raw; try { text = pretty(JSON.parse(raw)); } catch { /* not JSON */ }
      const snap = await refresh() ?? await loadSnapshot();
      setSent({ status: res.status, ms, text, before, after: metrics(snap) });
      if (step !== undefined && res.ok) setDone((d) => [...new Set([...d, step])]);
    } catch (e) { toast(errorText(t, e), 'err'); }
    setBusy(false);
  };

  const changed = sent ? METRIC_KEYS.filter((k) => sent.before[k] !== sent.after[k]) : [];
  const needOk = ep.need === 'READ' || ep.need === 'PUBLIC' || ep.need === 'ANY' ? true : ep.need === 'WRITE' ? auth.write : auth.admin;

  const M: Record<string, string> = { GET: 'bg-accent text-primary', POST: 'bg-secondary text-teal-ink' };
  const Method = ({ m, small }: { m: string; small?: boolean }) => <span className={cn('rounded-md text-center font-mono font-medium', small ? 'w-[38px] py-0.5 text-[10px]' : 'px-2.5 py-0.5 text-[11.5px]', M[m])}>{m}</span>;

  return (
    <>
      <PageHeader
        title={t('api.title')} badge={<Badge variant="info">v1</Badge>}
        description={<>{t('api.sub')} <span className="font-mono text-[0.86em]">{base}/api/v1</span></>}
        actions={<>
          <Button variant="outline" onClick={() => void copy(getToken() ?? '')}><Copy />{t('api.keys.token')}</Button>
          <Button variant="outline" asChild><a href="/openapi.json" download><Download />{t('api.spec')}</a></Button>
        </>}
      />

      <div className="mb-[18px] grid grid-cols-[270px_minmax(0,1fr)] items-start gap-[18px] max-[1100px]:grid-cols-1">
        <Card className="sticky top-[72px] max-h-[calc(100vh-88px)] gap-0 overflow-auto p-2 shadow-card max-[1100px]:static max-[1100px]:max-h-none">
          <nav aria-label={t('api.nav.docs')}>
            {GROUPS.map((g) => (
              <div key={g.id} className="grid gap-0.5 border-b py-1.5 first:pt-0 last:border-0">
                <h3 className="px-2.5 pt-1.5 pb-1 text-[11.5px] font-semibold tracking-wider text-muted-foreground uppercase">{t(g.key)}</h3>
                {CATALOGUE.filter((e) => e.group === g.id).map((e) => (
                  <button key={e.id} onClick={() => select(e.id)} className={cn('grid grid-cols-[38px_minmax(0,1fr)] items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[13.5px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground', e.id === epId && step === undefined && 'bg-accent font-medium text-primary hover:bg-accent hover:text-primary')}>
                    <Method m={e.method} small /><span className="truncate font-mono text-[12.5px]" title={t(e.title)}>{shortPath(e.path)}</span>
                  </button>
                ))}
              </div>
            ))}
            <div className="grid gap-0.5 pt-1.5">
              <h3 className="px-2.5 pt-1.5 pb-1 text-[11.5px] font-semibold tracking-wider text-muted-foreground uppercase">{t('api.nav.recipes')}</h3>
              <p className="px-2.5 pb-1.5 text-[12.5px] text-muted-foreground">{t('api.recipe.d')}</p>
              {RECIPE.map((r, i) => (
                <button key={r.key} onClick={() => select(r.ep, { path: r.path, body: r.body }, i)} className={cn('grid grid-cols-[22px_minmax(0,1fr)] items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[13.5px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground', epId === r.ep && step === i && 'bg-accent font-medium text-primary hover:bg-accent')}>
                  <span className={cn('grid size-5 place-items-center rounded-full bg-muted text-[11px] font-semibold text-muted-foreground transition-colors', done.includes(i) && 'animate-pop bg-teal text-white')}>{done.includes(i) ? <Check size={11} strokeWidth={3} /> : i + 1}</span><span>{t(r.key)}</span>
                </button>
              ))}
            </div>
          </nav>
        </Card>

        <section className="grid min-w-0 gap-3.5">
          <Card key={epId} className="animate-rise gap-2 px-5 py-4 shadow-card">
            <div className="flex flex-wrap items-center gap-2.5">
              <Method m={ep.method} />
              <span className="font-mono text-sm break-all">{ep.path.replace('{construct}', '{constructId}').replace('{issue}', '{ID}')}</span>
              <Badge variant={needOk ? 'neutral' : 'wait'} className="ml-auto">{t('api.role')}: {t(`api.need.${ep.need}`)}</Badge>
            </div>
            <h2>{t(ep.title)}</h2>
            <p className="text-muted-foreground">{t(`api.d.${ep.id}`)}</p>
          </Card>

          <Card className="gap-4 p-4 shadow-card">
            <div className="grid grid-cols-2 gap-4 max-[1100px]:grid-cols-1">
              <div className="grid min-w-0 content-start gap-2.5">
                <Field label="URL"><Input className="font-mono text-[13px]" value={path} onChange={(e) => setPath(e.target.value)} spellCheck={false} /></Field>
                {ep.method === 'POST' && (
                  <Field label={`${t('api.input')} (JSON)`} error={bodyErr ? 'JSON' : undefined}>
                    <Textarea className="font-mono text-[12.5px]" aria-invalid={bodyErr} value={body} onChange={(e) => { setBody(e.target.value); setBodyErr(false); }} rows={Math.min(12, body.split('\n').length + 1)} spellCheck={false} />
                  </Field>
                )}
                <div className="flex items-center gap-2">
                  <Button onClick={() => void send()} disabled={busy}>{busy ? <Loader2 className="animate-spin" /> : <Play />}{busy ? t('api.sending') : t('api.send')}</Button>
                  <Button variant="quiet" size="sm" onClick={() => void copy(curl)}><Copy />{t('api.snippet')}</Button>
                </div>
                <pre className="max-h-[150px] overflow-auto rounded-md bg-[#0f1720] p-3 font-mono text-xs break-all whitespace-pre-wrap text-[#dbe4ee]">{curl}</pre>
              </div>
              <div className="grid min-w-0 content-start gap-2.5">
                <div className="flex min-h-6 items-center gap-2.5"><span className="text-[13px] font-medium text-muted-foreground">{t('api.response')}</span>{sent && <><Badge variant={sent.status < 300 ? 'ok' : 'err'}>{sent.status}</Badge><span className="text-[13px] text-muted-foreground">{sent.ms} ms</span></>}</div>
                <pre className="m-0 max-h-[420px] min-h-[180px] overflow-auto rounded-md bg-muted p-3 font-mono text-[12.5px] break-all whitespace-pre-wrap">{sent ? sent.text : '—'}</pre>
              </div>
            </div>
            {sent && (
              <div className="grid animate-rise gap-2.5 border-t pt-3.5" key={`${sent.status}-${sent.ms}-${sent.text.length}`}>
                <div className="flex flex-wrap items-baseline gap-3"><b>{t('api.fx.title')}</b><span className="text-[13px] text-muted-foreground">{t('api.fx.live')}</span></div>
                <div className="grid grid-cols-[repeat(auto-fit,minmax(130px,1fr))] gap-2">
                  {METRIC_KEYS.map((k) => {
                    const diff = sent.before[k] !== sent.after[k];
                    return (
                      <div key={k} className={cn('grid gap-0.5 rounded-lg bg-muted px-3 py-2.5 text-[12.5px] text-muted-foreground transition-colors', diff && 'animate-pop bg-secondary text-teal-ink')}>
                        <span>{t(`api.fx.${k}`)}</span>
                        <b className={cn('text-lg font-semibold text-foreground', diff && 'text-teal-ink')}>{sent.before[k]}{diff && <> <em className="not-italic opacity-50">→</em> {sent.after[k]}</>}</b>
                      </div>
                    );
                  })}
                </div>
                {changed.length === 0 && <p className="text-[13px] text-muted-foreground">{t('api.fx.none')}</p>}
                {changed.length > 0 && <div className="flex gap-1.5"><Button variant="quiet" size="sm" onClick={() => go('/klaerfaelle')}>{t('nav.cases')} →</Button><Button variant="quiet" size="sm" onClick={() => go('/')}>{t('nav.overview')} →</Button></div>}
              </div>
            )}
          </Card>
        </section>
      </div>

      <KeysSection />
    </>
  );
}

/** Access for other systems: create keys (secret shown once), see use, revoke. */
function KeysSection() {
  const { t, lang } = useI18n();
  const { toast } = useApp();
  const auth = useAuth();
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [name, setName] = useState('');
  const [secret, setSecret] = useState<{ name: string; token: string }>();
  const [busy, setBusy] = useState(false);
  const [nameErr, setNameErr] = useState(false);
  const load = useCallback(() => { loadApiKeys().then(setKeys).catch(() => undefined); }, []);
  useEffect(load, [load]);

  const create = async () => {
    if (!name.trim()) { setNameErr(true); return; }
    setBusy(true);
    try { const k = await createApiKey(name.trim(), 'PIPELINE'); setSecret({ name: k.name, token: k.token }); setName(''); load(); } catch (e) { toast(errorText(t, e), 'err'); }
    setBusy(false);
  };
  const revoke = async (k: ApiKey) => {
    if (!(await confirmDialog(t('api.keys.confirm', { name: k.name }), t))) return;
    try { await revokeApiKey(k.ID); load(); } catch (e) { toast(errorText(t, e), 'err'); }
  };

  return (
    <Card id="keys" className="scroll-mt-[72px] gap-3.5 px-5 py-[18px] shadow-card">
      <div className="flex items-start gap-3 text-muted-foreground"><KeyRound size={18} className="mt-0.5" /><div><h2 className="text-foreground">{t('api.keys.title')}</h2><p className="text-[13px]">{t('api.keys.sub')}</p></div></div>
      {!auth.admin && <Banner tone="wait" className="mb-0">{t('api.keys.denied')}</Banner>}
      <Gate>
        <div className="grid grid-cols-[minmax(180px,1fr)_auto] items-end gap-3 max-[1100px]:grid-cols-1">
          <Field label={t('api.keys.name')} error={nameErr ? t('common.reason.required') : undefined}>
            <Input value={name} aria-invalid={nameErr} onChange={(e) => { setName(e.target.value); setNameErr(false); }} placeholder="ERP-Test" onKeyDown={(e) => e.key === 'Enter' && void create()} />
          </Field>
          <Button disabled={busy} onClick={() => void create()}>{busy ? <Loader2 className="animate-spin" /> : <KeyRound />}{t('api.keys.create')}</Button>
        </div>
      </Gate>
      {secret && (
        <div role="status" className="grid animate-rise grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1.5 rounded-lg border border-[#a8e5e3] bg-secondary px-3.5 py-3">
          <div><b>{secret.name}</b><span className="text-[13px] text-muted-foreground"> · {t('api.keys.once')}</span></div>
          <Button size="sm" variant="outline" className="row-span-2 col-start-2 row-start-1" onClick={() => { void navigator.clipboard.writeText(secret.token).then(() => toast(t('api.copied'))); }}><Copy />{t('api.copy')}</Button>
          <code className="font-mono text-[13px] break-all">{secret.token}</code>
        </div>
      )}
      <ul className="m-0 grid list-none p-0">
        {keys.length === 0 && <li className="py-3 text-center text-muted-foreground">{t('api.keys.empty')}</li>}
        {keys.map((k) => (
          <li key={k.ID} className={cn('flex items-center justify-between gap-3 border-t py-2.5 text-sm', k.revokedAt && 'opacity-55')}>
            <div><b className="font-semibold">{k.name}</b> <Badge variant="secondary" className="ml-1">{t(`role.${k.role}`)}</Badge> {k.revokedAt && <Badge variant="neutral">{t('api.keys.revoked')}</Badge>}
              <small className="block text-[12.5px] text-muted-foreground"><span className="font-mono">{k.prefix}…</span> · {k.lastUsedAt ? t('api.keys.used', { when: relTime(lang, k.lastUsedAt) }) : t('api.keys.never')} · {k.createdBy}</small></div>
            {!k.revokedAt && auth.admin && <Button variant="danger-quiet" size="sm" onClick={() => void revoke(k)}><Trash2 />{t('api.keys.revoke')}</Button>}
          </li>
        ))}
      </ul>
    </Card>
  );
}
