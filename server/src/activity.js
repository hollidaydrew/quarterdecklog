import fs from 'node:fs';
import sanitizeHtml from 'sanitize-html';
import { db } from './db.js';

// The app version comes from server/package.json, which ships in the image.
const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
export const APP_VERSION = pkg.version;

// Only the newest MAX_ACTIVITY rows are kept; older rows are deleted as new
// ones are written.
export const MAX_ACTIVITY = 2500;
const MAX_SNAPSHOT_CHARS = 10000;

// "2026-09-18" -> "09-18-2026"
export function usDate(ymd) {
  const [y, m, d] = String(ymd).split('-');
  return `${m}-${d}-${y}`;
}

// Plain-text copy of an entry body for the activity log (line breaks kept,
// formatting dropped, capped in length).
export function htmlToText(html) {
  const withBreaks = String(html || '').replace(/<\/(div|p|li|h[1-6]|blockquote|pre)>|<br\s*\/?>/gi, '\n');
  const stripped = sanitizeHtml(withBreaks, { allowedTags: [], allowedAttributes: {} })
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
  const text = stripped.replace(/\n{3,}/g, '\n\n').trim();
  return text.length > MAX_SNAPSHOT_CHARS ? `${text.slice(0, MAX_SNAPSHOT_CHARS)}…` : text;
}

// Records one activity. actor is a user row ({ id, display_name }) or null for
// the system. A failure to write the log must never block the action itself.
export function logActivity(actor, action, summary, details = null) {
  try {
    db.prepare(
      'INSERT INTO activity_log (actor_id, actor_name, action, summary, details) VALUES (?, ?, ?, ?, ?)'
    ).run(actor ? actor.id : null, actor ? actor.display_name : 'System', action, summary, details ? JSON.stringify(details) : null);
    db.prepare(
      'DELETE FROM activity_log WHERE id <= (SELECT id FROM activity_log ORDER BY id DESC LIMIT 1 OFFSET ?)'
    ).run(MAX_ACTIVITY);
  } catch (err) {
    console.error('activity log write failed:', err.message);
  }
}

// Called once at startup: logs an entry when the running version differs from
// the last one recorded.
export function recordVersionOnStart(version = APP_VERSION) {
  const row = db.prepare("SELECT value FROM app_meta WHERE key = 'version'").get();
  if (row && row.value === version) return;
  const hasUsers = db.prepare('SELECT COUNT(*) AS n FROM users').get().n > 0;
  let summary;
  if (row) summary = `Updated from v${row.value} to v${version}`;
  else summary = hasUsers ? `Updated to v${version}` : `Installed v${version}`;
  logActivity(null, 'version_updated', summary, row ? { from: row.value, to: version } : { to: version });
  db.prepare(
    "INSERT INTO app_meta (key, value) VALUES ('version', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  ).run(version);
}
