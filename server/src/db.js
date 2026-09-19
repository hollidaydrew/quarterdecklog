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
})();
