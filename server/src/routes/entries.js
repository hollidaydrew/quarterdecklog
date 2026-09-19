import { db } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { sanitizeEntryBody } from '../utils/sanitize.js';
import { isValidDateString, isValidYearMonth } from '../utils/date.js';
import { htmlToText, logActivity, usDate } from '../activity.js';

function attachTags(entry) {
  const tags = db
    .prepare(
      `SELECT tags.id, tags.name, tags.color FROM tags
       JOIN entry_tags ON entry_tags.tag_id = tags.id
       WHERE entry_tags.entry_id = ?
       ORDER BY tags.name COLLATE NOCASE`
    )
    .all(entry.id);
  return { ...entry, tags };
}

// What the activity log keeps about an entry: plain text and tag names.
function entrySnapshot(body, tagNames) {
  return { text: htmlToText(body), tags: tagNames };
}

function tagNamesFor(entryId) {
  return attachTags({ id: entryId }).tags.map((t) => t.name);
}

function setEntryTags(entryId, tagIds) {
  db.prepare('DELETE FROM entry_tags WHERE entry_id = ?').run(entryId);
  if (!Array.isArray(tagIds) || tagIds.length === 0) return;
  const insert = db.prepare('INSERT OR IGNORE INTO entry_tags (entry_id, tag_id) VALUES (?, ?)');
  const validTagIds = new Set(db.prepare('SELECT id FROM tags').all().map((t) => t.id));
  for (const tagId of tagIds) {
    if (validTagIds.has(Number(tagId))) insert.run(entryId, Number(tagId));
  }
}

