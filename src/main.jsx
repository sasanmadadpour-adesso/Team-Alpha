import React, { useState, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import Globe from './Globe.jsx';

const initialRecords = [
  { id: 'B-FRA-01', ownerUsername: 'frankfurt_VNB', city: 'Frankfurt am Main', producer: 'Jan Koller', type: 'Solar', participants: 5, status: 'Aktiv', contractStart: '2026-10-01', contractEnd: '2027-10-01', date: '15.10.2026', lat: 50.11, lon: 8.68 },
  { id: 'B-CGN-01', ownerUsername: 'köln_VNB', city: 'Köln', producer: 'Roman Weidenfeller', type: 'Solar', participants: 4, status: 'Aktiv', contractStart: '2026-09-14', contractEnd: '2027-12-20', date: '14.10.2026', lat: 50.94, lon: 6.96 },
  { id: 'B-MUL-01', ownerUsername: 'mülheim_VNB', city: 'Mülheim an der Ruhr', producer: 'Jan Koller', type: 'Solar', participants: 8, status: 'Aktiv', contractStart: '2026-08-01', contractEnd: '2027-11-05', date: '12.10.2026', lat: 51.43, lon: 6.88 },
  { id: 'B-MUC-01', ownerUsername: 'münchen_VNB', city: 'München', producer: 'Netzgebiet München', type: 'Solar', participants: 7, status: 'Aktiv', contractStart: '2026-02-08', contractEnd: '2028-02-08', date: '08.10.2026', lat: 48.14, lon: 11.58 }
];

const vnbUsers = [
  { username: 'frankfurt_VNB', password: '123', city: 'Frankfurt am Main', displayName: 'Frankfurt am Main VNB' },
  { username: 'köln_VNB', password: '123', city: 'Köln', displayName: 'Köln VNB' },
  { username: 'mülheim_VNB', password: '123', city: 'Mülheim an der Ruhr', displayName: 'Mülheim an der Ruhr VNB' }
];

const today = '2026-10-15';
const contractState = (record) => record.contractEnd < today ? 'Beendet' : (record.contractEnd <= '2026-11-15' ? 'Endet bald' : 'Aktiv');
const formatDate = value => value ? new Date(`${value}T00:00:00`).toLocaleDateString('de-DE') : '—';
const apiBase = import.meta.env.VITE_API_BASE_URL || '';
const splitAddress = value => {
  const match = value.trim().match(/^(.+?)\s+(\d+[a-zA-Z]?(?:[-/]\d+[a-zA-Z]?)?)$/);
  return match ? { street: match[1], houseNumber: match[2] } : { street: value.trim(), houseNumber: '1' };
};
const toVerificationPayload = (form, constructType) => {
  const address = splitAddress(form.street);
  const isBuilding = constructType === 'building';
  const hasUnits = constructType !== 'household';
  const firstUnit = form.units?.find(unit => unit.kind !== 'generator' && unit.melo);
  const verificationMelo = isBuilding
    ? (firstUnit?.melo || form.melo)
    : (form.units?.find(unit => unit.kind === 'generator' && unit.generator_melo)?.generator_melo || firstUnit?.melo || form.melo);
  const verificationMalo = isBuilding
    ? form.malo
    : (form.units?.find(unit => unit.kind === 'generator' && unit.generator_malo)?.generator_malo || form.malo);
  return {
    first_name: form.first.trim(), last_name: form.last.trim(), email: form.email.trim(), is_business: true, is_reverse_charge: false,
    deliv_address_street: address.street, deliv_address_house_number: address.houseNumber, deliv_address_zipcode: form.postalCode.trim(), deliv_address_city: form.city.trim(),
    subscription_reason: isBuilding ? 'E02' : 'E01', construct_type: isBuilding ? 'BUILDING' : 'FEED_IN',
    production_type: isBuilding ? 'Keine' : form.type, plant_capacity_kw: isBuilding ? 0 : form.type === 'Keine' ? 0 : Number(form.capacity), plant_specifics: { latitude: form.lat, longitude: form.lon },
    market_location_identifier: verificationMelo?.trim() || null, market_location_malo: verificationMalo?.trim() || form.malo.trim(), building_market_location_malo: hasUnits ? form.malo.trim() : null, units: hasUnits ? form.units : undefined, preferred_delivery_start: `${form.contractStart}T00:00:00Z`, contract_start_utc: `${form.contractStart}T00:00:00Z`, contract_end_utc: `${form.contractEnd}T00:00:00Z`, building_id: form.id || `B-${form.city.slice(0, 3).toUpperCase()}-NEW`
  };
};
async function verifyWithBackend(form, constructType) {
  let response;
  try {
    response = await fetch(`${apiBase}/api/onboarding/verify`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(toVerificationPayload(form, constructType)) });
  } catch {
    throw new Error('Die Validierungs-API ist nicht erreichbar. Bitte starten Sie das Backend und versuchen Sie es erneut.');
  }

  const responseText = await response.text();
  let result = null;
  if (responseText.trim()) {
    try { result = JSON.parse(responseText); } catch { throw new Error(`Die Validierungs-API hat eine ungültige Antwort zurückgegeben (HTTP ${response.status}).`); }
  }
  if (!result) throw new Error(`Die Validierungs-API hat keine Antwort zurückgegeben (HTTP ${response.status}).`);
  if (!response.ok && !result?.status) throw new Error(result?.message || `Die Validierungs-API meldet HTTP ${response.status}.`);
  return result.status === 'MANUAL_REVIEW'
    ? { ...result, status: 'NOT_VERIFIABLE', onboarding_action: 'REQUEST_CLARIFICATION', message: 'Die Anwendung wurde ohne SAP-Bestätigung übermittelt.' }
    : result;
}

const participants = [
  { role: 'Solar Plant', city: 'Frankfurt am Main', id: 'DE0073325707820000000000000088943', malo: '51781123293', status: 'Ja' },
  { role: 'Solar Plant', city: 'Mülheim an der Ruhr', id: 'DE0073325707820000000000000089012', malo: '51781124001', status: 'Ja' },
  { role: 'Household Consumption', city: 'Frankfurt am Main', id: 'DE0001815707800000101300000139372', malo: '50539603888', status: 'Ja' },
  { role: 'Household Consumption', city: 'Frankfurt am Main', id: 'DE0001815707800000101300000131094', malo: '50539603532', status: 'Ja' },
  { role: 'Residual Supply Market Location', city: 'Köln', id: 'DE0073325707820000000000000088991', malo: '51781215544', status: 'Ja' }
];

