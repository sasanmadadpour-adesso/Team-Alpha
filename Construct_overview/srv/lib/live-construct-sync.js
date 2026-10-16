const { randomUUID } = require('node:crypto');
const { LiveSyncStore } = require('./live-sync-store');

const DEFAULTS = {
  pendingUrl: 'http://localhost:4010/api/constructs/pending',
  registeredUrl: 'http://localhost:4020/api/constructs',
  registeredFallbackUrl: '',
  intervalMs: 30000,
  timeoutMs: 10000
};

function firstValue(object, names) {
  for (const name of names) {
    if (object?.[name] !== undefined && object[name] !== null && object[name] !== '') return object[name];
  }
}

function primaryMaLo(item) {
  return String(firstValue(item, ['primaryMaLo', 'primaryMalo', 'maLo', 'malo', 'MaLo', 'maloId', 'marketLocationId', 'marketLocationIdentifier', 'importMaLo']) || '').trim();
}

function safeRegisteredID(item, malo) {
  const supplied = item.ID || item.id;
  if (supplied && !/[\s'()%]/.test(String(supplied))) return String(supplied);
  const source = String(item.sourceId || supplied || malo);
  return `ruhende-${malo}-${Buffer.from(source, 'utf8').toString('base64url')}`;
}

function registeredParticipant(item) {
  if (!item?.sourceId && !item?.buildingId && !item?.maloId) return item;
  const malo = primaryMaLo(item);
  const household = item.role === 'Haushaltsverbrauch';
  const counter = item.role === 'Marktlokation Reststrom';
  const participates = household ? Boolean(item.participates && !item.excluded) : true;
  return {
    ...item,
    ID: safeRegisteredID(item, malo),
    primaryMaLo: malo,
    importMaLo: item.maloId || null,
    exportMaLo: item.generationFeedInMaloId || null,
    meLo: item.meloId || null,
    displayName: `${item.role || 'Konstrukt'} · ${item.city || item.buildingId || malo}`,
    roleCode: household ? 'HOUSEHOLD' : counter ? 'RESIDUAL_SUPPLY' : 'GENERATION',
    roleLabel: item.role || null,
    directionCode: counter || household ? 'CONSUMPTION' : 'GENERATION',
    nodeType: household ? 'HOUSEHOLD' : counter ? 'COUNTER' : 'PRODUCER',
    buildingID: item.buildingId || item.constructId || null,
    participationCode: household ? (participates ? 'YES' : 'NO') : null,
    participationLabel: household ? (participates ? 'Ja / Yes' : 'Nein / No') : null,
    participationCriticality: household ? (participates ? 2 : 1) : 3,
    isEligible: household && participates,
    hasDataWarning: Boolean(item.maloConflict),
    warningCode: item.maloConflict ? 'AMBIGUOUS_MALO_ASSIGNMENT' : null,
    warningText: item.maloConflict ? 'MaLo is assigned to more than one construct.' : null,
    warningCriticality: item.maloConflict ? 1 : 3,
    supplyStart: item.supplyStartUtc || null,
    contractStart: item.contractFromUtc || null,
    contractEnd: item.contractToUtc || null,
    sourceSystem: 'RUHENDE_MALO',
    simulation: true
  };
}

function normalizeItem(item, source) {
  if (source === 'registered') item = registeredParticipant(item);
  const malo = primaryMaLo(item);
  if (!malo) throw new Error(`${source} item is missing its primary MaLo`);
  const meLo = firstValue(item, ['meLo', 'melo', 'MeLo', 'meteringLocationId']);
  const streetAddress = firstValue(item, ['streetAddress', 'address', 'deliveryAddress']);
  return {
    ...item,
    ID: String(item.ID || item.id || `${source}-${malo}`),
    primaryMaLo: malo,
    meLo: meLo == null ? null : String(meLo),
    displayName: String(firstValue(item, ['displayName', 'name', 'title']) || malo),
    roleCode: firstValue(item, ['roleCode', 'role']) || null,
    roleLabel: firstValue(item, ['roleLabel', 'role']) || null,
    directionCode: firstValue(item, ['directionCode', 'direction']) || null,
    city: firstValue(item, ['city', 'locality']) || null,
    streetAddress: streetAddress || null,
    receivedAt: firstValue(item, ['receivedAt', 'createdAt', 'submittedAt', 'timestamp']) || null,
    sourceSystem: source === 'pending' ? 'ANMELDEN' : 'UMSTELLUNG',
    rawPayload: JSON.stringify(item)
  };
}

function unwrap(body) {
  const value = Array.isArray(body) ? body : body?.value;
  if (!Array.isArray(value)) throw new Error('Expected an array or a { value: [...] } response');
  return value;
}

class LiveConstructSync {
  constructor(options = {}) {
    this.options = {
      pendingUrl: process.env.PENDING_API_URL || DEFAULTS.pendingUrl,
      registeredUrl: process.env.REGISTERED_API_URL || DEFAULTS.registeredUrl,
      registeredFallbackUrl: process.env.REGISTERED_FALLBACK_API_URL || DEFAULTS.registeredFallbackUrl,
      intervalMs: Number(process.env.SYNC_INTERVAL_MS || DEFAULTS.intervalMs),
      timeoutMs: Number(process.env.SYNC_TIMEOUT_MS || DEFAULTS.timeoutMs),
      apiKey: process.env.EXTERNAL_API_KEY || '',
      ...options
    };
    this.store = options.store || new LiveSyncStore(options.databasePath);
    this.fetch = options.fetch || globalThis.fetch;
    this.timer = null;
    this.syncing = null;
  }

  seedRegistered(items) {
    if (!this.store.items('registered').length && !this.store.status('registered').lastSuccessAt) {
      const normalized = items.map(item => normalizeItem(item, 'registered'));
      this.store.replace('registered', normalized);
      this.store.setStatus('registered', { stale: true, error: 'Using workbook seed until Umstellung is reachable', itemCount: normalized.length });
    }
  }

  headers() {
    return this.options.apiKey ? { 'x-api-key': this.options.apiKey, authorization: `Bearer ${this.options.apiKey}` } : {};
  }

  async request(url) {
    const response = await this.fetch(url, {
      headers: this.headers(),
      signal: AbortSignal.timeout(this.options.timeoutMs)
    });
    if (!response.ok) throw new Error(`HTTP ${response.status} from ${url}`);
    return response.json();
  }

  async poll(source) {
    const url = source === 'pending' ? this.options.pendingUrl : this.options.registeredUrl;
    const now = new Date().toISOString();
    this.store.setStatus(source, { lastAttemptAt: now, stale: true });
    try {
      let body;
      try {
        body = await this.request(url);
      } catch (error) {
        if (source !== 'registered' || !this.options.registeredFallbackUrl) throw error;
        body = await this.request(this.options.registeredFallbackUrl);
      }
      const items = unwrap(body).map(item => normalizeItem(item, source));
      this.store.replace(source, items, { auditRemoved: source === 'pending' });
      this.store.setStatus(source, { lastAttemptAt: now, lastSuccessAt: new Date().toISOString(), stale: false, error: null, itemCount: items.length });
      return items;
    } catch (error) {
      const cached = this.store.items(source);
      this.store.setStatus(source, { lastAttemptAt: now, stale: true, error: error.message, itemCount: cached.length });
      throw error;
    }
  }

  reconcile() {
    // A workbook seed is display-only fallback. It must never complete an Anmeldung case;
    // reconciliation begins only after Umstellung has supplied real data.
    if (!this.store.status('registered').lastSuccessAt) return;
    const registered = new Set(this.store.items('registered').map(item => item.primaryMaLo));
    for (const pending of this.store.items('pending')) {
      if (registered.has(pending.primaryMaLo)) this.store.remove('pending', pending.primaryMaLo, 'REGISTERED_IN_UMSTELLUNG');
    }
    this.store.setStatus('pending', { itemCount: this.store.items('pending').length });
  }

  async syncNow() {
    if (this.syncing) return this.syncing;
    this.syncing = (async () => {
      const results = await Promise.allSettled([this.poll('pending'), this.poll('registered')]);
      this.reconcile();
      return {
        pending: results[0].status,
        registered: results[1].status,
        statuses: this.statuses()
      };
    })().finally(() => { this.syncing = null; });
    return this.syncing;
  }

  start() {
    if (this.timer) return;
    void this.syncNow();
    this.timer = setInterval(() => void this.syncNow(), this.options.intervalMs);
    this.timer.unref?.();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  registered() {
    return this.store.items('registered');
  }

  registeredIsAuthoritative() {
    return Boolean(this.store.status('registered').lastSuccessAt);
  }

  pending() {
    const status = this.store.status('pending');
    return this.store.items('pending').map(item => ({
      ...item,
      syncState: status.stale ? 'STALE' : 'CURRENT',
      lastSyncedAt: status.lastSuccessAt
    }));
  }

  statuses() {
    return this.store.statuses().map(status => ({
      ...status,
      ID: status.source,
      source: status.source === 'pending' ? 'ANMELDEN' : 'UMSTELLUNG'
    }));
  }

  audit() {
    return this.store.auditRows();
  }

  async detail(source, malo, sourceId) {
    const base = source === 'pending' ? this.options.pendingUrl : this.options.registeredUrl;
    const cached = this.store.items(source).find(item =>
      sourceId ? item.ID === sourceId : item.primaryMaLo === malo
    );
    // Action-style collection endpoints such as maloOverview() do not expose a
    // per-key URL. Their current snapshot is already the authoritative detail.
    if (source === 'registered' && /\(\)\/?$/.test(base)) return cached;
    try {
      const current = normalizeItem(await this.request(`${base}/${encodeURIComponent(malo)}`), source);
      return cached ? { ...cached, ...current, ID: cached.ID } : current;
    } catch {
      return cached;
    }
  }

  applyWebhook(source, body) {
    if (Array.isArray(body) || Array.isArray(body?.value)) {
      const items = unwrap(body).map(item => normalizeItem(item, source));
      this.store.replace(source, items, { auditRemoved: source === 'pending', reason: 'WEBHOOK_SNAPSHOT_REMOVED' });
    } else {
      const event = String(body?.event || body?.type || 'UPSERT').toUpperCase();
      const payload = body?.data || body?.construct || body;
      if (event === 'DELETE' || event === 'REMOVED') {
        const malo = primaryMaLo(payload);
        if (!malo) throw new Error('DELETE webhook is missing its primary MaLo');
        this.store.remove(source, malo);
      } else {
        this.store.upsert(source, normalizeItem(payload, source));
      }
    }
    this.store.setStatus(source, { lastAttemptAt: new Date().toISOString(), lastSuccessAt: new Date().toISOString(), stale: false, error: null, itemCount: this.store.items(source).length });
    this.reconcile();
    return { ID: randomUUID(), source, itemCount: this.store.items(source).length };
  }
}

let singleton;
function getLiveConstructSync(options) {
  if (!singleton) singleton = new LiveConstructSync(options);
  return singleton;
}

module.exports = { LiveConstructSync, getLiveConstructSync, normalizeItem, primaryMaLo, registeredParticipant, unwrap, DEFAULTS };