export default async function entryRoutes(fastify) {
  // Entry counts per day for the visible month, so the calendar can mark
  // which days have activity without fetching every entry up front.
  fastify.get('/api/entries/month', { preHandler: requireAuth }, async (request, reply) => {
    const { year, month } = request.query;
    if (!isValidYearMonth(year, month)) {
      return reply.code(400).send({ error: 'year and month query params are required' });
    }
    const prefix = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`;
    const rows = db
      .prepare("SELECT entry_date, COUNT(*) AS count FROM entries WHERE entry_date LIKE ? || '%' GROUP BY entry_date")
      .all(prefix);
    const counts = {};
    for (const row of rows) counts[row.entry_date] = row.count;
    return counts;
  });

  // Entry counts per day for an arbitrary date range (the list view). One
  // grouped query on the entry_date index; only days that have entries are
  // returned, and the client fills in the empty days.
  fastify.get('/api/entries/range', { preHandler: requireAuth }, async (request, reply) => {
    const { from, to } = request.query;
    if (!isValidDateString(from) || !isValidDateString(to) || from > to) {
      return reply.code(400).send({ error: 'from and to must be valid YYYY-MM-DD dates, with from on or before to' });
    }
    const rows = db
      .prepare(
        'SELECT entry_date, COUNT(*) AS count FROM entries WHERE entry_date >= ? AND entry_date <= ? GROUP BY entry_date'
      )
      .all(from, to);
    const counts = {};
    for (const row of rows) counts[row.entry_date] = row.count;
    return counts;
  });

  fastify.get('/api/entries', { preHandler: requireAuth }, async (request, reply) => {
    const { date } = request.query;
    if (!isValidDateString(date)) {
      return reply.code(400).send({ error: 'A valid date query param (YYYY-MM-DD) is required' });
    }
    const rows = db
      .prepare(
        `SELECT entries.*, users.display_name AS author_name, users.username AS author_username,
                (users.deleted_at IS NOT NULL) AS author_deleted
         FROM entries
         JOIN users ON users.id = entries.author_id
         WHERE entries.entry_date = ?
         ORDER BY entries.created_at ASC`
      )
      .all(date);
    return rows.map(attachTags);
  });

  fastify.post('/api/entries', { preHandler: requireAuth }, async (request, reply) => {
    const { body, entry_date, tag_ids } = request.body || {};
    if (!isValidDateString(entry_date)) {
      return reply.code(400).send({ error: 'entry_date must be a valid YYYY-MM-DD string' });
    }
    const clean = sanitizeEntryBody(body);
    if (!clean) {
      return reply.code(400).send({ error: 'Entry body cannot be empty' });
    }

    const result = db
      .prepare('INSERT INTO entries (author_id, body, entry_date) VALUES (?, ?, ?)')
      .run(request.user.id, clean, entry_date);
    setEntryTags(result.lastInsertRowid, tag_ids);
    logActivity(request.user, 'entry_created', `${request.user.display_name} added an entry for ${usDate(entry_date)}`, {
      entry_id: Number(result.lastInsertRowid),
      entry_date,
      after: entrySnapshot(clean, tagNamesFor(result.lastInsertRowid)),
    });

    const entry = db
      .prepare(
        `SELECT entries.*, users.display_name AS author_name, users.username AS author_username,
                (users.deleted_at IS NOT NULL) AS author_deleted
         FROM entries JOIN users ON users.id = entries.author_id WHERE entries.id = ?`
      )
      .get(result.lastInsertRowid);
    return attachTags(entry);
  });

  fastify.put('/api/entries/:id', { preHandler: requireAuth }, async (request, reply) => {
    const entry = db.prepare('SELECT * FROM entries WHERE id = ?').get(request.params.id);
    if (!entry) return reply.code(404).send({ error: 'Entry not found' });
    if (entry.author_id !== request.user.id && !request.user.is_admin) {
      return reply.code(403).send({ error: 'You can only edit your own entries' });
    }

    const { body, tag_ids } = request.body || {};
    const clean = sanitizeEntryBody(body);
    if (!clean) {
      return reply.code(400).send({ error: 'Entry body cannot be empty' });
    }

    const beforeTags = tagNamesFor(entry.id);
    const beforeTagIds = db.prepare('SELECT tag_id FROM entry_tags WHERE entry_id = ?').all(entry.id).map((r) => r.tag_id).sort();
    db.prepare("UPDATE entries SET body = ?, updated_at = datetime('now') WHERE id = ?").run(clean, entry.id);
    setEntryTags(entry.id, tag_ids);
    const afterTagIds = db.prepare('SELECT tag_id FROM entry_tags WHERE entry_id = ?').all(entry.id).map((r) => r.tag_id).sort();
    if (clean !== entry.body || beforeTagIds.join() !== afterTagIds.join()) {
      const author = db.prepare('SELECT display_name FROM users WHERE id = ?').get(entry.author_id);
      const whose = entry.author_id === request.user.id ? 'an entry' : `${author.display_name}'s entry`;
      logActivity(request.user, 'entry_updated', `${request.user.display_name} edited ${whose} for ${usDate(entry.entry_date)}`, {
        entry_id: entry.id,
        entry_date: entry.entry_date,
        author: author.display_name,
        before: entrySnapshot(entry.body, beforeTags),
        after: entrySnapshot(clean, tagNamesFor(entry.id)),
      });
    }

    const updated = db
      .prepare(
        `SELECT entries.*, users.display_name AS author_name, users.username AS author_username,
                (users.deleted_at IS NOT NULL) AS author_deleted
         FROM entries JOIN users ON users.id = entries.author_id WHERE entries.id = ?`
      )
      .get(entry.id);
    return attachTags(updated);
  });

  fastify.delete('/api/entries/:id', { preHandler: requireAuth }, async (request, reply) => {
    const entry = db.prepare('SELECT * FROM entries WHERE id = ?').get(request.params.id);
    if (!entry) return reply.code(404).send({ error: 'Entry not found' });
    if (entry.author_id !== request.user.id && !request.user.is_admin) {
      return reply.code(403).send({ error: 'You can only delete your own entries' });
    }
    const beforeTags = tagNamesFor(entry.id);
    const author = db.prepare('SELECT display_name FROM users WHERE id = ?').get(entry.author_id);
    db.prepare('DELETE FROM entries WHERE id = ?').run(entry.id);
    const whose = entry.author_id === request.user.id ? 'an entry' : `${author.display_name}'s entry`;
    logActivity(request.user, 'entry_deleted', `${request.user.display_name} deleted ${whose} for ${usDate(entry.entry_date)}`, {
      entry_id: entry.id,
      entry_date: entry.entry_date,
      author: author.display_name,
      before: entrySnapshot(entry.body, beforeTags),
    });
    return { ok: true };
  });
}