function Login({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [registering, setRegistering] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [city, setCity] = useState('');

  const submit = event => {
    event.preventDefault();
    const registeredUsers = JSON.parse(localStorage.getItem('vnb-registered-users') || '[]');
    const user = [...vnbUsers, ...registeredUsers].find(candidate => candidate.username === username && candidate.password === password);
    if (!user) {
      setError('Benutzername oder Passwort ist nicht korrekt.');
      return;
    }
    setError('');
    onLogin(user);
  };

  const register = event => {
    event.preventDefault();
    const cleanUsername = username.trim();
    const cleanCity = city.trim();
    const cleanName = displayName.trim();
    if (!cleanName || !cleanUsername || !password || !cleanCity) { setError('Name, Benutzername, Passwort und Netzgebiet sind Pflichtfelder.'); return; }
    const registeredUsers = JSON.parse(localStorage.getItem('vnb-registered-users') || '[]');
    if ([...vnbUsers, ...registeredUsers].some(candidate => candidate.username === cleanUsername)) { setError('Dieser Benutzername ist bereits vergeben.'); return; }
    const user = { username: cleanUsername, password, city: cleanCity, displayName: cleanName };
    localStorage.setItem('vnb-registered-users', JSON.stringify([...registeredUsers, user]));
    onLogin(user);
  };
  return <main className="login-page">
    <section className="login-card">
      <div className="login-brand"><SAPLogo/><div><strong>SAP</strong><span>Konstruktportal</span></div></div>
      <div className="eyebrow">GESCHÜTZTER BEREICH</div>
      <h1>{registering ? 'Benutzer registrieren' : 'Anmelden'}</h1>
      <p className="login-intro">{registering ? 'Erstellen Sie einen lokalen Zugang für Ihr Netzgebiet.' : 'Melden Sie sich mit Ihrem VNB-Zugang an, um die Konstrukte Ihres Netzgebiets zu sehen.'}</p>
      <form onSubmit={registering ? register : submit} className="login-form">
         {registering && <><label className="field"><span>Name<i>*</i></span><input autoFocus value={displayName} onChange={event => setDisplayName(event.target.value)} placeholder="z. B. Anna Schmidt" autoComplete="name"/></label><label className="field"><span>Netzgebiet / Stadt<i>*</i></span><input value={city} onChange={event => setCity(event.target.value)} placeholder="z. B. Frankfurt am Main"/></label></>}
        <label className="field"><span>Benutzername<i>*</i></span><input autoFocus={!registering} value={username} onChange={event => setUsername(event.target.value)} placeholder="z. B. frankfurt_VNB" autoComplete="username"/></label>
        <label className="field"><span>Passwort<i>*</i></span><input type="password" value={password} onChange={event => setPassword(event.target.value)} placeholder="Passwort eingeben" autoComplete={registering ? 'new-password' : 'current-password'}/></label>
        {error && <div className="login-error"><Icon name="alert"/>{error}</div>}
        <button className="primary login-submit" type="submit">{registering ? 'Registrieren' : 'Anmelden'} <Icon name="arrow"/></button>
      </form>
         <small className="login-hint">Testzugänge: frankfurt_VNB · köln_VNB · mülheim_VNB (Passwort: 123)</small>
        <button className="login-switch" onClick={() => { setRegistering(!registering); setError(''); }}>{registering ? 'Bereits registriert? Anmelden' : 'Neuen Benutzer registrieren'}</button>
    </section>
  </main>;
}

function Icon({ name }) {
  const icons = { grid: '▦', home: '⌂', plus: '+', users: '♙', chart: '◒', upload: '↥', settings: '⚙', search: '⌕', bell: '◔', arrow: '→', check: '✓', alert: '!', sun: '☀', wind: '♨' };
  return <span className={'icon icon-' + name}>{icons[name] || '•'}</span>;
}

function SAPLogo() { return <div className="sap-logo" aria-label="SAP"><span>SAP</span></div> }

function Sidebar({ page, setPage, currentUser, onLogout }) {
  const nav = [['overview', 'Übersicht', 'grid'], ['history', 'Historie', 'chart'], ['new', 'Anmeldung Konstrukt', 'plus'], ['participants', 'MK7 Teilnehmer', 'users']];
  return <aside className="sidebar">
    <div className="brand"><SAPLogo/><div><strong>SAP</strong><span>Konstruktportal</span></div></div>
    <div className="side-label">ARBEITSBEREICH</div>
    <nav>{nav.map(([key, label, icon]) => <button key={key} className={page === key ? 'active' : ''} onClick={() => setPage(key)}><Icon name={icon}/><span>{label}</span>{key === 'new' && <em>MVP</em>}</button>)}</nav>
    <div className="sidebar-bottom"><button><Icon name="upload"/>Importe</button><button onClick={() => setPage('admin')}><Icon name="settings"/>Administration</button></div>
    <a className="help-card" href="https://www.sap.com/swiss/services-support" target="_blank" rel="noreferrer"><div className="help-icon">?</div><div><b>Brauchen Sie Hilfe?</b><span>Zum SAP Support</span></div><span className="help-arrow">↗</span></a>
    <div className="user"><div className="avatar">{currentUser.city.slice(0, 2).toUpperCase()}</div><div><b>{currentUser.displayName}</b><span>Nur {currentUser.city}</span></div><button className="logout-btn" onClick={onLogout} title="Abmelden">↪</button></div>
  </aside>
}

function Header({ setPage, currentUser }) { return <header className="topbar"><div className="crumb"><span>SAP Konstruktportal</span><b>/</b><strong>Historie &amp; Anmeldung Konstrukt · {currentUser.city}</strong></div><div className="top-actions"><button className="icon-btn" onClick={() => setPage('history')}><Icon name="search"/></button><button className="icon-btn notification"><Icon name="bell"/><i/></button><div className="divider"/><span className="env"><i/> Testumgebung</span><button className="user-menu">{currentUser.city} <span>⌄</span></button></div></header> }

function Status({ children, kind = 'blue' }) { return <span className={'status ' + kind}><i/>{children}</span> }
const backendStatusLabel = status => ({ VERIFIED: 'Akzeptiert', Akzeptiert: 'Akzeptiert', Übermittelt: 'Akzeptiert', VALIDATION_FAILED: 'Validierung fehlgeschlagen', REJECTED: 'Abgelehnt', NOT_VERIFIABLE: 'Akzeptiert', SOURCE_UNAVAILABLE: 'Akzeptiert' }[status] || status || 'Noch nicht geprüft');
const sidelyDeliveryLabel = delivery => delivery?.status === 'DELIVERED' ? 'An Sidely übermittelt' : delivery?.status === 'NOT_CONFIGURED' ? 'Lokale Annahme – externe Übermittlung nicht konfiguriert' : delivery?.status === 'FAILED' ? 'Externe Übermittlung fehlgeschlagen' : '';

function Overview({ setPage, records, allRecords, currentUser }) {
  const pendingUnits = records.reduce((sum, record) => sum + (record.units || []).filter(unit => unit.status === 'Ausstehend').length, 0);
  return <main className="content"><div className="page-heading"><div><div className="eyebrow">WILLKOMMEN ZURÜCK, {currentUser.displayName.toUpperCase()}</div><h1>Guten Morgen</h1><p>Hier ist der aktuelle Überblick über Ihre Konstrukte.</p></div><button className="primary" onClick={() => setPage('new')}><Icon name="plus"/> Neues Konstrukt anmelden</button></div>
    <section className="metrics"><Metric label="Konstrukte gesamt" value={records.length} delta="Im Datenbestand"/><Metric label="Akzeptierte Konstrukte" value={records.filter(r => r.status === 'Aktiv' || r.status === 'VERIFIED' || r.status === 'Übermittelt' || r.status === 'Akzeptiert').length} delta="Angenommen" good/><Metric label="Abgelehnte Konstrukte" value={records.filter(r => r.status === 'REJECTED').length} delta="Nicht angenommen" warn/><Metric label="Offene Einheitenprüfungen" value={pendingUnits} delta="Unabhängig vom Konstrukt" warn/></section>
     <section className="card table-card"><div className="card-title"><div><h2>Historie</h2><p>Ihre letzten Aktivitäten und Vertragsstatus</p></div><button className="link-btn" onClick={() => setPage('history')}>Alle anzeigen <Icon name="arrow"/></button></div><ConstructTable compact records={records}/></section>
  </main>
}
function Metric({ label, value, delta, good, warn }) { return <div className="metric"><span>{label}</span><strong>{value}</strong><small className={good ? 'good' : warn ? 'warn' : ''}>{good ? '↗ ' : warn ? '● ' : ''}{delta}</small></div> }
function ProcessStep({ n, label, done, current }) { return <div className={'process-step ' + (done ? 'done' : '') + (current ? 'current' : '')}><div>{done ? '✓' : n}</div><span>{label}</span></div> }

function HubMap({ records }) {
  const [selected, setSelected] = useState(null);
  const routes = records.slice(1).map((point, index) => ({ from: records[index], to: point }));
  return <section className="card hub-card"><div className="card-title"><div><h2>Hubs in Deutschland</h2><p>Interaktives Netz auf dem Globus · ziehen zum Drehen</p></div><span className="hub-count">{records.length} Hubs</span></div><div className="hub-map globe-map" onMouseLeave={() => setSelected(null)}><div className="globe-orbit orbit-one"/><div className="globe-orbit orbit-two"/><Globe points={records} routes={routes} selected={selected} onSelectPoint={(point) => setSelected(selected?.id === point.id ? null : point)} onHoverPoint={setSelected} onLeave={() => {}}/></div><div className="globe-caption"><span className="globe-live"><i/> LIVE NETZANSICHT</span><span>Deutschland · 3D-Globus · ziehbar</span></div><div className="hub-legend"><span><i className="solar-dot"/> Solar</span><span><i className="wind-dot"/> Wind</span><span className="hub-note">Ziehen zum Drehen · Klicken für Details</span></div></section>
}

function ConstructTable({ compact, records }) { return <div className="data-table"><div className="tr th"><span>Konstrukt</span><span>Erzeuger</span><span>Technologie</span><span>Vertrag bis</span><span>Status</span>{!compact && <span>Aktion</span>}</div>{records.map((r) => <div className="tr" key={r.id}><span><b>{r.id}</b><small>{r.city}</small></span><span>{r.producer}</span><span><span className={'type-dot ' + r.type.toLowerCase()}/>{r.type}</span><span>{formatDate(r.contractEnd)}</span><span><Status kind={r.status === 'REJECTED' ? 'red' : r.status === 'VERIFIED' || r.status === 'Aktiv' || r.status === 'Übermittelt' || r.status === 'Akzeptiert' ? 'green' : 'orange'}>{backendStatusLabel(r.status)}<small className="contract-state">{r.acceptedAt ? `Akzeptiert ab ${new Date(r.acceptedAt).toLocaleDateString('de-DE')}` : contractState(r)}</small>{r.verification?.sidely_delivery?.status === 'FAILED' && <small className="contract-state sidely-warning">SAP verifiziert · Sidely nicht übermittelt</small>}{r.verification?.sidely_delivery?.status === 'DELIVERED' && <small className="contract-state sidely-success">An Sidely übermittelt</small>}</Status></span>{!compact && <button className="row-action">Details <Icon name="arrow"/></button>}</div>)}</div> }

function History({ records }) {
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('Aktiv & offen');
  const [sort, setSort] = useState('submitted-desc');
  const filtered = records.filter(record => {
    const text = [record.id, record.city, record.producer, record.malo, record.status, contractState(record)].join(' ').toLowerCase();
    const isOpen = contractState(record) !== 'Beendet';
    const matchesFilter = statusFilter === 'Aktiv & offen' ? isOpen : statusFilter === 'Alle' ? true : contractState(record) === statusFilter || record.status === statusFilter;
    return text.includes(query.toLowerCase()) && matchesFilter;
  }).sort((a, b) => {
    if (sort === 'end-asc') return a.contractEnd.localeCompare(b.contractEnd);
    if (sort === 'end-desc') return b.contractEnd.localeCompare(a.contractEnd);
    return sort === 'submitted-asc' ? a.date.split('.').reverse().join('').localeCompare(b.date.split('.').reverse().join('')) : b.date.split('.').reverse().join('').localeCompare(a.date.split('.').reverse().join(''));
  });
  const approvalRecords = records.filter(record => contractState(record) !== 'Beendet' && record.status === 'REJECTED');
  return <main className="content"><div className="page-heading"><div><div className="eyebrow">DATENBESTAND</div><h1>Historie</h1><p>Aktive Konstrukte und übermittelte Anwendungen auf einen Blick.</p></div></div><section className="card table-card history-card"><div className="table-toolbar"><div className="searchbox"><Icon name="search"/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Nach Konstrukt, Ort, MaLo oder Erzeuger suchen"/></div><select className="history-select" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}><option>Aktiv &amp; offen</option><option>Alle offenen</option><option>Aktiv</option><option>Endet bald</option><option>Abgelehnt</option></select><select className="history-select" value={sort} onChange={e => setSort(e.target.value)}><option value="submitted-desc">Neueste Übermittlung</option><option value="submitted-asc">Älteste Übermittlung</option><option value="end-asc">Vertragsende: zuerst</option><option value="end-desc">Vertragsende: zuletzt</option></select></div>{filtered.length ? <ConstructTable records={filtered}/> : <div className="no-results"><div>⌕</div><b>Keine offenen Konstrukte gefunden</b><span>Ändern Sie Ihre Suche oder den Filter.</span></div>}<div className="result-count">{filtered.length} von {records.filter(record => contractState(record) !== 'Beendet').length} offenen Konstrukten</div></section>{approvalRecords.length > 0 && <section className="card table-card approval-card"><div className="card-title"><div><h2>Abgelehnte Konstrukte</h2><p>Diese Anwendungen wurden wegen abweichender SAP-Daten nicht angenommen.</p></div><span className="mini-tag">ABGELEHNT</span></div>{approvalRecords.map(record => <div className="approval-record" key={record.id}><div className="approval-record-head"><div><b>{record.id} · {record.city}</b><small>Konstruktprüfung</small></div><Status kind="orange">{record.status}</Status></div>{(record.units || []).map(unit => <div className="unit-approval" key={unit.id}><div><b>{unit.name}</b><small>MeLo: {unit.id}</small></div><Status kind={unit.status === 'Abgelehnt' ? 'orange' : unit.status === 'Akzeptiert' ? 'green' : 'orange'}>{unit.status}</Status></div>)}</div>)}</section>}</main>;
}

function Input({ label, value, placeholder, required, onChange, type = 'text', wide }) { return <label className={wide ? 'field wide' : 'field'}><span>{label}{required && <i>*</i>}</span><input type={type} required={required} value={value ?? ''} placeholder={placeholder} onChange={e => onChange?.(e.target.value)}/></label> }
function AddressField({ postalCode, city, onPostalCodeChange, onCityChange, lockedCity }) { return <div className="address-fields"><label className="field"><span>Ort<i>*</i></span><input type="text" value={city} placeholder="z. B. Frankfurt am Main" readOnly={Boolean(lockedCity)} required onChange={e => onCityChange(e.target.value)}/></label><label className="field"><span>PLZ<i>*</i></span><input type="text" inputMode="numeric" pattern="[0-9]{5}" maxLength={5} value={postalCode} placeholder="z. B. 60388" required onChange={e => onPostalCodeChange(e.target.value.replace(/\D/g, '').slice(0, 5))}/></label></div> }
function Select({ label, value, options, onChange }) { return <label className="field"><span>{label}<i>*</i></span><select required value={value} onChange={e => onChange(e.target.value)}>{options.map(o => <option key={o}>{o}</option>)}</select></label> }

// Suggests German addresses as the user types, using the free Photon (OSM) geocoder.
// Debounced, cancels stale requests, and lets the caller pre-fill street/PLZ/Ort/coords.
function AddressAutocomplete({ label, value, placeholder, required, onChange, onSelect, wide, city, postalCode }) {
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef(null);
  const abortRef = useRef(null);

  const search = (query) => {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    // lat/lon/zoom bias results toward Germany without excluding valid matches,
    // unlike a strict bbox/osm_tag filter which returned empty results in testing.
    fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&lang=de&limit=5&lat=51.1657&lon=10.4515&zoom=6`, { signal: controller.signal })
      .then(res => res.ok ? res.json() : Promise.reject(res))
      .then(data => {
        const results = (data.features || [])
          .filter(feature => feature.properties?.countrycode === 'DE')
          .map((feature, index) => {
          const p = feature.properties;
          const street = [p.street || p.name, p.housenumber].filter(Boolean).join(' ');
          const city = p.city || p.town || p.village || p.county || '';
          return {
            id: index + '-' + (p.osm_id || city),
            label: [street, p.postcode, city].filter(Boolean).join(', '),
            street: street || p.name || '',
            postalCode: p.postcode || '',
            city,
            lon: feature.geometry?.coordinates?.[0],
            lat: feature.geometry?.coordinates?.[1]
          };
        }).filter(result => result.label);
        setSuggestions(results);
        setOpen(results.length > 0);
      })
      .catch(err => { if (err.name !== 'AbortError') setSuggestions([]); })
      .finally(() => setLoading(false));
  };

  const handleChange = (text) => {
    onChange(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (text.trim().length < 3) { setSuggestions([]); setOpen(false); return; }
    const locationPrefix = [city, postalCode].filter(Boolean).join(' ');
    debounceRef.current = setTimeout(() => search([locationPrefix, text].filter(Boolean).join(' ')), 220);
  };

  const pick = (suggestion) => {
    onSelect(suggestion);
    setOpen(false);
    setSuggestions([]);
  };

  return <label className={(wide ? 'field wide' : 'field') + ' address-autocomplete'}>
    <span>{label}{required && <i>*</i>}</span>
    <input
      type="text"
      value={value ?? ''}
      placeholder={placeholder}
      required={required}
      onChange={e => handleChange(e.target.value)}
      onFocus={() => suggestions.length > 0 && setOpen(true)}
      onBlur={() => setTimeout(() => setOpen(false), 150)}
      autoComplete="off"
    />
    {loading && <span className="autocomplete-spinner">⟳</span>}
    {open && suggestions.length > 0 && <ul className="autocomplete-list">
      {suggestions.map(suggestion => <li key={suggestion.id} onMouseDown={() => pick(suggestion)}>
        <span className="autocomplete-icon">⌖</span>
        <span>{suggestion.label}</span>
      </li>)}
    </ul>}
  </label>;
}

function TypeSelection({ onSelect, settings }) {
  const types = [
    ['feed-in', 'Virtuelles Summenzählermodell', 'Einspeisekonstrukt mit Solar- oder Windanlage und weiteren MK7-Teilnehmern', 'sun'],
    ['building', 'Reales Summenzählermodell', 'Gebäudekonstrukt mit Solar-/Windanlage und einzelnen Einheiten', 'grid'],
    ['community', 'Gemeinschaftliche Gebäudeversorgung', 'Gemeinsame Versorgung eines Gebäudes ohne eigene Erzeugungsanlage', 'home', true]
  ];
  return <section className="type-selection"><div className="eyebrow">ANMELDUNG KONSTRUKT</div><h1>Was möchten Sie anmelden?</h1><p>Wählen Sie das passende Summenzählermodell für Ihre Anmeldung.</p><div className="type-cards">{types.map(([key, title, description, icon, unavailable]) => (key === 'community' || settings.types[key]) && <button className={'type-card' + (unavailable ? ' unavailable' : '')} key={key} disabled={unavailable} onClick={() => !unavailable && onSelect(key)}><span className="type-card-icon"><Icon name={icon}/></span><span><b>{title}</b><small>{description}</small>{unavailable && <em className="coming-soon">Demnächst verfügbar</em>}</span>{unavailable ? <span className="type-card-status">Ohne Funktion</span> : <Icon name="arrow"/>}</button>)}</div></section>;
}

function Stepper({ step, constructType }) {
  const steps = constructType === 'household'
    ? ['Grunddaten', 'Standort & Erzeugung', 'Review & Übermittlung']
    : ['Grunddaten', 'Standort & Erzeugung', 'Einheiten', 'Review & Übermittlung'];
  return <div className="stepper"><div className="stepper-line"/>{steps.map((label, index) => <div className={'wizard-step ' + (step > index ? 'active' : '')} key={label}><b>{step > index ? '✓' : index + 1}</b><span>{label}</span></div>)}</div>;
}

function NewConstruct({ setPage, onSubmitted, settings, currentUser }) {
  const [constructType, setConstructType] = useState(null);
  const [step, setStep] = useState(1);
  const defaultLocations = {
    'Frankfurt am Main': { postalCode: '60388', street: 'Vilbeler Landstrasse 21', lat: 50.11, lon: 8.68, malo: '51781123293', melo: 'DE0073325707820000000000000088943', id: 'B-FRA-01', type: 'Solar', capacity: '6', units: [['DE0001815707800000101300000139372', 'Wohnung 1. OG links'], ['DE0001815707800000101300000131094', 'Wohnung 1. OG rechts'], ['DE0001815707800000101300000139377', 'Wohnung 2. OG links']], generator: { malo: '51781123294', melo: 'DE0073325707820000000000000088944' } },
    Köln: { postalCode: '50859', street: 'Milanweg 10', lat: 50.94, lon: 6.96, malo: '51781215544', melo: 'DE0073325707820000000000000880945', id: 'B-CGN-01', type: 'Wind', capacity: '7', units: [['DE0001815707800000101300000139374', 'Wohnung 1. OG links'], ['DE0001815707800000101300000131096', 'Wohnung 1. OG rechts'], ['DE0001815707800000101300000139379', 'Wohnung 2. OG links']], generator: { malo: '51781215545', melo: 'DE0073325707820000000000000880946' } },
    'Mülheim an der Ruhr': { postalCode: '45470', street: 'Franz-Fischer-Strasse 24', lat: 51.43, lon: 6.88, malo: '51781124001', melo: 'DE0001815707800000101300000139428', id: 'B-MUL-01', type: 'Solar', capacity: '5.5', units: [['DE0001815707800000101300000139376', 'Wohnung 1. OG links'], ['DE0001815707800000101300000131098', 'Wohnung 1. OG rechts'], ['DE0001815707800000101300000139381', 'Wohnung 2. OG links']], generator: { malo: '51781124004', melo: 'DE0001815707800000101300000139429' } }
  };
  const location = defaultLocations[currentUser.city] || defaultLocations['Frankfurt am Main'];
  const [form, setForm] = useState({ contractStart: '2026-10-01', contractEnd: '2027-10-01', postalCode: location.postalCode, city: currentUser.city, street: location.street, first: 'Anna', last: 'Schmidt', email: `demo.${currentUser.city.toLowerCase().replace(/[^a-z]/g, '')}@example.com`, type: location.type, capacity: location.capacity, malo: location.malo, melo: location.melo, id: location.id, lat: location.lat, lon: location.lon });
  const [units, setUnits] = useState(location.units.slice(0, 2).map(([id, name]) => ({ id, name, type: 'Wohnung', kind: 'unit', melo: id, generator_malo: '', generator_melo: '', status: 'Ausstehend' })));
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [verificationResult, setVerificationResult] = useState(null);
  const update = key => value => setForm(current => ({ ...current, [key]: value }));
  const pickAddress = suggestion => setForm(current => ({ ...current, street: suggestion.street || current.street, postalCode: suggestion.postalCode || current.postalCode, city: suggestion.city || current.city, lat: suggestion.lat ?? current.lat, lon: suggestion.lon ?? current.lon }));
  const selectType = type => { setConstructType(type); setStep(1); };
  const addUnit = kind => setUnits(current => {
    const example = kind === 'unit' ? location.units[current.filter(unit => unit.kind === 'unit').length] : null;
    return [...current, {
      id: example?.[0] || `DE0001815707800000101300000${140001 + current.length}`,
      name: kind === 'generator' ? 'Solarpanel' : example?.[1] || `Neue Einheit ${current.length + 1}`,
      type: kind === 'generator' ? 'Solar' : 'Wohnung',
      kind,
      melo: example?.[0] || '',
      generator_malo: kind === 'generator' ? location.generator.malo : '',
      generator_melo: kind === 'generator' ? location.generator.melo : '',
      status: 'Ausstehend',
    }];
  });
  const updateUnit = (id, key, value) => setUnits(current => current.map(unit => unit.id === id ? { ...unit, [key]: value } : unit));
  const deleteUnit = id => setUnits(current => current.filter(unit => unit.id !== id));
  const saveSubmittedRecord = verification => {
    const id = `B-${currentUser.city.slice(0, 3).toUpperCase()}-${Date.now().toString().slice(-2)}`;
    const accepted = verification.status === 'VERIFIED' || verification.status === 'NOT_VERIFIABLE' || verification.status === 'SOURCE_UNAVAILABLE';
    onSubmitted?.({ id, ownerUsername: currentUser.username, category: constructType, city: currentUser.city, producer: form.first + ' ' + form.last, type: form.type, participants: units.length, units, status: accepted ? 'Akzeptiert' : verification.status, acceptedAt: accepted ? new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString() : null, verification: { ...verification, sidely_delivery: verification.sidely_delivery }, contractStart: form.contractStart, contractEnd: form.contractEnd, date: new Date().toLocaleDateString('de-DE'), lat: form.lat, lon: form.lon });
    setPage('overview');
  };
  const continueToReview = async () => {
    setSubmitting(true); setFormError('');
    try {
      const locationError = validateLocationForm(form);
      if (locationError) { setFormError(locationError); return; }
      const verification = await verifyWithBackend(form, constructType);
      setVerificationResult(verification);
      if (verification.status === 'NOT_VERIFIABLE' || verification.status === 'SOURCE_UNAVAILABLE') {
        saveSubmittedRecord(verification);
        return;
      }
      setStep(constructType === 'household' ? 3 : 4);
    } catch (error) { setFormError(error instanceof Error ? error.message : 'Die Validierung konnte nicht durchgeführt werden.'); }
    finally { setSubmitting(false); }
  };
  const validateLocationForm = currentForm => {
    if (!currentForm.city.trim()) return 'Ort ist ein Pflichtfeld.';
    if (!/^\d{5}$/.test(currentForm.postalCode)) return 'Bitte geben Sie eine gültige fünfstellige PLZ ein.';
    if (!currentForm.street.trim()) return 'Straße und Hausnummer sind Pflichtfelder.';
    if (!currentForm.contractStart || !currentForm.contractEnd || currentForm.contractEnd < currentForm.contractStart) return 'Bitte geben Sie einen gültigen Vertragszeitraum ein.';
    if (!/^\d{11}$/.test(currentForm.malo)) return 'MaLo-ID muss genau 11 Ziffern enthalten.';
    if (constructType !== 'household' && units.some(unit => unit.kind === 'unit' && !/^DE\d{31}$/.test(unit.melo || ''))) return 'Jede Einheit benötigt eine MeLo-ID im Format DE plus 31 Ziffern.';
    if (constructType !== 'household' && units.some(unit => unit.kind === 'generator' && (!/^\d{11}$/.test(unit.generator_malo || '') || !/^DE\d{31}$/.test(unit.generator_melo || '')))) return 'Solarpanel benötigen eine 11-stellige Erzeuger-MaLo-ID und eine MeLo-ID im Format DE plus 31 Ziffern.';
    return '';
  };
  const submit = async () => {
    setSubmitting(true); setFormError('');
    try {
      const verification = verificationResult || await verifyWithBackend(form, constructType);
      saveSubmittedRecord(verification);
    } catch (error) { setFormError(error instanceof Error ? error.message : 'Die Validierung konnte nicht durchgeführt werden.'); }
    finally { setSubmitting(false); }
  };
  const continueFromCustomer = () => {
    if (!form.first.trim() || !form.last.trim() || !form.email.trim()) {
      setFormError('Vorname, Nachname und E-Mail-Adresse sind Pflichtfelder.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      setFormError('Bitte geben Sie eine gültige E-Mail-Adresse ein.');
      return;
    }
    setFormError('');
    setStep(2);
  };
  const greenParticipants = participants.filter(p => p.city === currentUser.city && (p.role.includes('Solar') || p.role.includes('Wind')));
  const reviewStep = constructType === 'household' ? 3 : 4;
  if (!constructType) return <main className="content"><div className="page-heading compact-heading"><div><div className="eyebrow">ANMELDUNG KONSTRUKT</div><h1>Neue Anmeldung</h1></div><button className="text-btn" onClick={() => setPage('overview')}>Abbrechen</button></div><TypeSelection onSelect={selectType} settings={settings}/></main>;
  return <main className="content form-page"><div className="page-heading compact-heading"><div><div className="eyebrow">ANMELDUNG KONSTRUKT <span className="mini-tag">{constructType === 'household' ? 'HAUSHALT' : constructType === 'feed-in' ? 'EINSPEISUNG' : 'GEBÄUDE'}</span></div><h1>{constructType === 'household' ? 'Haushaltskunde anmelden' : constructType === 'feed-in' ? 'Einspeisekonstrukt anmelden' : 'Gebäudekonstrukt anmelden'}</h1><p>Erfassen Sie die Daten für die externe Prüfung im Netzgebiet {currentUser.city}.</p></div><button className="text-btn" onClick={() => setConstructType(null)}>Typ ändern</button></div><Stepper step={step} constructType={constructType}/>
    {step === 1 && <section className="card form-card"><div className="section-title"><span className="section-number">01</span><div><h2>Kundendaten</h2><p>Kontaktinformationen des Anlagenbetreibers</p></div></div><div className="form-grid"><Input label="Vorname" value={form.first} required onChange={update('first')}/><Input label="Nachname" value={form.last} required onChange={update('last')}/><Input label="E-Mail-Adresse" value={form.email} required onChange={update('email')} wide/><label className="checkbox"><input type="checkbox" defaultChecked/><span>Gewerblicher Kunde</span></label></div>{formError && <div className="form-error"><Icon name="alert"/>{formError}</div>}<div className="form-footer"><span><i>*</i> Pflichtfeld</span><button className="primary" onClick={continueFromCustomer}>Weiter <Icon name="arrow"/></button></div></section>}
    {step === 2 && <section className="card form-card"><div className="section-title"><span className="section-number">02</span><div><h2>Standort &amp; Erzeugung</h2><p>Angaben zum Standort, Vertrag und zur Anmeldung</p></div></div><div className="scope-note"><Icon name="check"/><span>Netzgebiet: <b>{currentUser.city}</b> · Dieser Zugang kann nur Konstrukte für dieses Gebiet anmelden.</span></div><div className="form-grid"><AddressField postalCode={form.postalCode} city={form.city} onPostalCodeChange={update('postalCode')} onCityChange={() => {}} lockedCity={currentUser.city}/><AddressAutocomplete label="Straße und Hausnummer" value={form.street} city={form.city} postalCode={form.postalCode} placeholder="Adresse eingeben zum Suchen…" required onChange={update('street')} onSelect={suggestion => pickAddress({ ...suggestion, city: currentUser.city })}/><Input label="Vertragsbeginn" value={form.contractStart} required type="date" onChange={update('contractStart')}/><Input label="Vertragsende" value={form.contractEnd} required type="date" onChange={update('contractEnd')}/><Input label="Gebäude-MaLo-ID" value={form.malo} required onChange={update('malo')} wide/></div>{formError && <div className="form-error"><Icon name="alert"/>{formError}</div>}<div className="form-footer"><button className="secondary" onClick={() => setStep(1)}>Zurück</button><button className="primary" onClick={() => { const error = validateLocationForm(form); if (error) setFormError(error); else { setFormError(''); setStep(3); } }}>Weiter <Icon name="arrow"/></button></div></section>}
    {constructType !== 'household' && step === 3 && <section className="card form-card"><div className="section-title"><span className="section-number">03</span><div><h2>Gebäudeeinheiten</h2><p>Jede Einheit erhält eine eigene Messlokation und wird unabhängig geprüft.</p></div><span className="count-badge">{units.length} Einheiten</span></div><div className="unit-section"><div className="subsection-heading"><div><h3>Einheiten</h3><p>Jede Messlokation erhält eine eigene Prüfung.</p></div><div className="unit-add-actions"><button className="outline-add" onClick={() => addUnit('unit')}><Icon name="plus"/> Einheit hinzufügen</button><button className="outline-add" onClick={() => addUnit('generator')}><Icon name="sun"/> Solarpanel hinzufügen</button></div></div><div className="unit-list">{units.map(unit => <div className="unit-row" key={unit.id}><div className="unit-fields"><Input label="Bezeichnung" value={unit.name} onChange={value => updateUnit(unit.id, 'name', value)}/>{unit.kind === 'generator' ? <><Input label="Erzeuger-MaLo-ID" value={unit.generator_malo} onChange={value => updateUnit(unit.id, 'generator_malo', value)}/><Input label="Erzeuger-MeLo-ID" value={unit.generator_melo} onChange={value => updateUnit(unit.id, 'generator_melo', value)}/></> : <Input label="Einheit MeLo-ID" value={unit.melo} onChange={value => updateUnit(unit.id, 'melo', value)}/> }</div><Status kind="orange">{unit.status}</Status><button className="row-action danger-text" onClick={() => deleteUnit(unit.id)}>Löschen</button></div>)}</div></div>{formError && <div className="form-error"><Icon name="alert"/>{formError}</div>}<div className="form-footer"><button className="secondary" onClick={() => setStep(2)}>Zurück</button><button className="primary" disabled={submitting} onClick={continueToReview}>{submitting ? 'Prüfung läuft…' : 'Weiter'} <Icon name="arrow"/></button></div></section>}
    {step === reviewStep && <section className="card form-card"><div className="section-title"><span className="section-number">{reviewStep}</span><div><h2>Review &amp; Übermittlung</h2><p>Prüfen Sie Ihre Angaben vor der Übermittlung.</p></div></div><div className="review-grid"><Review label="Anmeldetyp" value={constructType === 'feed-in' ? 'Virtuelles Summenzählermodell' : 'Reales Summenzählermodell'}/><Review label="Adresse" value={form.street + ', ' + form.postalCode + ' ' + form.city}/><Review label="MaLo-ID" value={form.malo}/><Review label="MeLo-ID" value={form.melo}/><Review label="Vertragszeitraum" value={`${formatDate(form.contractStart)} – ${formatDate(form.contractEnd)}`}/>{constructType === 'feed-in' && <Review label="Produktion" value={`${form.type} · ${form.capacity} kW`}/>}</div><div className="approval-preview"><div><Status kind="orange">Ausstehend</Status><b>Externe Prüfung</b><small>Die Validierungs- und Verifizierungs-API prüft Ihre Angaben.</small></div></div>{formError && <div className="form-error"><Icon name="alert"/>{formError}</div>}<div className="form-footer"><button className="secondary" onClick={() => setStep(constructType === 'feed-in' ? 2 : 3)}>Zurück</button><button className="primary" disabled={submitting} onClick={submit}><Icon name="upload"/> {submitting ? 'Prüfung läuft…' : 'Konstrukt übermitteln'}</button></div></section>}
  </main>;
}

function Review({label,value}) { return <div className="review-item"><span>{label}</span><b>{value}</b></div> }

function participantEnergyType(participant) {
  if (participant.role.includes('Solar')) return 'Solar';
  if (participant.role.includes('Wind')) return 'Wind';
  if (participant.role.includes('Household')) return 'Haushalt';
  return 'Reststrom';
}

function ParticipantsPage({ currentUser }) {
  const [query, setQuery] = useState('');
  const [energyType, setEnergyType] = useState('Alle');
  const [filterOpen, setFilterOpen] = useState(false);
  const cityParticipants = participants.filter(p => p.city === currentUser.city);
  const filtered = cityParticipants.filter(p => {
    const text = [p.role, p.city, p.id, p.malo].join(' ').toLowerCase();
    return text.includes(query.toLowerCase()) && (energyType === 'Alle' || participantEnergyType(p) === energyType);
  });
  return <main className="content"><div className="page-heading"><div><div className="eyebrow">DATENBESTAND · {currentUser.city.toUpperCase()}</div><h1>MK7 Teilnehmer</h1><p>Teilnehmerübersicht aus dem Netzgebiet {currentUser.city}.</p></div><button className="secondary"><Icon name="upload"/> Exportieren</button></div><section className="card table-card participant-table"><div className="table-toolbar"><div className="searchbox"><Icon name="search"/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Nach MeLo, MaLo, Rolle oder Ort suchen"/></div><div className="filter-wrap"><button className="filter-btn" onClick={() => setFilterOpen(!filterOpen)}>Energietyp {energyType !== 'Alle' && <span>1</span>}⌄</button>{filterOpen && <div className="filter-menu"><b>Energietyp</b>{['Alle', 'Solar', 'Wind', 'Haushalt', 'Reststrom'].map(type => <button className={energyType === type ? 'selected' : ''} key={type} onClick={() => {setEnergyType(type); setFilterOpen(false)}}>{type}{energyType === type && <span>✓</span>}</button>)}</div>}</div></div>{filtered.length === 0 ? <div className="no-results"><div>⌕</div><b>Keine Teilnehmer gefunden</b><span>Ändern Sie Ihre Suche oder den Energietyp-Filter.</span></div> : <div className="data-table"><div className="tr th"><span>Rolle</span><span>Energietyp</span><span>Ort</span><span>MeLo-ID</span><span>MaLo Import</span><span>Teilnahme</span></div>{filtered.map(p => <div className="tr" key={p.id}><span><b>{p.role}</b></span><span><span className={'type-dot ' + participantEnergyType(p).toLowerCase()}/>{participantEnergyType(p)}</span><span>{p.city}</span><span className="mono">{p.id}</span><span className="mono">{p.malo}</span><span><Status kind="green">{p.status}</Status></span></div>)}</div>}<div className="result-count">{filtered.length} von {cityParticipants.length} Teilnehmern</div></section></main>
}

const defaultSettings = { types: { household: false, 'feed-in': true, building: true }, technologies: ['Solar', 'Wind'] };

function Administration({ settings, setSettings }) {
  const toggleType = type => setSettings(current => ({ ...current, types: { ...current.types, [type]: !current.types[type] } }));
  const toggleTechnology = technology => setSettings(current => ({ ...current, technologies: current.technologies.includes(technology) ? current.technologies.filter(item => item !== technology) : [...current.technologies, technology] }));
  return <main className="content"><div className="page-heading"><div><div className="eyebrow">SYSTEMKONFIGURATION</div><h1>Administration</h1><p>Steuern Sie, welche Anmeldearten und Technologien im Portal verfügbar sind.</p></div></div><div className="admin-grid"><section className="card admin-card"><div className="card-title"><div><h2>Anmeldearten</h2><p>Deaktivierte Arten werden bei einer neuen Anmeldung ausgeblendet.</p></div></div>{[['household', 'Haushaltskunde'], ['feed-in', 'Einspeisekonstrukt'], ['building', 'Gebäudekonstrukt']].map(([key, label]) => <label className="admin-toggle" key={key}><span><b>{label}</b><small>{key === 'household' ? 'Haushaltsvertrag ohne Erzeugung' : key === 'feed-in' ? 'Solar-/Windanlage mit MK7-Teilnehmern' : 'Gebäude mit einzelnen Einheiten'}</small></span><input type="checkbox" checked={settings.types[key]} onChange={() => toggleType(key)}/><i/></label>)}</section><section className="card admin-card"><div className="card-title"><div><h2>Erzeugungstechnologien</h2><p>Verfügbare Technologien für Einspeise- und Gebäudekonstrukte.</p></div></div>{['Solar', 'Wind'].map(technology => <label className="admin-toggle" key={technology}><span><b>{technology}</b><small>{technology === 'Solar' ? 'Photovoltaik-Erzeugung' : 'Windenergie-Erzeugung'}</small></span><input type="checkbox" checked={settings.technologies.includes(technology)} onChange={() => toggleTechnology(technology)}/><i/></label>)}{settings.technologies.length === 0 && <div className="api-note"><div className="info-symbol">!</div><div><b>Mindestens eine Technologie erforderlich</b><p>Aktivieren Sie Solar oder Wind für Erzeugungskonstrukte.</p></div></div>}</section></div><div className="admin-note"><div className="info-symbol">i</div><span>Die Einstellungen werden lokal im Browser gespeichert und gelten für neue Anmeldungen.</span></div></main>;
}

function RejectionNotice({ onClose }) {
  return <aside className="rejection-notice" role="alert"><button className="notice-close" onClick={onClose} aria-label="Hinweis schließen">×</button><div className="notice-icon">!</div><div><strong>Anmeldung abgelehnt</strong><p>Die eingegebenen Daten stimmen nicht mit den verfügbaren SAP-Daten überein.</p><a href="https://www.sap.com/swiss/services-support" target="_blank" rel="noreferrer">Bitte kontaktieren Sie den Support</a></div></aside>;
}

function App() {
  const [page, setPage] = useState('overview');
  const [records, setRecords] = useState(initialRecords);
  const [currentUser, setCurrentUser] = useState(() => { try { return JSON.parse(sessionStorage.getItem('vnb-user')) || null; } catch { return null; } });
  const [settings, setSettings] = useState(() => { try { return JSON.parse(localStorage.getItem('vnb-admin-settings')) || defaultSettings; } catch { return defaultSettings; } });
  const [rejectionNotice, setRejectionNotice] = useState(false);
  const saveSettings = updater => setSettings(current => { const next = typeof updater === 'function' ? updater(current) : updater; localStorage.setItem('vnb-admin-settings', JSON.stringify(next)); return next; });
  if (!currentUser) return <Login onLogin={user => { sessionStorage.setItem('vnb-user', JSON.stringify(user)); setCurrentUser(user); setPage('overview'); }} />;
  const visibleRecords = records.filter(record => record.city === currentUser.city && record.ownerUsername === currentUser.username);
  const handleSubmitted = record => { setRecords(current => [record, ...current]); if (record.status === 'REJECTED') setRejectionNotice(true); };
  return <div className="app"><Sidebar page={page} setPage={setPage} currentUser={currentUser} onLogout={() => { sessionStorage.removeItem('vnb-user'); setCurrentUser(null); }}/><div className="main"><Header setPage={setPage} currentUser={currentUser}/>{page === 'overview' && <Overview setPage={setPage} records={visibleRecords} allRecords={records} currentUser={currentUser}/>} {page === 'history' && <History records={visibleRecords}/>} {page === 'new' && <NewConstruct setPage={setPage} settings={settings} currentUser={currentUser} onSubmitted={handleSubmitted}/>} {page === 'participants' && <ParticipantsPage currentUser={currentUser}/>} {page === 'admin' && <Administration settings={settings} setSettings={saveSettings}/>}</div>{rejectionNotice && <RejectionNotice onClose={() => setRejectionNotice(false)}/>}</div>;
}

createRoot(document.getElementById('root')).render(<App />);
