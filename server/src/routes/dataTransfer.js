import { db, SYSTEM_USER_ID } from '../db.js';
import { requireAdmin } from '../middleware/auth.js';
import { sanitizeEntryBody } from '../utils/sanitize.js';
import { isValidDateString } from '../utils/date.js';
import { logActivity, APP_VERSION } from '../activity.js';

// Admin export and restore of the whole log (entries, tags and who wrote them).
//
// The export holds no secrets: no password hashes, API keys, sessions, invites
// or Activity log. The import treats the file as hostile: it must match the
// format exactly, every entry body is cleaned again, sizes are capped, and it
// only ever ADDS. Nothing existing is changed or deleted, and the whole import
// is one database transaction, so a bad file changes nothing.

const FORMAT = 'quarterdecklog-export';
const FORMAT_VERSION = 1;
const MAX_BYTES = 50 * 1024 * 1024;
const MAX_ENTRIES = 100000;
const MAX_USERS = 5000;
const MAX_TAGS = 2000;
const MAX_BODY_CHARS = 100000;
const MAX_TAGS_PER_ENTRY = 20;
const SQL_TIME_RE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isString = (v, min, max) => typeof v === 'string' && v.length >= min && v.length <= max;

function validTime(value) {
  if (typeof value !== 'string' || !SQL_TIME_RE.test(value)) return false;
  return isValidDateString(value.slice(0, 10)) && Number(value.slice(11, 13)) < 24 && Number(value.slice(14, 16)) < 60 && Number(value.slice(17, 19)) < 60;
}

// Checks the file and returns the cleaned data, or { error } naming the first problem.
function validate(data) {
  if (!isObject(data) || data.format !== FORMAT) return { error: 'This is not a QuarterDeckLog export file.' };
  if (data.version !== FORMAT_VERSION) {
    return { error: `This export is version ${String(data.version).slice(0, 20)}; this server reads version ${FORMAT_VERSION}.` };
  }
  if (!Array.isArray(data.users) || !Array.isArray(data.tags) || !Array.isArray(data.entries)) {
    return { error: 'The file is missing its people, tags or entries.' };
  }
  if (data.users.length > MAX_USERS) return { error: `The file has more than ${MAX_USERS} people.` };
  if (data.tags.length > MAX_TAGS) return { error: `The file has more than ${MAX_TAGS} tags.` };
  if (data.entries.length > MAX_ENTRIES) return { error: `The file has more than ${MAX_ENTRIES.toLocaleString('en-US')} entries.` };

  const users = new Map();
  for (const [i, u] of data.users.entries()) {
    if (!isObject(u) || !isString(u.username, 1, 64) || !isString(u.display_name, 1, 100)) {
      return { error: `Person ${i + 1} is not valid.` };
    }
    if (users.has(u.username)) return { error: `Person ${i + 1} repeats a username.` };
    users.set(u.username, { username: u.username, display_name: u.display_name.trim() || u.username, system: u.system === true });
  }

  const tags = new Map();
  for (const [i, t] of data.tags.entries()) {
    if (!isObject(t) || !isString(t.name, 1, 100) || !t.name.trim() || !COLOR_RE.test(t.color)) {
      return { error: `Tag ${i + 1} is not valid.` };
    }
    const key = t.name.trim().toLowerCase();
    if (tags.has(key)) return { error: `Tag ${i + 1} repeats a name.` };
    tags.set(key, { name: t.name.trim(), color: t.color });
  }

  const entries = [];
  for (const [i, e] of data.entries.entries()) {
    const n = i + 1;
    if (!isObject(e)) return { error: `Entry ${n} is not valid.` };
    if (typeof e.author !== 'string' || !users.has(e.author)) return { error: `Entry ${n} names a person who is not in the file.` };
    if (!isValidDateString(e.entry_date)) return { error: `Entry ${n} has an invalid date.` };
    if (!validTime(e.created_at)) return { error: `Entry ${n} has an invalid written time.` };
    const updated = e.updated_at === undefined || e.updated_at === null ? e.created_at : e.updated_at;
    if (!validTime(updated)) return { error: `Entry ${n} has an invalid updated time.` };
    if (e.edited_at !== undefined && e.edited_at !== null && !validTime(e.edited_at)) return { error: `Entry ${n} has an invalid edited time.` };
    if (!isString(e.body, 1, MAX_BODY_CHARS)) return { error: `Entry ${n} has no text, or too much.` };
    const body = sanitizeEntryBody(e.body);
    if (!body) return { error: `Entry ${n} has no text after cleaning.` };
    if (e.tags !== undefined && (!Array.isArray(e.tags) || e.tags.length > MAX_TAGS_PER_ENTRY)) {
      return { error: `Entry ${n} has an invalid tag list.` };
    }
    const tagKeys = [];
    for (const name of e.tags || []) {
      const key = typeof name === 'string' ? name.trim().toLowerCase() : '';
      if (!tags.has(key)) return { error: `Entry ${n} uses a tag that is not in the file.` };
      if (!tagKeys.includes(key)) tagKeys.push(key);
    }
    entries.push({
      author: e.author,
      entry_date: e.entry_date,
      created_at: e.created_at,
      updated_at: updated,
      edited_at: e.edited_at || null,
      body,
      tagKeys,
    });
  }
  return { users, tags, entries };
}

