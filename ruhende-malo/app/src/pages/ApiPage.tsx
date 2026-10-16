import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Copy, Download, KeyRound, Play, Trash2 } from 'lucide-react';
import { type ApiKey, type Snapshot, createApiKey, loadApiKeys, loadSnapshot, revokeApiKey } from '../api';
import { useAuth } from '../auth';
import { confirmDialog } from '../confirm';
import { relTime, useI18n } from '../i18n';
import { getToken } from '../session';
import { errorText, openItems, useApp } from '../ui';

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

  const select = (id: string, override?: { path?: string; body?: object }, recipeStep?: number) => {
    setStep(recipeStep);
    const next = CATALOGUE.find((e) => e.id === id)!;
    setEpId(id); setPath(override?.path ?? fill(next.path, ctx));
    setBody(override?.body ? pretty(override.body) : next.body ? pretty(next.body(ctx)) : ''); setBodyErr(false); setSent(undefined);
  };
  useEffect(() => { if (location.hash.endsWith('#keys')) setTimeout(() => document.getElementById('keys')?.scrollIntoView({ behavior: 'smooth' }), 80); }, []);

  const copy = async (text: string) => { try { await navigator.clipboard.writeText(text); toast(t('api.copied')); } catch { toast(text); } };
  const curl = `curl -X ${ep.method} "http://localhost:4004/api/v1${encodeURI(path)}"${ep.need === 'READ' || ep.need === 'PUBLIC' ? '' : ' \\\n  -H "Authorization: Bearer $TOKEN"'}${ep.method === 'POST' ? ` \\\n  -H "Content-Type: application/json" -d '${body.replace(/\s+/g, ' ')}'` : ''}`;

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

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{t('api.title')} <span className="chip info" style={{ verticalAlign: 'middle' }}>v1</span></h1>
          <p>{t('api.sub')} <span className="mono">http://localhost:4004/api/v1</span></p>
        </div>
        <div className="head-actions">
          <button className="btn secondary" onClick={() => void copy(getToken() ?? '')}><Copy size={15} />{t('api.keys.token')}</button>
          <a className="btn secondary" href="/openapi.json" download><Download size={15} />{t('api.spec')}</a>
        </div>
      </div>

      <div className="api-shell">
        <nav className="api-side card" aria-label={t('api.nav.docs')}>
          {GROUPS.map((g) => (
            <div key={g.id} className="api-group-nav">
              <h3>{t(g.key)}</h3>
              {CATALOGUE.filter((e) => e.group === g.id).map((e) => (
                <button key={e.id} className={`api-link ${e.id === epId && step === undefined ? 'on' : ''}`} onClick={() => select(e.id)}>
                  <span className={`method ${e.method}`}>{e.method}</span><span className="mono api-name" title={t(e.title)}>{shortPath(e.path)}</span>
                </button>
              ))}
            </div>
          ))}
          <div className="api-group-nav recipe">
            <h3>{t('api.nav.recipes')}</h3>
            <p className="subtle">{t('api.recipe.d')}</p>
            {RECIPE.map((r, i) => (
              <button key={r.key} className={`api-link step ${epId === r.ep && step === i ? 'on' : ''}`} onClick={() => select(r.ep, { path: r.path, body: r.body }, i)}>
                <span className={`stepno ${done.includes(i) ? 'done' : ''}`}>{done.includes(i) ? <Check size={11} strokeWidth={3} /> : i + 1}</span><span>{t(r.key)}</span>
              </button>
            ))}
          </div>
        </nav>

        <section className="api-main">
          <div className="card api-doc" key={epId}>
            <div className="api-doc-head">
              <span className={`method ${ep.method}`}>{ep.method}</span>
              <span className="mono api-path">{ep.path.replace('{construct}', '{constructId}').replace('{issue}', '{ID}')}</span>
              <span className={`chip ${needOk ? 'neutral' : 'wait'}`}>{t('api.role')}: {t(`api.need.${ep.need}`)}</span>
            </div>
            <h2>{t(ep.title)}</h2>
            <p className="muted">{t(`api.d.${ep.id}`)}</p>
          </div>

          <div className="card api-play">
            <div className="play-grid">
              <div className="play-col">
                <label className="field">URL
                  <input className="mono" value={path} onChange={(e) => setPath(e.target.value)} spellCheck={false} />
                </label>
                {ep.method === 'POST' && (
                  <label className={`field ${bodyErr ? 'invalid' : ''}`}>{t('api.input')} (JSON)
                    <textarea className="code" value={body} onChange={(e) => { setBody(e.target.value); setBodyErr(false); }} rows={Math.min(12, body.split('\n').length + 1)} spellCheck={false} />
                  </label>
                )}
                <div className="play-actions">
                  <button className="btn primary" onClick={() => void send()} disabled={busy}>
                    {busy ? <span className="spin" /> : <Play size={15} />}{busy ? t('api.sending') : t('api.send')}
                  </button>
                  <button className="btn ghost sm" onClick={() => void copy(curl)}><Copy size={14} />{t('api.snippet')}</button>
                </div>
                <pre className="code snippet">{curl}</pre>
              </div>
              <div className="play-col">
                <div className="resp-head"><span className="lbl">{t('api.response')}</span>{sent && <><span className={`chip ${sent.status < 300 ? 'ok' : 'err'}`}>{sent.status}</span><span className="subtle">{sent.ms} ms</span></>}</div>
                <pre className="resp">{sent ? sent.text : '—'}</pre>
              </div>
            </div>
            {sent && (
              <div className="effect" key={`${sent.status}-${sent.ms}-${sent.text.length}`}>
                <div className="effect-head"><b>{t('api.fx.title')}</b><span className="subtle">{t('api.fx.live')}</span></div>
                <div className="effect-grid">
                  {METRIC_KEYS.map((k) => (
                    <div key={k} className={`fx ${sent.before[k] !== sent.after[k] ? 'changed' : ''}`}>
                      <span>{t(`api.fx.${k}`)}</span>
                      <b>{sent.before[k]}{sent.before[k] !== sent.after[k] && <> <em>→</em> {sent.after[k]}</>}</b>
                    </div>
                  ))}
                </div>
                {changed.length === 0 && <p className="subtle">{t('api.fx.none')}</p>}
                {changed.length > 0 && <div className="effect-links"><button className="btn ghost sm" onClick={() => go('/klaerfaelle')}>{t('nav.cases')} →</button><button className="btn ghost sm" onClick={() => go('/')}>{t('nav.overview')} →</button></div>}
              </div>
            )}
          </div>
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
    <section id="keys" className="card api-keys">
      <div className="keys-head"><KeyRound size={18} /><div><h2>{t('api.keys.title')}</h2><p className="subtle">{t('api.keys.sub')}</p></div></div>
      {!auth.admin && <p className="banner wait">{t('api.keys.denied')}</p>}
      <fieldset className="ro keys-form" disabled={!auth.admin}>
        <label className={`field ${nameErr ? 'invalid' : ''}`}>{t('api.keys.name')}
          <input value={name} onChange={(e) => { setName(e.target.value); setNameErr(false); }} placeholder="ERP-Test" onKeyDown={(e) => e.key === 'Enter' && void create()} />
        </label>
        <button className="btn primary" disabled={busy} onClick={() => void create()}>{busy ? <span className="spin" /> : <KeyRound size={15} />}{t('api.keys.create')}</button>
      </fieldset>
      {secret && (
        <div className="secret" role="status">
          <div><b>{secret.name}</b><span className="subtle"> · {t('api.keys.once')}</span></div>
          <code>{secret.token}</code>
          <button className="btn secondary sm" onClick={() => { void navigator.clipboard.writeText(secret.token).then(() => toast(t('api.copied'))); }}><Copy size={14} />{t('api.copy')}</button>
        </div>
      )}
      <ul className="key-list">
        {keys.length === 0 && <li className="empty">{t('api.keys.empty')}</li>}
        {keys.map((k) => (
          <li key={k.ID} className={k.revokedAt ? 'revoked' : ''}>
            <div><b>{k.name}</b> <span className={`role-tag ${k.role}`}>{t(`role.${k.role}`)}</span> {k.revokedAt && <span className="chip neutral">{t('api.keys.revoked')}</span>}
              <small><span className="mono">{k.prefix}…</span> · {k.lastUsedAt ? t('api.keys.used', { when: relTime(lang, k.lastUsedAt) }) : t('api.keys.never')} · {k.createdBy}</small></div>
            {!k.revokedAt && auth.admin && <button className="btn danger-quiet sm" onClick={() => void revoke(k)}><Trash2 size={14} />{t('api.keys.revoke')}</button>}
          </li>
        ))}
      </ul>
    </section>
  );
}
