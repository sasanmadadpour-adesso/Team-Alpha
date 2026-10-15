import { confirmDialog } from '../confirm';
import { useState } from 'react';

interface Endpoint { method: 'GET' | 'POST'; path: string; title: string; body?: object; note?: string; safe: boolean }

const GROUPS: { name: string; hint: string; endpoints: Endpoint[] }[] = [
  {
    name: 'Process (solution map)', hint: 'Anmeldung → Prüfung → Korrektur → vSZ → Umstellung → Übergabe',
    endpoints: [
      { method: 'POST', path: '/registerConstruct', title: 'S1 Anmeldung Konstrukt (JSON)', safe: false, body: { construct: { buildingId: 'B-NEW-01', city: 'Essen', stichtag: '2026-11-01', participants: [
        { role: 'Marktlokation Reststrom', maloId: '50000000001', meloId: 'DE0000000000000000000000000000009' },
        { role: 'Haushaltsverbrauch', maloId: '50000000010', meloId: 'DE0000000000000000000000000000001', participates: true } ] } } },
      { method: 'POST', path: '/Constructs/B-MUL-01/validate', title: 'S2 Prüfung der Daten → findings', body: {}, safe: true },
      { method: 'GET', path: "/Issues?$filter=status eq 'OPEN'", title: 'S3 Korrektur worklist', safe: true },
      { method: 'POST', path: '/Issues/{ID}/resolve', title: 'S3 Resolve a finding (reason required)', body: { resolution: 'CHOOSE_BUILDING', value: 'B-CGN-01', reason: 'Tenant lives in Köln' }, safe: false, note: 'Replace {ID} with an issue ID. resolution: CHOOSE_BUILDING · EXCLUDE_PARTICIPANT · FIX_VALUE · CONFIRM_ASSUMPTION.' },
      { method: 'POST', path: '/updateSapState', title: 'Status input from SAP / MaKo / MSB (simulated)', body: { attribute: 'abmeldung', objectId: '50539603876', value: 'CONFIRMED', actor: 'MAKO_GATEWAY' }, safe: false, note: 'attribute: imsys (objectId = MeLo) · abmeldung (MaLo) · mcm (Einspeise-MaLo). Re-checks immediately; the next run picks it up.' },
      { method: 'POST', path: '/Constructs/B-MUL-01/confirmVsz', title: 'S5 Confirm Aufbau vSZ checklist with evidence', body: { evidence: 'Checked in SAP by A. Muster' }, safe: false },
      { method: 'POST', path: '/Constructs/B-MUL-01/previewSwitch', title: 'S6 Change plan: MeMa/MaMa + RUHEND — never writes', body: {}, safe: true },
      { method: 'POST', path: '/Constructs/B-MUL-01/process', title: 'Automatic pipeline for one construct', body: {}, safe: false },
      { method: 'POST', path: '/processAll', title: 'Automatic pipeline for all constructs', body: {}, safe: false },
      { method: 'GET', path: '/Constructs/B-MUL-01/relationshipList()', title: 'S7 §5 relationship list for Abrechnung', safe: true },
      { method: 'GET', path: '/Outbox', title: 'S7 Handover events (UTILMD, INVOIC, EDM) — not sent', safe: true },
    ],
  },
  {
    name: 'Manual MaLo operations', hint: 'Same engine; lifecycle after the Umstellung',
    endpoints: [
      { method: 'POST', path: '/preview', title: 'Check one operation — never writes', body: { command: { operation: 'SET_DORMANT', maloId: '50539603921', buildingId: 'B-MUL-01' } }, safe: true },
      { method: 'POST', path: '/execute', title: 'Execute one operation (repeat-safe)', body: { command: { operation: 'REACTIVATE', maloId: '50539603921', buildingId: 'B-MUL-01', effectiveDate: '2026-12-01' } }, safe: false, note: 'operation: SET_DORMANT · REACTIVATE · REMOVE_FROM_CONSTRUCT · CORRECT_TRANSITION · REVERSE_TRANSITION (reason + referenceOperationId for the last two).' },
    ],
  },
  {
    name: 'Read', hint: 'OData query options: $filter, $select, $orderby, $top',
    endpoints: [
      { method: 'GET', path: '/Constructs', title: 'Constructs with stage and counters', safe: true },
      { method: 'GET', path: "/Participants?$filter=constructId eq 'B-MUL-01'", title: 'Normalized workbook rows', safe: true },
      { method: 'GET', path: "/MarketLocations?$filter=businessState eq 'RUHEND'", title: 'Market locations and state', safe: true },
      { method: 'GET', path: "/LifecyclePeriods?$filter=maloId eq '50539603921'", title: 'Zeitscheiben [validFrom, validToExclusive)', safe: true },
      { method: 'GET', path: '/AuditEvents?$orderby=eventTime desc&$top=10', title: 'Append-only audit log', safe: true },
    ],
  },
  {
    name: 'System', hint: '',
    endpoints: [
      { method: 'GET', path: '/health()', title: 'Health and connection mode', safe: true },
      { method: 'POST', path: '/runSelfCheck', title: 'Business scenarios on isolated fixtures', body: {}, safe: true },
      { method: 'POST', path: '/resetDemo', title: 'Restore workbook baseline (demo only)', body: { confirm: true }, safe: false },
    ],
  },
];