const findUser = (username) => db.prepare('SELECT id FROM users WHERE username = ? AND is_system = 0').get(username);
const isDuplicate = (authorId, e) =>
  !!db
    .prepare('SELECT 1 FROM entries WHERE author_id = ? AND entry_date = ? AND created_at = ? AND body = ?')
    .get(authorId, e.entry_date, e.created_at, e.body);

// What an import would do, without changing anything.
function plan({ users, tags, entries }) {
  const peopleToCreate = [...users.values()].filter((u) => !u.system && !findUser(u.username)).length;
  const tagsToCreate = [...tags.keys()].filter((key) => !db.prepare('SELECT 1 FROM tags WHERE lower(trim(name)) = ?').get(key)).length;
  const authorIds = new Map();
  for (const u of users.values()) authorIds.set(u.username, u.system ? SYSTEM_USER_ID : (findUser(u.username) || {}).id || null);
  let toAdd = 0;
  const seen = new Set();
  for (const e of entries) {
    const key = JSON.stringify([e.author, e.entry_date, e.created_at, e.body]);
    if (seen.has(key)) continue;
    seen.add(key);
    const authorId = authorIds.get(e.author);
    if (authorId && isDuplicate(authorId, e)) continue;
    toAdd += 1;
  }
  return { people: peopleToCreate, tags: tagsToCreate, entries: toAdd, alreadyThere: entries.length - toAdd, total: entries.length };
}

function apply({ users, tags, entries }) {
  const tagIds = new Map();
  let tagsCreated = 0;
  for (const [key, t] of tags) {
    const existing = db.prepare('SELECT id FROM tags WHERE lower(trim(name)) = ?').get(key);
    if (existing) {
      tagIds.set(key, existing.id);
    } else {
      tagIds.set(key, Number(db.prepare('INSERT INTO tags (name, color) VALUES (?, ?)').run(t.name, t.color).lastInsertRowid));
      tagsCreated += 1;
    }
  }

  // People who are not here yet are created as locked accounts that can never
  // sign in (a removed-user record), so their entries keep their author.
  const authorIds = new Map();
  let peopleCreated = 0;
  for (const u of users.values()) {
    if (u.system) {
      authorIds.set(u.username, SYSTEM_USER_ID);
      continue;
    }
    const existing = findUser(u.username);
    if (existing) {
      authorIds.set(u.username, existing.id);
      continue;
    }
    // The internal System account owns the username "system"; give a person
    // with that name a different one rather than fail.
    let username = u.username;
    for (let n = 2; db.prepare('SELECT 1 FROM users WHERE username = ?').get(username); n++) username = `${u.username}-${n}`;
    const created = db
      .prepare(
        "INSERT INTO users (username, display_name, password_hash, is_admin, deleted_at) VALUES (?, ?, '!', 0, datetime('now'))"
      )
      .run(username, u.display_name);
    authorIds.set(u.username, Number(created.lastInsertRowid));
    peopleCreated += 1;
  }

  let added = 0;
  const insert = db.prepare(
    'INSERT INTO entries (author_id, body, entry_date, created_at, updated_at, edited_at) VALUES (?, ?, ?, ?, ?, ?)'
  );
  const link = db.prepare('INSERT OR IGNORE INTO entry_tags (entry_id, tag_id) VALUES (?, ?)');
  for (const e of entries) {
    const authorId = authorIds.get(e.author);
    if (isDuplicate(authorId, e)) continue;
    const id = insert.run(authorId, e.body, e.entry_date, e.created_at, e.updated_at, e.edited_at).lastInsertRowid;
    for (const key of e.tagKeys) link.run(id, tagIds.get(key));
    added += 1;
  }
  return { people: peopleCreated, tags: tagsCreated, entries: added, alreadyThere: entries.length - added, total: entries.length };
}

