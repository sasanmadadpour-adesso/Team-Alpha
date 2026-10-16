import { useState } from 'react';
import { ChevronDown, Download } from 'lucide-react';
import { useI18n } from '../i18n';
import { confirmDialog } from '../confirm';

interface Endpoint { method: 'GET' | 'POST'; path: string; title: string; body?: object; note?: string; safe: boolean }

const GROUPS: { name: string; endpoints: Endpoint[] }[] = [
  {
    name: 'api.g.process',
    endpoints: [
      { method: 'POST', path: '/registerConstruct', title: 'api.e.register', safe: false, body: { construct: { buildingId: 'B-NEW-01', city: 'Essen', stichtag: '2026-11-01', participants: [
        { role: 'Marktlokation Reststrom', maloId: '50000000001', meloId: 'DE0000000000000000000000000000009' },
        { role: 'Haushaltsverbrauch', maloId: '50000000010', meloId: 'DE0000000000000000000000000000001', participates: true }] } } },
      { method: 'GET', path: '/cases()', title: 'api.e.cases', safe: true },
      { method: 'POST', path: '/processAll', title: 'api.e.processAll', body: {}, safe: false },
      { method: 'POST', path: '/Constructs/B-MUL-01/process', title: 'api.e.process', body: {}, safe: false },
      { method: 'POST', path: '/Constructs/B-MUL-01/previewSwitch', title: 'api.e.preview', body: {}, safe: true },
      { method: 'POST', path: '/updateSapState', title: 'api.e.sapState', body: { attribute: 'abmeldung', objectId: '50539603876', value: 'CONFIRMED', actor: 'MAKO_GATEWAY' }, safe: false, note: 'attribute: imsys (MeLo) · abmeldung (MaLo) · mcm (Einspeise-MaLo)' },
      { method: 'POST', path: '/Issues/{ID}/resolve', title: 'api.e.resolve', body: { resolution: 'CHOOSE_BUILDING', value: 'B-CGN-01', reason: 'Tenant lives in Köln' }, safe: false, note: 'resolution: CHOOSE_BUILDING · EXCLUDE_PARTICIPANT · FIX_VALUE · CONFIRM_ASSUMPTION' },
      { method: 'POST', path: '/Constructs/B-MUL-01/confirmVsz', title: 'api.e.vsz', body: { evidence: 'Checked in the SAP test system' }, safe: false },
      { method: 'GET', path: '/Constructs/B-MUL-01/relationshipList()', title: 'api.e.relList', safe: true },
      { method: 'GET', path: '/Outbox', title: 'api.e.outbox', safe: true },
    ],
  },
  {
    name: 'api.g.malo',
    endpoints: [
      { method: 'POST', path: '/preview', title: 'api.e.opPreview', body: { command: { operation: 'REACTIVATE', maloId: '50539603921', buildingId: 'B-MUL-01', effectiveDate: '2026-12-01' } }, safe: true },
      { method: 'POST', path: '/execute', title: 'api.e.opExecute', body: { command: { operation: 'REACTIVATE', maloId: '50539603921', buildingId: 'B-MUL-01', effectiveDate: '2026-12-01' } }, safe: false, note: 'SET_DORMANT · REACTIVATE · REMOVE_FROM_CONSTRUCT · CORRECT_TRANSITION · REVERSE_TRANSITION' },
    ],
  },
  {
    name: 'api.g.read',
    endpoints: [
      { method: 'GET', path: '/Constructs', title: 'api.e.constructs', safe: true },
      { method: 'GET', path: "/MarketLocations?$filter=businessState eq 'RUHEND'", title: 'api.e.malos', safe: true },
      { method: 'GET', path: "/LifecyclePeriods?$filter=maloId eq '50539603921'", title: 'api.e.periods', safe: true },
      { method: 'GET', path: '/AuditEvents?$orderby=eventTime desc&$top=10', title: 'api.e.audit', safe: true },
      { method: 'GET', path: '/health()', title: 'api.e.health', safe: true },
    ],
  },
];

export function ApiPage() {
  const { t } = useI18n();
  return (
    <>
      <div className="page-head">
        <div>
          <h1>{t('api.title')} <span className="chip info" style={{ verticalAlign: 'middle' }}>v1</span></h1>
          <p>{t('api.sub')} <span className="mono">http://localhost:4004/api/v1</span></p>
        </div>
        <a className="btn secondary" href="/openapi.json" download><Download size={15} />{t('api.spec')}</a>
      </div>
      {GROUPS.map((g) => (
        <section key={g.name} className="card api-group">
          <h2>{t(g.name)}</h2>
          {g.endpoints.map((e) => <EndpointRow key={e.path + e.method} endpoint={e} />)}
        </section>
      ))}
    </>
  );
}

function EndpointRow({ endpoint }: { endpoint: Endpoint }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState(endpoint.body ? JSON.stringify(endpoint.body, null, 2) : '');
  const [response, setResponse] = useState<string>();
  const [status, setStatus] = useState<number>();
  const [busy, setBusy] = useState(false);

  const send = async () => {
    if (!endpoint.safe && !(await confirmDialog(`${endpoint.method} ${endpoint.path}\n\n${t('confirm.life.d')}`, t))) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/v1${endpoint.path}`, endpoint.method === 'POST' ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body } : undefined);
      setStatus(res.status);
      const text = await res.text();
      try { setResponse(JSON.stringify(JSON.parse(text), null, 2)); } catch { setResponse(text); }
    } catch (e) { setStatus(0); setResponse(String(e)); }
    setBusy(false);
  };
  const curl = `curl -X ${endpoint.method} "http://localhost:4004/api/v1${endpoint.path.replaceAll(' ', '%20')}"${endpoint.method === 'POST' ? ` \\\n  -H "Content-Type: application/json" -d '${JSON.stringify(endpoint.body)}'` : ''}`;

  return (
    <div className="endpoint">
      <button className="ep-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className={`method ${endpoint.method}`}>{endpoint.method}</span>
        <span><span className="mono">{endpoint.path}</span><span className="subtle" style={{ display: 'block' }}>{t(endpoint.title)}</span></span>
        <ChevronDown size={18} className={`chev ${open ? 'open' : ''}`} />
      </button>
      {open && (
        <div className="ep-body">
          {endpoint.note && <p className="subtle">{endpoint.note}</p>}
          {endpoint.method === 'POST' && <textarea className="code" value={body} onChange={(e) => setBody(e.target.value)} rows={Math.min(12, body.split('\n').length + 1)} spellCheck={false} />}
          <pre className="code">{curl}</pre>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button className="btn sm primary" onClick={send} disabled={busy}>{busy ? <span className="spin" /> : null}{t('api.try')}</button>
            {status !== undefined && <span className={`chip ${status && status < 300 ? 'ok' : 'err'}`}>{status}</span>}
          </div>
          {response && <pre className="resp">{response}</pre>}
        </div>
      )}
    </div>
  );
}
