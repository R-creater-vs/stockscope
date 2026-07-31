/**
 * Embedded persistence via Node's built-in SQLite (`node:sqlite`). No native
 * build step, no external database server, no account — the file lives beside
 * the app and survives restarts. That is the whole point: watchlists, alert
 * rules and push subscriptions must outlive a page reload and be readable by the
 * background scheduler, which localStorage can never be.
 *
 * The database is opened once per process and reused. All access goes through
 * the typed helpers below so the rest of the app never writes SQL.
 */

import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

// Kept outside the build output so a redeploy never wipes user data. Override
// with STOCKSCOPE_DB_PATH in production (e.g. a mounted volume).
const DB_PATH = process.env.STOCKSCOPE_DB_PATH ?? join(process.cwd(), '.data', 'stockscope.db');

let db: DatabaseSync | null = null;

function connect(): DatabaseSync {
  if (db) return db;
  mkdirSync(dirname(DB_PATH), { recursive: true });
  const instance = new DatabaseSync(DB_PATH);
  instance.exec('PRAGMA journal_mode = WAL;');
  instance.exec('PRAGMA foreign_keys = ON;');
  migrate(instance);
  db = instance;
  return db;
}

function migrate(d: DatabaseSync): void {
  d.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id          TEXT PRIMARY KEY,
      created_at  INTEGER NOT NULL,
      provider    TEXT,             -- 'google' for signed-in users, NULL when anonymous
      email       TEXT,
      name        TEXT,
      picture     TEXT
    );

    CREATE TABLE IF NOT EXISTS watchlist (
      user_id   TEXT NOT NULL,
      symbol    TEXT NOT NULL,
      name      TEXT NOT NULL,
      added_at  INTEGER NOT NULL,
      PRIMARY KEY (user_id, symbol),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS alerts (
      id         TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL,
      symbol     TEXT NOT NULL,
      name       TEXT NOT NULL,
      kind       TEXT NOT NULL,   -- score_above | score_below | breakout | hits_stop | move_pct
      threshold  REAL,            -- score level, or percent for move_pct
      timeframe  TEXT NOT NULL DEFAULT 'short',
      active     INTEGER NOT NULL DEFAULT 1,
      last_fired INTEGER,         -- epoch ms of the most recent trigger (cooldown)
      created_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS push_subscriptions (
      user_id   TEXT NOT NULL,
      endpoint  TEXT NOT NULL,
      p256dh    TEXT NOT NULL,
      auth      TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (endpoint),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS alert_events (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    TEXT NOT NULL,
      alert_id   TEXT,
      symbol     TEXT NOT NULL,
      title      TEXT NOT NULL,
      body       TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_events_user ON alert_events(user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_alerts_active ON alerts(active);
  `);

  // Bring pre-existing databases (created before sign-in) up to the current
  // users schema. ADD COLUMN is a no-op error if the column already exists.
  for (const col of ['provider TEXT', 'email TEXT', 'name TEXT', 'picture TEXT']) {
    try {
      d.exec(`ALTER TABLE users ADD COLUMN ${col}`);
    } catch {
      /* column already present */
    }
  }
}

/* --------------------------------------------------------------- users */

export function ensureUser(id: string): void {
  connect()
    .prepare('INSERT OR IGNORE INTO users(id, created_at) VALUES(?, ?)')
    .run(id, Date.now());
}

export interface UserProfile {
  id: string;
  provider: string | null;
  email: string | null;
  name: string | null;
  picture: string | null;
}

/** Create or update a signed-in (Google) user, returning nothing. */
export function upsertUser(u: {
  id: string;
  provider: string;
  email: string;
  name: string;
  picture: string;
}): void {
  connect()
    .prepare(
      `INSERT INTO users(id, created_at, provider, email, name, picture)
       VALUES(?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         provider = excluded.provider,
         email    = excluded.email,
         name     = excluded.name,
         picture  = excluded.picture`,
    )
    .run(u.id, Date.now(), u.provider, u.email, u.name, u.picture);
}

export function getUserProfile(id: string): UserProfile | null {
  const row = connect()
    .prepare('SELECT id, provider, email, name, picture FROM users WHERE id = ?')
    .get(id) as unknown as UserProfile | undefined;
  return row ?? null;
}

/**
 * Move a device's anonymous data onto a freshly signed-in account, so signing in
 * never appears to "lose" the watchlist and alerts built up beforehand. Rows that
 * would collide with something the account already has are dropped (OR IGNORE);
 * anything left under the old id is then removed. The account row must already
 * exist (upsertUser is called first) for the foreign keys to hold.
 */
export function migrateUserData(fromId: string, toId: string): void {
  if (fromId === toId) return;
  const d = connect();
  d.exec('BEGIN');
  try {
    d.prepare('UPDATE OR IGNORE watchlist SET user_id = ? WHERE user_id = ?').run(toId, fromId);
    d.prepare('DELETE FROM watchlist WHERE user_id = ?').run(fromId);

    d.prepare('UPDATE OR IGNORE alerts SET user_id = ? WHERE user_id = ?').run(toId, fromId);
    d.prepare('DELETE FROM alerts WHERE user_id = ?').run(fromId);

    d.prepare('UPDATE OR IGNORE push_subscriptions SET user_id = ? WHERE user_id = ?').run(
      toId,
      fromId,
    );
    d.prepare('DELETE FROM push_subscriptions WHERE user_id = ?').run(fromId);

    d.prepare('UPDATE alert_events SET user_id = ? WHERE user_id = ?').run(toId, fromId);
    d.exec('COMMIT');
  } catch (err) {
    d.exec('ROLLBACK');
    throw err;
  }
}

/* ----------------------------------------------------------- watchlist */

export interface WatchRow {
  symbol: string;
  name: string;
  added_at: number;
}

export function getWatchlist(userId: string): WatchRow[] {
  return connect()
    .prepare('SELECT symbol, name, added_at FROM watchlist WHERE user_id = ? ORDER BY added_at DESC')
    .all(userId) as unknown as WatchRow[];
}

export function addWatch(userId: string, symbol: string, name: string): void {
  connect()
    .prepare(
      'INSERT OR REPLACE INTO watchlist(user_id, symbol, name, added_at) VALUES(?, ?, ?, ?)',
    )
    .run(userId, symbol, name, Date.now());
}

export function removeWatch(userId: string, symbol: string): void {
  connect().prepare('DELETE FROM watchlist WHERE user_id = ? AND symbol = ?').run(userId, symbol);
}

/** Distinct symbols any user watches — the scheduler's work list. */
export function allWatchedSymbols(): string[] {
  const rows = connect()
    .prepare('SELECT DISTINCT symbol FROM watchlist')
    .all() as unknown as { symbol: string }[];
  return rows.map((r) => r.symbol);
}

/* -------------------------------------------------------------- alerts */

export type AlertKind = 'score_above' | 'score_below' | 'breakout' | 'hits_stop' | 'move_pct';

export interface AlertRow {
  id: string;
  user_id: string;
  symbol: string;
  name: string;
  kind: AlertKind;
  threshold: number | null;
  timeframe: string;
  active: number;
  last_fired: number | null;
  created_at: number;
}

export function getAlerts(userId: string): AlertRow[] {
  return connect()
    .prepare('SELECT * FROM alerts WHERE user_id = ? ORDER BY created_at DESC')
    .all(userId) as unknown as AlertRow[];
}

export function getActiveAlerts(): AlertRow[] {
  return connect()
    .prepare('SELECT * FROM alerts WHERE active = 1')
    .all() as unknown as AlertRow[];
}

export function addAlert(a: Omit<AlertRow, 'active' | 'last_fired' | 'created_at'>): void {
  connect()
    .prepare(
      `INSERT INTO alerts(id, user_id, symbol, name, kind, threshold, timeframe, active, last_fired, created_at)
       VALUES(?, ?, ?, ?, ?, ?, ?, 1, NULL, ?)`,
    )
    .run(a.id, a.user_id, a.symbol, a.name, a.kind, a.threshold, a.timeframe, Date.now());
}

export function removeAlert(userId: string, id: string): void {
  connect().prepare('DELETE FROM alerts WHERE user_id = ? AND id = ?').run(userId, id);
}

export function markAlertFired(id: string, at: number): void {
  connect().prepare('UPDATE alerts SET last_fired = ? WHERE id = ?').run(at, id);
}

/* ------------------------------------------------- push subscriptions */

export interface PushSub {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export function savePushSub(userId: string, sub: PushSub): void {
  connect()
    .prepare(
      `INSERT OR REPLACE INTO push_subscriptions(user_id, endpoint, p256dh, auth, created_at)
       VALUES(?, ?, ?, ?, ?)`,
    )
    .run(userId, sub.endpoint, sub.p256dh, sub.auth, Date.now());
}

export function removePushSub(endpoint: string): void {
  connect().prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').run(endpoint);
}

export function getPushSubs(userId: string): PushSub[] {
  return connect()
    .prepare('SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?')
    .all(userId) as unknown as PushSub[];
}

export function userHasPush(userId: string): boolean {
  const row = connect()
    .prepare('SELECT COUNT(*) AS n FROM push_subscriptions WHERE user_id = ?')
    .get(userId) as unknown as { n: number };
  return row.n > 0;
}

/* --------------------------------------------------------- alert log */

export function logEvent(e: {
  userId: string;
  alertId: string | null;
  symbol: string;
  title: string;
  body: string;
}): void {
  connect()
    .prepare(
      `INSERT INTO alert_events(user_id, alert_id, symbol, title, body, created_at)
       VALUES(?, ?, ?, ?, ?, ?)`,
    )
    .run(e.userId, e.alertId, e.symbol, e.title, e.body, Date.now());
}

export interface EventRow {
  id: number;
  symbol: string;
  title: string;
  body: string;
  created_at: number;
}

export function recentEvents(userId: string, limit = 30): EventRow[] {
  return connect()
    .prepare(
      'SELECT id, symbol, title, body, created_at FROM alert_events WHERE user_id = ? ORDER BY created_at DESC LIMIT ?',
    )
    .all(userId, limit) as unknown as EventRow[];
}
