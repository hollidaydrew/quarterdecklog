import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

const DB_PATH = process.env.DB_PATH || '/data/quarterdecklog.db';

// Ensure the parent directory exists (matters when the volume mount is fresh)
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// --- Base schema (v0.1.0). Safe to run on every start. ---
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    display_name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    is_admin INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    color TEXT NOT NULL DEFAULT '#5B7CFA',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body TEXT NOT NULL,
    entry_date TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_entries_date ON entries(entry_date);

  CREATE TABLE IF NOT EXISTS entry_tags (
    entry_id INTEGER NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
    tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (entry_id, tag_id)
  );

  CREATE TABLE IF NOT EXISTS invites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token TEXT UNIQUE NOT NULL,
    created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL,
    used_at TEXT,
    used_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// --- v0.2.0 migrations ---
// Additive only: existing users, entries, tags and pending invites are never
// rewritten. Each step checks first, so it is safe to run on every start.
function addColumnIfMissing(table, column, definition) {
  const exists = db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === column);
  if (!exists) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

db.transaction(() => {
  // Set when an admin issues a temporary password; the user must choose a new one.
  addColumnIfMissing('users', 'must_change_password', 'INTEGER NOT NULL DEFAULT 0');
  // Last view the user used ('list' or 'calendar'); list is the default.
  addColumnIfMissing('users', 'preferred_view', "TEXT NOT NULL DEFAULT 'list'");
  // The admin whose invite this user joined through. Replaces used-invite rows.
  addColumnIfMissing('users', 'invited_by', 'INTEGER REFERENCES users(id) ON DELETE SET NULL');
  // Deleted users are kept as an anonymous tombstone so the log's entries keep
  // their author attribution. They can no longer sign in.
  addColumnIfMissing('users', 'deleted_at', 'TEXT');

  // Used invites are no longer stored; joining now records invited_by on the
  // user and removes the invite. Pending (unused) invites are left untouched.
  db.prepare('DELETE FROM invites WHERE used_at IS NOT NULL').run();

  // --- v0.4.0 ---
  // When the user last signed in (UTC). Null until their next sign-in.
  addColumnIfMissing('users', 'last_login_at', 'TEXT');
})();

// v0.4.0: rolling activity log (newest rows are kept, 5,000 since v0.5.0; see activity.js)
// and a small key/value table used to notice when the app version changes.
db.exec(`
  CREATE TABLE IF NOT EXISTS activity_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    actor_id INTEGER,
    actor_name TEXT NOT NULL,
    action TEXT NOT NULL,
    summary TEXT NOT NULL,
    details TEXT
  );

  CREATE TABLE IF NOT EXISTS app_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

// --- v0.8.0: API access ---
// Additive only. Existing users, entries and tags are never rewritten.
//  * users.is_system marks the built-in "System" account that owns every entry
//    written through the API. It has no usable password and can never sign in.
//  * api_keys holds the keys admins create. Only a SHA-256 hash of each key is
//    stored, never the key itself, so a copy of the database can't be used to
//    call the API.
addColumnIfMissing('users', 'is_system', 'INTEGER NOT NULL DEFAULT 0');

db.exec(`
  CREATE TABLE IF NOT EXISTS api_keys (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    key_prefix TEXT NOT NULL,
    key_hash TEXT UNIQUE NOT NULL,
    scope TEXT NOT NULL CHECK (scope IN ('read', 'write')),
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_by_name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at TEXT,
    last_used_at TEXT,
    revoked_at TEXT
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_api_keys_name ON api_keys(name COLLATE NOCASE) WHERE revoked_at IS NULL;
`);

// Creates the System user once. If a real user already holds the username
// "system", a different username is used so nobody's account is touched.
export const SYSTEM_USER_ID = db.transaction(() => {
  const existing = db.prepare('SELECT id FROM users WHERE is_system = 1').get();
  if (existing) return existing.id;
  let username = 'system';
  for (let n = 2; db.prepare('SELECT 1 FROM users WHERE username = ?').get(username); n++) {
    username = `system-${n}`;
  }
  return Number(
    db
      .prepare("INSERT INTO users (username, display_name, password_hash, is_admin, is_system) VALUES (?, 'System', '!', 0, 1)")
      .run(username).lastInsertRowid
  );
})();

// --- v0.10.0: since-last-sign-in, edited marker, pinned notes, filters ---
// Additive only. edited_at is set only when an entry's text or tags really
// change (updated_at moves on every save, so it can't be used for this).
// pinned_by_name is kept as text so deleting a person doesn't blank it.
addColumnIfMissing('entries', 'edited_at', 'TEXT');
addColumnIfMissing('entries', 'pinned_at', 'TEXT');
addColumnIfMissing('entries', 'pinned_by_name', 'TEXT');
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_entries_created ON entries(created_at);
  CREATE INDEX IF NOT EXISTS idx_entry_tags_tag ON entry_tags(tag_id);
`);