const LIMIT = { rateLimit: { max: 10, timeWindow: '1 minute' } };

export default async function dataTransferRoutes(fastify) {
  // A file download. The browser sends the sign-in cookie with the link.
  fastify.get('/api/admin/export', { preHandler: requireAdmin, config: LIMIT }, async (request, reply) => {
    const count = db.prepare('SELECT COUNT(*) AS n FROM entries').get().n;
    if (count > MAX_ENTRIES) {
      return reply.code(413).send({ error: `The log has more than ${MAX_ENTRIES.toLocaleString('en-US')} entries, which is more than one export file holds.` });
    }
    const entryRows = db
      .prepare(
        `SELECT entries.id, entries.body, entries.entry_date, entries.created_at, entries.updated_at, entries.edited_at,
                users.username AS author
         FROM entries JOIN users ON users.id = entries.author_id
         ORDER BY entries.created_at, entries.id`
      )
      .all();
    const tagRows = db.prepare('SELECT name, color FROM tags ORDER BY name COLLATE NOCASE').all();
    const tagsByEntry = new Map();
    for (const r of db
      .prepare('SELECT entry_tags.entry_id, tags.name FROM entry_tags JOIN tags ON tags.id = entry_tags.tag_id ORDER BY tags.name COLLATE NOCASE')
      .all()) {
      if (!tagsByEntry.has(r.entry_id)) tagsByEntry.set(r.entry_id, []);
      tagsByEntry.get(r.entry_id).push(r.name);
    }
    const people = db
      .prepare(
        `SELECT username, display_name, is_system AS system FROM users
         WHERE id IN (SELECT DISTINCT author_id FROM entries) ORDER BY id`
      )
      .all()
      .map((u) => ({ username: u.username, display_name: u.display_name, system: !!u.system }));

    const out = {
      format: FORMAT,
      version: FORMAT_VERSION,
      app_version: APP_VERSION,
      exported_at: new Date().toISOString(),
      users: people,
      tags: tagRows,
      entries: entryRows.map((e) => ({
        author: e.author,
        entry_date: e.entry_date,
        created_at: e.created_at,
        updated_at: e.updated_at,
        edited_at: e.edited_at,
        body: e.body,
        tags: tagsByEntry.get(e.id) || [],
      })),
    };
    logActivity(request.user, 'log_exported', `${request.user.display_name} exported the log`, {
      entries: out.entries.length,
      tags: out.tags.length,
    });
    reply
      .header('Content-Type', 'application/json; charset=utf-8')
      .header('Content-Disposition', `attachment; filename="quarterdecklog-export-${out.exported_at.slice(0, 10)}.json"`);
    return JSON.stringify(out);
  });

  fastify.post(
    '/api/admin/import/preview',
    { preHandler: requireAdmin, bodyLimit: MAX_BYTES, config: LIMIT },
    async (request, reply) => {
      const checked = validate(request.body);
      if (checked.error) return reply.code(400).send({ error: checked.error });
      return plan(checked);
    }
  );

  fastify.post('/api/admin/import', { preHandler: requireAdmin, bodyLimit: MAX_BYTES, config: LIMIT }, async (request, reply) => {
    const checked = validate(request.body);
    if (checked.error) return reply.code(400).send({ error: checked.error });
    const result = db.transaction(() => apply(checked))();
    logActivity(request.user, 'log_imported', `${request.user.display_name} imported a log file`, {
      entries_added: result.entries,
      entries_already_there: result.alreadyThere,
      tags_added: result.tags,
      people_added: result.people,
    });
    return result;
  });
}
