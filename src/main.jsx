import React, { useState, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import Globe from './Globe.jsx';

const initialRecords = [
  { id: 'B-FRA-01', city: 'Frankfurt am Main', producer: 'Jan Koller', type: 'Solar', participants: 5, status: 'Übermittelt', contractStart: '2026-10-01', contractEnd: '2027-10-01', date: '15.10.2026', lat: 50.11, lon: 8.68 },
  { id: 'B-CGN-01', city: 'Köln', producer: 'Roman Weidenfeller', type: 'Wind', participants: 4, status: 'In Prüfung', contractStart: '2026-09-14', contractEnd: '2026-12-20', date: '14.10.2026', lat: 50.94, lon: 6.96 },
  { id: 'B-MUL-01', city: 'Mülheim an der Ruhr', producer: 'Jan Koller', type: 'Solar', participants: 8, status: 'Übermittelt', contractStart: '2026-08-01', contractEnd: '2026-11-05', date: '12.10.2026', lat: 51.43, lon: 6.88 },
  { id: 'B-DTM-01', city: 'Dortmund', producer: 'Netzgebiet Dortmund', type: 'Wind', participants: 6, status: 'Übermittelt', contractStart: '2025-10-10', contractEnd: '2026-10-10', date: '10.10.2026', lat: 51.51, lon: 7.46 },
  { id: 'B-HAM-01', city: 'Hamburg', producer: 'Netzgebiet Hamburg', type: 'Solar', participants: 3, status: 'In Prüfung', contractStart: '2025-09-09', contractEnd: '2026-09-30', date: '09.10.2026', lat: 53.55, lon: 10.00 },
  { id: 'B-MUC-01', city: 'München', producer: 'Netzgebiet München', type: 'Solar', participants: 7, status: 'Übermittelt', contractStart: '2026-02-08', contractEnd: '2028-02-08', date: '08.10.2026', lat: 48.14, lon: 11.58 }
];

const today = '2026-10-15';
const contractState = (record) => record.contractEnd < today ? 'Beendet' : (record.contractEnd <= '2026-11-15' ? 'Endet bald' : 'Aktiv');
const formatDate = value => value ? new Date(`${value}T00:00:00`).toLocaleDateString('de-DE') : '—';

const initialUnits = [
  { id: 'DE0001815707800000101300000139372', name: 'Wohnung 1. OG links', type: 'Wohnung', malo: '50539603888', status: 'Ausstehend' },
  { id: 'DE0001815707800000101300000131094', name: 'Wohnung 1. OG rechts', type: 'Wohnung', malo: '50539603532', status: 'Ausstehend' }
];

const participants = [
  { role: 'Solar Plant', city: 'Frankfurt am Main', id: 'DE0073325707820000000000000088943', malo: '51781123293', status: 'Ja' },
  { role: 'Solar Plant', city: 'Mülheim an der Ruhr', id: 'DE0073325707820000000000000089012', malo: '51781124001', status: 'Ja' },
  { role: 'Wind Plant', city: 'Dortmund', id: 'DE0073325707820000000000000089013', malo: '51781124002', status: 'Ja' },
  { role: 'Household Consumption', city: 'Frankfurt am Main', id: 'DE0001815707800000101300000139372', malo: '50539603888', status: 'Ja' },
  { role: 'Household Consumption', city: 'Frankfurt am Main', id: 'DE0001815707800000101300000131094', malo: '50539603532', status: 'Ja' },
  { role: 'Residual Supply Market Location', city: 'Köln', id: 'DE0073325707820000000000000088991', malo: '51781215544', status: 'Ja' }
];

function Icon({ name }) {
  const icons = { grid: '▦', home: '⌂', plus: '+', users: '♙', chart: '◒', upload: '↥', settings: '⚙', search: '⌕', bell: '◔', arrow: '→', check: '✓', alert: '!', sun: '☀', wind: '♨' };
  return <span className={'icon icon-' + name}>{icons[name] || '•'}</span>;
}

function Sidebar({ page, setPage }) {
  const nav = [['overview', 'Übersicht', 'grid'], ['history', 'Historie', 'chart'], ['new', 'Anmeldung Konstrukt', 'plus'], ['participants', 'MK7 Teilnehmer', 'users']];
  return <aside className="sidebar">
    <div className="brand"><div className="brand-mark">V</div><div><strong>VNB</strong><span>Konstruktportal</span></div></div>
    <div className="side-label">ARBEITSBEREICH</div>
    <nav>{nav.map(([key, label, icon]) => <button key={key} className={page === key ? 'active' : ''} onClick={() => setPage(key)}><Icon name={icon}/><span>{label}</span>{key === 'new' && <em>MVP</em>}</button>)}</nav>
    <div className="sidebar-bottom"><button><Icon name="upload"/>Importe</button><button onClick={() => setPage('admin')}><Icon name="settings"/>Administration</button></div>
    <a className="help-card" href="https://www.sap.com/swiss/services-support" target="_blank" rel="noreferrer"><div className="help-icon">?</div><div><b>Brauchen Sie Hilfe?</b><span>Zum SAP Support</span></div><span className="help-arrow">↗</span></a>
    <div className="user"><div className="avatar">MK</div><div><b>Maria Kessler</b><span>VNB Sachbearbeitung</span></div><span className="dots">•••</span></div>
  </aside>
}

function Header({ setPage }) { return <header className="topbar"><div className="crumb"><span>VNB Konstruktportal</span><b>/</b><strong>Historie &amp; Anmeldung Konstrukt</strong></div><div className="top-actions"><button className="icon-btn" onClick={() => setPage('history')}><Icon name="search"/></button><button className="icon-btn notification"><Icon name="bell"/><i/></button><div className="divider"/><span className="env"><i/> Testumgebung</span><button className="user-menu">MK <span>⌄</span></button></div></header> }

function Status({ children, kind = 'blue' }) { return <span className={'status ' + kind}><i/>{children}</span> }

function Overview({ setPage, records }) {
  const pendingUnits = records.reduce((sum, record) => sum + (record.units || []).filter(unit => unit.status === 'Ausstehend').length, 0);
  return <main className="content"><div className="page-heading"><div><div className="eyebrow">WILLKOMMEN ZURÜCK, MARIA</div><h1>Guten Morgen</h1><p>Hier ist der aktuelle Überblick über Ihre Konstrukte.</p></div><button className="primary" onClick={() => setPage('new')}><Icon name="plus"/> Neues Konstrukt anmelden</button></div>
    <section className="metrics"><Metric label="Konstrukte gesamt" value={records.length} delta="Im Datenbestand"/><Metric label="Übermittelte Konstrukte" value={records.filter(r => r.status === 'Übermittelt').length} delta="Erfolgreich übermittelt" good/><Metric label="Offene Konstruktprüfungen" value={records.filter(r => r.status === 'In Prüfung').length} delta="Externe Prüfung" warn/><Metric label="Offene Einheitenprüfungen" value={pendingUnits} delta="Unabhängig vom Konstrukt" warn/></section>
    <div className="two-col"><section className="card process-card"><div className="card-title"><div><h2>Anmeldung Konstrukt</h2><p>Ihr MVP-Prozess im Überblick</p></div><span className="mini-tag">MVP</span></div><div className="process-line"><ProcessStep n="1" label="Daten erfassen" done/><ProcessStep n="2" label="Prüfen &amp; review" done/><ProcessStep n="3" label="Übermitteln" current/><ProcessStep n="4" label="Externe Prüfung"/></div><div className="info-callout"><div className="info-symbol">i</div><p>Die fachliche Prüfung erfolgt durch die angebundene API. Sie können den Status jederzeit in der Konstruktübersicht verfolgen.</p></div></section><HubMap records={records}/></div>
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

function ConstructTable({ compact, records }) { return <div className="data-table"><div className="tr th"><span>Konstrukt</span><span>Erzeuger</span><span>Technologie</span><span>Vertrag bis</span><span>Status</span>{!compact && <span>Aktion</span>}</div>{records.map((r) => <div className="tr" key={r.id}><span><b>{r.id}</b><small>{r.city}</small></span><span>{r.producer}</span><span><span className={'type-dot ' + r.type.toLowerCase()}/>{r.type}</span><span>{formatDate(r.contractEnd)}</span><span><Status kind={r.status === 'Übermittelt' ? 'green' : 'orange'}>{r.status}<small className="contract-state">{contractState(r)}</small></Status></span>{!compact && <button className="row-action">Details <Icon name="arrow"/></button>}</div>)}</div> }

function History({ records }) {
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('Aktiv & offen');
  const [sort, setSort] = useState('submitted-desc');
  const filtered = records.filter(record => {
    const text = [record.id, record.city, record.producer, record.malo, record.status, contractState(record)].join(' ').toLowerCase();
    const isOpen = contractState(record) !== 'Beendet';
    const matchesFilter = statusFilter === 'Aktiv & offen' ? isOpen : statusFilter === 'Alle' ? isOpen : contractState(record) === statusFilter || record.status === statusFilter;
    return text.includes(query.toLowerCase()) && matchesFilter;
  }).sort((a, b) => {
    if (sort === 'end-asc') return a.contractEnd.localeCompare(b.contractEnd);
    if (sort === 'end-desc') return b.contractEnd.localeCompare(a.contractEnd);
    return sort === 'submitted-asc' ? a.date.split('.').reverse().join('').localeCompare(b.date.split('.').reverse().join('')) : b.date.split('.').reverse().join('').localeCompare(a.date.split('.').reverse().join(''));
  });
  const approvalRecords = records.filter(record => contractState(record) !== 'Beendet' && (record.status === 'In Prüfung' || (record.units || []).some(unit => unit.status === 'Ausstehend')));
  return <main className="content"><div className="page-heading"><div><div className="eyebrow">DATENBESTAND</div><h1>Historie</h1><p>Aktive Konstrukte und offene Prüfprozesse auf einen Blick.</p></div></div><section className="card table-card history-card"><div className="table-toolbar"><div className="searchbox"><Icon name="search"/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Nach Konstrukt, Ort, MaLo oder Erzeuger suchen"/></div><select className="history-select" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}><option>Aktiv &amp; offen</option><option>Alle offenen</option><option>Aktiv</option><option>Endet bald</option><option>In Prüfung</option></select><select className="history-select" value={sort} onChange={e => setSort(e.target.value)}><option value="submitted-desc">Neueste Übermittlung</option><option value="submitted-asc">Älteste Übermittlung</option><option value="end-asc">Vertragsende: zuerst</option><option value="end-desc">Vertragsende: zuletzt</option></select></div>{filtered.length ? <ConstructTable records={filtered}/> : <div className="no-results"><div>⌕</div><b>Keine offenen Konstrukte gefunden</b><span>Ändern Sie Ihre Suche oder den Filter.</span></div>}<div className="result-count">{filtered.length} von {records.filter(record => contractState(record) !== 'Beendet').length} offenen Konstrukten</div></section>{approvalRecords.length > 0 && <section className="card table-card approval-card"><div className="card-title"><div><h2>Offene Prüfprozesse</h2><p>Die fachliche Prüfung erfolgt extern. Hier sehen Sie ausschließlich den aktuellen Bearbeitungsstand.</p></div><span className="mini-tag">EXTERNE PRÜFUNG</span></div>{approvalRecords.map(record => <div className="approval-record" key={record.id}><div className="approval-record-head"><div><b>{record.id} · {record.city}</b><small>Konstruktprüfung</small></div><Status kind="orange">{record.status}</Status></div>{(record.units || []).map(unit => <div className="unit-approval" key={unit.id}><div><b>{unit.name}</b><small>MeLo: {unit.id}</small></div><Status kind={unit.status === 'Abgelehnt' ? 'orange' : unit.status === 'Akzeptiert' ? 'green' : 'orange'}>{unit.status}</Status></div>)}</div>)}</section>}</main>;
}

function Input({ label, value, placeholder, required, onChange, type = 'text', wide }) { return <label className={wide ? 'field wide' : 'field'}><span>{label}{required && <i>*</i>}</span><input type={type} value={value ?? ''} placeholder={placeholder} onChange={e => onChange?.(e.target.value)}/></label> }
function AddressField({ postalCode, city, onPostalCodeChange, onCityChange }) { return <div className="address-fields"><label className="field"><span>PLZ<i>*</i></span><input type="text" inputMode="numeric" value={postalCode} placeholder="z. B. 60388" onChange={e => onPostalCodeChange(e.target.value)}/></label><label className="field"><span>Ort<i>*</i></span><input type="text" value={city} placeholder="z. B. Frankfurt am Main" onChange={e => onCityChange(e.target.value)}/></label></div> }
function Select({ label, value, options, onChange }) { return <label className="field"><span>{label}<i>*</i></span><select value={value} onChange={e => onChange(e.target.value)}>{options.map(o => <option key={o}>{o}</option>)}</select></label> }

// Suggests German addresses as the user types, using the free Photon (OSM) geocoder.
// Debounced, cancels stale requests, and lets the caller pre-fill street/PLZ/Ort/coords.
function AddressAutocomplete({ label, value, placeholder, required, onChange, onSelect, wide }) {
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
    debounceRef.current = setTimeout(() => search(text), 300);
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
    ['household', 'Haushaltskunde', 'Haushaltsvertrag ohne Erzeugungsanlage', 'home'],
    ['feed-in', 'Einspeisekonstrukt', 'Solar- oder Windanlage mit weiteren MK7-Teilnehmern', 'sun'],
    ['building', 'Gebäudekonstrukt', 'Gebäude mit Solar-/Windanlage und einzelnen Einheiten', 'grid']
  ];
  return <section className="type-selection"><div className="eyebrow">ANMELDUNG KONSTRUKT</div><h1>Was möchten Sie anmelden?</h1><p>Wählen Sie den passenden Prozess für Ihre Anmeldung.</p><div className="type-cards">{types.map(([key, title, description, icon]) => settings.types[key] && <button className="type-card" key={key} onClick={() => onSelect(key)}><span className="type-card-icon"><Icon name={icon}/></span><span><b>{title}</b><small>{description}</small></span><Icon name="arrow"/></button>)}</div></section>;
}

function Stepper({ step, constructType }) {
  const steps = ['Grunddaten', constructType === 'household' ? 'Standort & Vertrag' : 'Standort & Erzeugung', constructType === 'feed-in' ? 'MK7-Anlagen' : 'Einheiten', 'Review & Übermittlung'];
  return <div className="stepper"><div className="stepper-line"/>{steps.map((label, index) => <div className={'wizard-step ' + (step > index ? 'active' : '')} key={label}><b>{step > index ? '✓' : index + 1}</b><span>{label}</span></div>)}</div>;
}

function NewConstruct({ setPage, onSubmitted, settings }) {
  const [constructType, setConstructType] = useState(null);
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({ contractStart: '2026-10-01', contractEnd: '2027-10-01', postalCode: '60388', city: 'Frankfurt am Main', street: 'Vilbelerlandstraße 21', first: 'Jan', last: 'Koller', email: 'jankoller@gmail.com', type: 'Solar', capacity: '6', malo: '51781123293', lat: 50.11, lon: 8.68 });
  const [units, setUnits] = useState(initialUnits);
  const update = key => value => setForm(current => ({ ...current, [key]: value }));
  const pickAddress = suggestion => setForm(current => ({ ...current, street: suggestion.street || current.street, postalCode: suggestion.postalCode || current.postalCode, city: suggestion.city || current.city, lat: suggestion.lat ?? current.lat, lon: suggestion.lon ?? current.lon }));
  const selectType = type => { setConstructType(type); setStep(1); };
  const addUnit = () => setUnits(current => [...current, { id: `DE0001815707800000101300000${140001 + current.length}`, name: `Neue Einheit ${current.length + 1}`, type: 'Wohnung', malo: '', status: 'Ausstehend' }]);
  const updateUnit = (id, key, value) => setUnits(current => current.map(unit => unit.id === id ? { ...unit, [key]: value } : unit));
  const deleteUnit = id => setUnits(current => current.filter(unit => unit.id !== id));
  const submit = () => { onSubmitted?.({ id: 'B-' + form.city.slice(0, 3).toUpperCase() + '-' + Date.now().toString().slice(-2), category: constructType, city: form.city, producer: form.first + ' ' + form.last, type: constructType === 'household' ? 'Haushalt' : form.type, participants: constructType === 'feed-in' ? greenParticipants.length : units.length, units: constructType === 'feed-in' ? [] : units, status: 'In Prüfung', contractStart: form.contractStart, contractEnd: form.contractEnd, date: new Date().toLocaleDateString('de-DE'), lat: form.lat, lon: form.lon }); setPage('overview'); };
  const greenParticipants = participants.filter(p => p.role.includes('Solar') || p.role.includes('Wind'));
  const reviewStep = 4;
  if (!constructType) return <main className="content"><div className="page-heading compact-heading"><div><div className="eyebrow">ANMELDUNG KONSTRUKT</div><h1>Neue Anmeldung</h1></div><button className="text-btn" onClick={() => setPage('overview')}>Abbrechen</button></div><TypeSelection onSelect={selectType} settings={settings}/></main>;
  return <main className="content form-page"><div className="page-heading compact-heading"><div><div className="eyebrow">ANMELDUNG KONSTRUKT <span className="mini-tag">{constructType === 'household' ? 'HAUSHALT' : constructType === 'feed-in' ? 'EINSPEISUNG' : 'GEBÄUDE'}</span></div><h1>{constructType === 'household' ? 'Haushaltskunde anmelden' : constructType === 'feed-in' ? 'Einspeisekonstrukt anmelden' : 'Gebäudekonstrukt anmelden'}</h1><p>Erfassen Sie die Daten für die externe Prüfung.</p></div><button className="text-btn" onClick={() => setConstructType(null)}>Typ ändern</button></div><Stepper step={step} constructType={constructType}/>
    {step === 1 && <section className="card form-card"><div className="section-title"><span className="section-number">01</span><div><h2>Kundendaten</h2><p>Kontaktinformationen des Anlagenbetreibers</p></div></div><div className="form-grid"><Input label="Vorname" value={form.first} required onChange={update('first')}/><Input label="Nachname" value={form.last} required onChange={update('last')}/><Input label="E-Mail-Adresse" value={form.email} required onChange={update('email')} wide/><label className="checkbox"><input type="checkbox" defaultChecked/><span>Gewerblicher Kunde</span></label></div><div className="form-footer"><span><i>*</i> Pflichtfeld</span><button className="primary" onClick={() => setStep(2)}>Weiter <Icon name="arrow"/></button></div></section>}
    {step === 2 && <section className="card form-card"><div className="section-title"><span className="section-number">02</span><div><h2>{constructType === 'household' ? 'Standort & Vertrag' : 'Standort & Erzeugung'}</h2><p>Angaben zum Standort, Vertrag und zur Anmeldung</p></div></div><div className="form-grid"><AddressAutocomplete label="Straße und Hausnummer" value={form.street} placeholder="Adresse eingeben zum Suchen…" required onChange={update('street')} onSelect={pickAddress}/><AddressField postalCode={form.postalCode} city={form.city} onPostalCodeChange={update('postalCode')} onCityChange={update('city')}/><Input label="Vertragsbeginn" value={form.contractStart} required type="date" onChange={update('contractStart')}/><Input label="Vertragsende" value={form.contractEnd} required type="date" onChange={update('contractEnd')}/>{constructType !== 'household' && <><Select label="Produktionstyp" value={form.type} options={settings.technologies} onChange={update('type')}/><Input label="Installierte Leistung (kW)" value={form.capacity} required type="number" onChange={update('capacity')}/></>}<Input label="Marktlokation (MaLo-ID)" value={form.malo} required onChange={update('malo')} wide/></div><div className="form-footer"><button className="secondary" onClick={() => setStep(1)}>Zurück</button><button className="primary" onClick={() => form.contractEnd >= form.contractStart && setStep(constructType === 'household' ? 3 : 3)}>Weiter <Icon name="arrow"/></button></div></section>}
    {constructType === 'feed-in' && step === 3 && <section className="card form-card"><div className="section-title"><span className="section-number">03</span><div><h2>Weitere grüne MK7-Teilnehmer</h2><p>Diese Anlagen werden zur Information angezeigt und nicht bearbeitet.</p></div><span className="count-badge">{greenParticipants.length} Anlagen</span></div><div className="read-only-participants">{greenParticipants.map(p => <div className="participant-row" key={p.id}><div className="person-icon"><Icon name={p.role.includes('Solar') ? 'sun' : 'wind'}/></div><div><b>{p.role}</b><small>{p.city} · MeLo {p.id}</small></div><span className="type-label">{p.role.includes('Solar') ? 'Solar' : 'Wind'}</span><Status kind="green">{p.status}</Status></div>)}</div><div className="form-footer"><button className="secondary" onClick={() => setStep(2)}>Zurück</button><button className="primary" onClick={() => setStep(4)}>Weiter <Icon name="arrow"/></button></div></section>}
    {(constructType === 'building' || constructType === 'household') && step === 3 && <section className="card form-card"><div className="section-title"><span className="section-number">03</span><div><h2>{constructType === 'household' ? 'Wohnungs- oder Gebäudeeinheiten' : 'Gebäudeeinheiten'}</h2><p>Jede Einheit erhält eine eigene Messlokation und wird unabhängig geprüft.</p></div><span className="count-badge">{units.length} Einheiten</span></div><div className="unit-section"><div className="subsection-heading"><div><h3>Einheiten</h3><p>{constructType === 'household' ? 'Ein Haushaltskunde kann auch eine einzelne Wohnungseinheit anmelden.' : 'Jede Einheit erhält eine eigene Messlokation und Prüfung.'}</p></div><button className="outline-add" onClick={addUnit}><Icon name="plus"/> Einheit hinzufügen</button></div><div className="unit-list">{units.map(unit => <div className="unit-row" key={unit.id}><div className="unit-fields"><Input label="Bezeichnung" value={unit.name} onChange={value => updateUnit(unit.id, 'name', value)}/><Input label="Messlokation (MeLo-ID)" value={unit.id} onChange={value => updateUnit(unit.id, 'id', value)}/><Input label="MaLo-ID" value={unit.malo} placeholder="Optional" onChange={value => updateUnit(unit.id, 'malo', value)}/></div><Status kind="orange">{unit.status}</Status><button className="row-action danger-text" onClick={() => deleteUnit(unit.id)}>Löschen</button></div>)}</div></div><div className="form-footer"><button className="secondary" onClick={() => setStep(2)}>Zurück</button><button className="primary" onClick={() => setStep(4)}>Weiter <Icon name="arrow"/></button></div></section>}
    {step === reviewStep && <section className="card form-card"><div className="section-title"><span className="section-number">04</span><div><h2>Review &amp; Übermittlung</h2><p>Prüfen Sie Ihre Angaben vor der Übermittlung.</p></div></div><div className="review-grid"><Review label="Anmeldetyp" value={constructType === 'household' ? 'Haushaltskunde' : constructType === 'feed-in' ? 'Einspeisekonstrukt' : 'Gebäudekonstrukt'}/><Review label="Adresse" value={form.street + ', ' + form.postalCode + ' ' + form.city}/><Review label="Marktlokation (MaLo-ID)" value={form.malo}/><Review label="Vertragszeitraum" value={`${formatDate(form.contractStart)} – ${formatDate(form.contractEnd)}`}/>{constructType !== 'household' && <Review label="Produktion" value={`${form.type} · ${form.capacity} kW`}/>} {constructType === 'feed-in' && <Review label="Grüne MK7-Anlagen" value={`${greenParticipants.length} Anlagen (nur Anzeige)`}/>} {constructType !== 'feed-in' && <Review label="Einheiten" value={`${units.length} Einheiten`}/>}</div><div className="approval-preview"><div><Status kind="orange">Ausstehend</Status><b>Externe Prüfung</b><small>Die fachliche Prüfung erfolgt durch die externe Prüf-API.</small></div>{constructType !== 'feed-in' && <div><Status kind="orange">{units.length} ausstehend</Status><b>Einheitenprüfungen</b><small>Jede Messlokation wird unabhängig geprüft.</small></div>}</div><div className="api-note"><div className="info-symbol">i</div><div><b>Keine lokale Entscheidung</b><p>Die fachliche Prüfung und Bestätigung übernimmt die angebundene API.</p></div></div><div className="form-footer"><button className="secondary" onClick={() => setStep(3)}>Zurück</button><button className="primary" onClick={submit}><Icon name="upload"/> Konstrukt übermitteln</button></div></section>}
  </main>;
}

function Review({label,value}) { return <div className="review-item"><span>{label}</span><b>{value}</b></div> }

function participantEnergyType(participant) {
  if (participant.role.includes('Solar')) return 'Solar';
  if (participant.role.includes('Wind')) return 'Wind';
  if (participant.role.includes('Household')) return 'Haushalt';
  return 'Reststrom';
}

function ParticipantsPage() {
  const [query, setQuery] = useState('');
  const [energyType, setEnergyType] = useState('Alle');
  const [filterOpen, setFilterOpen] = useState(false);
  const filtered = participants.filter(p => {
    const text = [p.role, p.city, p.id, p.malo].join(' ').toLowerCase();
    return text.includes(query.toLowerCase()) && (energyType === 'Alle' || participantEnergyType(p) === energyType);
  });
  return <main className="content"><div className="page-heading"><div><div className="eyebrow">DATENBESTAND</div><h1>MK7 Teilnehmer</h1><p>Teilnehmerübersicht aus dem aktuellen Datenbestand.</p></div><button className="secondary"><Icon name="upload"/> Exportieren</button></div><section className="card table-card participant-table"><div className="table-toolbar"><div className="searchbox"><Icon name="search"/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Nach MeLo, MaLo, Rolle oder Ort suchen"/></div><div className="filter-wrap"><button className="filter-btn" onClick={() => setFilterOpen(!filterOpen)}>Energietyp {energyType !== 'Alle' && <span>1</span>}⌄</button>{filterOpen && <div className="filter-menu"><b>Energietyp</b>{['Alle', 'Solar', 'Wind', 'Haushalt', 'Reststrom'].map(type => <button className={energyType === type ? 'selected' : ''} key={type} onClick={() => {setEnergyType(type); setFilterOpen(false)}}>{type}{energyType === type && <span>✓</span>}</button>)}</div>}</div></div>{filtered.length === 0 ? <div className="no-results"><div>⌕</div><b>Keine Teilnehmer gefunden</b><span>Ändern Sie Ihre Suche oder den Energietyp-Filter.</span></div> : <div className="data-table"><div className="tr th"><span>Rolle</span><span>Energietyp</span><span>Ort</span><span>MeLo-ID</span><span>MaLo Import</span><span>Teilnahme</span></div>{filtered.map(p => <div className="tr" key={p.id}><span><b>{p.role}</b></span><span><span className={'type-dot ' + participantEnergyType(p).toLowerCase()}/>{participantEnergyType(p)}</span><span>{p.city}</span><span className="mono">{p.id}</span><span className="mono">{p.malo}</span><span><Status kind="green">{p.status}</Status></span></div>)}</div>}<div className="result-count">{filtered.length} von {participants.length} Teilnehmern</div></section></main>
}

const defaultSettings = { types: { household: true, 'feed-in': true, building: true }, technologies: ['Solar', 'Wind'] };

function Administration({ settings, setSettings }) {
  const toggleType = type => setSettings(current => ({ ...current, types: { ...current.types, [type]: !current.types[type] } }));
  const toggleTechnology = technology => setSettings(current => ({ ...current, technologies: current.technologies.includes(technology) ? current.technologies.filter(item => item !== technology) : [...current.technologies, technology] }));
  return <main className="content"><div className="page-heading"><div><div className="eyebrow">SYSTEMKONFIGURATION</div><h1>Administration</h1><p>Steuern Sie, welche Anmeldearten und Technologien im Portal verfügbar sind.</p></div></div><div className="admin-grid"><section className="card admin-card"><div className="card-title"><div><h2>Anmeldearten</h2><p>Deaktivierte Arten werden bei einer neuen Anmeldung ausgeblendet.</p></div></div>{[['household', 'Haushaltskunde'], ['feed-in', 'Einspeisekonstrukt'], ['building', 'Gebäudekonstrukt']].map(([key, label]) => <label className="admin-toggle" key={key}><span><b>{label}</b><small>{key === 'household' ? 'Haushaltsvertrag ohne Erzeugung' : key === 'feed-in' ? 'Solar-/Windanlage mit MK7-Teilnehmern' : 'Gebäude mit einzelnen Einheiten'}</small></span><input type="checkbox" checked={settings.types[key]} onChange={() => toggleType(key)}/><i/></label>)}</section><section className="card admin-card"><div className="card-title"><div><h2>Erzeugungstechnologien</h2><p>Verfügbare Technologien für Einspeise- und Gebäudekonstrukte.</p></div></div>{['Solar', 'Wind'].map(technology => <label className="admin-toggle" key={technology}><span><b>{technology}</b><small>{technology === 'Solar' ? 'Photovoltaik-Erzeugung' : 'Windenergie-Erzeugung'}</small></span><input type="checkbox" checked={settings.technologies.includes(technology)} onChange={() => toggleTechnology(technology)}/><i/></label>)}{settings.technologies.length === 0 && <div className="api-note"><div className="info-symbol">!</div><div><b>Mindestens eine Technologie erforderlich</b><p>Aktivieren Sie Solar oder Wind für Erzeugungskonstrukte.</p></div></div>}</section></div><div className="admin-note"><div className="info-symbol">i</div><span>Die Einstellungen werden lokal im Browser gespeichert und gelten für neue Anmeldungen.</span></div></main>;
}

function App() {
  const [page, setPage] = useState('overview');
  const [records, setRecords] = useState(initialRecords);
  const [settings, setSettings] = useState(() => { try { return JSON.parse(localStorage.getItem('vnb-admin-settings')) || defaultSettings; } catch { return defaultSettings; } });
  const saveSettings = updater => setSettings(current => { const next = typeof updater === 'function' ? updater(current) : updater; localStorage.setItem('vnb-admin-settings', JSON.stringify(next)); return next; });
  return <div className="app"><Sidebar page={page} setPage={setPage}/><div className="main"><Header setPage={setPage}/>{page === 'overview' && <Overview setPage={setPage} records={records}/>} {page === 'history' && <History records={records}/>} {page === 'new' && <NewConstruct setPage={setPage} settings={settings} onSubmitted={record => setRecords(current => [record, ...current])}/>} {page === 'participants' && <ParticipantsPage/>} {page === 'admin' && <Administration settings={settings} setSettings={saveSettings}/>}</div></div>;
}

createRoot(document.getElementById('root')).render(<App />);
