const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

function defaultDatabasePath() {
  return path.resolve(__dirname, '..', '..', 'db', 'live-sync.sqlite');
}

class LiveSyncStore {
  constructor(file = process.env.SYNC_DB_PATH || defaultDatabasePath()) {
    if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
    this.db = new DatabaseSync(file);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS sync_items (
        source TEXT NOT NULL,
        malo TEXT NOT NULL,
        payload TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (source, malo)
      );
      CREATE TABLE IF NOT EXISTS sync_status (
        source TEXT PRIMARY KEY,
        last_attempt_at TEXT,
        last_success_at TEXT,
        stale INTEGER NOT NULL DEFAULT 1,
        error TEXT,
        item_count INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS sync_audit (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source TEXT NOT NULL,
        malo TEXT,
        event_type TEXT NOT NULL,
        reason TEXT,
        payload TEXT,
        created_at TEXT NOT NULL
      );
    `);
  }

  items(source) {
    return this.db.prepare('SELECT payload FROM sync_items WHERE source = ? ORDER BY malo').all(source)
      .map(row => JSON.parse(row.payload));
  }

  replace(source, items, { auditRemoved = false, reason = 'SNAPSHOT_REMOVED' } = {}) {
    const now = new Date().toISOString();
    const previous = new Map(this.items(source).map(item => [item.primaryMaLo, item]));
    const next = new Map(items.map(item => [item.primaryMaLo, item]));
    this.db.exec('BEGIN');
    try {
      this.db.prepare('DELETE FROM sync_items WHERE source = ?').run(source);
      const insert = this.db.prepare('INSERT INTO sync_items (source, malo, payload, updated_at) VALUES (?, ?, ?, ?)');
      for (const [malo, item] of next) insert.run(source, malo, JSON.stringify(item), now);
      if (auditRemoved) {
        for (const [malo, item] of previous) {
          if (!next.has(malo)) this.audit(source, malo, 'REMOVED', reason, item, now);
        }
      }
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  upsert(source, item) {
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO sync_items (source, malo, payload, updated_at) VALUES (?, ?, ?, ?)
      ON CONFLICT(source, malo) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at
    `).run(source, item.primaryMaLo, JSON.stringify(item), now);
  }

  remove(source, malo, reason = 'WEBHOOK_DELETE') {
    const row = this.db.prepare('SELECT payload FROM sync_items WHERE source = ? AND malo = ?').get(source, malo);
    if (!row) return false;
    const item = JSON.parse(row.payload);
    this.db.prepare('DELETE FROM sync_items WHERE source = ? AND malo = ?').run(source, malo);
    this.audit(source, malo, 'REMOVED', reason, item);
    return true;
  }

  audit(source, malo, eventType, reason, payload, createdAt = new Date().toISOString()) {
    this.db.prepare(`INSERT INTO sync_audit (source, malo, event_type, reason, payload, created_at)
      VALUES (?, ?, ?, ?, ?, ?)`)
      .run(source, malo || null, eventType, reason || null, payload == null ? null : JSON.stringify(payload), createdAt);
  }

  auditRows() {
    return this.db.prepare('SELECT * FROM sync_audit ORDER BY id DESC').all().map(row => ({
      ID: String(row.id),
      source: row.source,
      primaryMaLo: row.malo,
      eventType: row.event_type,
      reason: row.reason,
      payload: row.payload,
      createdAt: row.created_at
    }));
  }

  setStatus(source, patch) {
    const current = this.status(source);
    const value = { ...current, source, ...patch };
    this.db.prepare(`
      INSERT INTO sync_status (source, last_attempt_at, last_success_at, stale, error, item_count)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(source) DO UPDATE SET
        last_attempt_at = excluded.last_attempt_at,
        last_success_at = excluded.last_success_at,
        stale = excluded.stale,
        error = excluded.error,
        item_count = excluded.item_count
    `).run(source, value.lastAttemptAt || null, value.lastSuccessAt || null, value.stale ? 1 : 0, value.error || null, value.itemCount || 0);
  }

  status(source) {
    const row = this.db.prepare('SELECT * FROM sync_status WHERE source = ?').get(source);
    return row ? {
      source: row.source,
      lastAttemptAt: row.last_attempt_at,
      lastSuccessAt: row.last_success_at,
      stale: Boolean(row.stale),
      error: row.error,
      itemCount: row.item_count
    } : { source, lastAttemptAt: null, lastSuccessAt: null, stale: true, error: null, itemCount: 0 };
  }

  statuses() {
    return ['pending', 'registered'].map(source => this.status(source));
  }

  close() {
    this.db.close();
  }
}

module.exports = { LiveSyncStore, defaultDatabasePath };