export function ApiPage() {
  return (
    <>
      <section className="hero api-hero">
        <div>
          <h1>Process API <span className="ver">v1</span></h1>
          <p>REST + JSON for other services, one endpoint per box of the solution map. The UI uses exactly this API. Item statuses: <code>READY</code> <code>SUCCESS</code> <code>SKIPPED</code> <code>ALREADY_DONE</code> <code>BLOCKED</code> <code>REVIEW</code> <code>ERROR</code>.</p>
        </div>
        <div className="controls">
          <a className="secondary" href="/openapi.json" download>OpenAPI spec</a>
        </div>
        <div className="kv">
          <div><span>Base URL</span><code>http://localhost:4004/api/v1</code></div>
          <div><span>Also available</span><code>/odata/v4/malo</code> (OData V4)</div>
          <div><span>Idempotency</span>same MaLo + construct + Stichtag is done once; repeats return ALREADY_DONE</div>
          <div><span>Errors</span>400 invalid input · 404 unknown · 409 state conflict · 422 rule violation</div>
          <div><span>SAP</span><code>NOT_CONFIGURED</code> — results are simulated</div>
        </div>
      </section>
      {GROUPS.map((g) => (
        <section key={g.name} className="panel api-group">
          <h3>{g.name} {g.hint && <span className="muted">· {g.hint}</span>}</h3>
          {g.endpoints.map((e) => <EndpointRow key={e.path} endpoint={e} />)}
        </section>
      ))}
    </>
  );
}

function EndpointRow({ endpoint }: { endpoint: Endpoint }) {
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState(endpoint.body ? JSON.stringify(endpoint.body, null, 2) : '');
  const [response, setResponse] = useState<string>();
  const [status, setStatus] = useState<number>();

  const send = async () => {
    if (!endpoint.safe && !(await confirmDialog(`${endpoint.method} ${endpoint.path}\n\nThis changes simulated data. Continue?`))) return;
    try {
      const res = await fetch(`/api/v1${endpoint.path}`, endpoint.method === 'POST' ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body } : undefined);
      setStatus(res.status);
      const text = await res.text();
      try { setResponse(JSON.stringify(JSON.parse(text), null, 2)); } catch { setResponse(text); }
    } catch (e) { setStatus(0); setResponse(String(e)); }
  };
  const curl = `curl -X ${endpoint.method} "http://localhost:4004/api/v1${endpoint.path.replaceAll(' ', '%20')}"${endpoint.method === 'POST' ? ` \\\n  -H "Content-Type: application/json" -d '${JSON.stringify(endpoint.body)}'` : ''}`;

  return (
    <div className={`endpoint ${open ? 'open' : ''}`}>
      <button className="ep-head" onClick={() => setOpen(!open)}>
        <span className={`method ${endpoint.method}`}>{endpoint.method}</span>
        <code>{endpoint.path}</code>
        <span className="muted">{endpoint.title}</span>
      </button>
      {open && (
        <div className="ep-body">
          {endpoint.note && <p className="muted">{endpoint.note}</p>}
          {endpoint.method === 'POST' && <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={Math.min(12, body.split('\n').length + 1)} spellCheck={false} />}
          <pre className="curl">{curl}</pre>
          <div className="buttons"><button className="dark" onClick={send}>Try it</button>{status !== undefined && <span className={`code-status ${status < 300 ? 'ok' : 'bad'}`}>{status}</span>}</div>
          {response && <pre className="response">{response}</pre>}
        </div>
      )}
    </div>
  );
}
