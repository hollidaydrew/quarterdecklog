import { db } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { sanitizeEntryBody } from '../utils/sanitize.js';
import { isValidDateString, isValidYearMonth } from '../utils/date.js';

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

  fastify.get('/api/entries', { preHandler: requireAuth }, async (request, reply) => {
    const { date } = request.query;
    if (!isValidDateString(date)) {
      return reply.code(400).send({ error: 'A valid date query param (YYYY-MM-DD) is required' });
    }
    const rows = db
      .prepare(
        `SELECT entries.*, users.display_name AS author_name, users.username AS author_username
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
      .run(request.session.user.id, clean, entry_date);
    setEntryTags(result.lastInsertRowid, tag_ids);

    const entry = db
      .prepare(
        `SELECT entries.*, users.display_name AS author_name, users.username AS author_username
         FROM entries JOIN users ON users.id = entries.author_id WHERE entries.id = ?`
      )
      .get(result.lastInsertRowid);
    return attachTags(entry);
  });

  fastify.put('/api/entries/:id', { preHandler: requireAuth }, async (request, reply) => {
    const entry = db.prepare('SELECT * FROM entries WHERE id = ?').get(request.params.id);
    if (!entry) return reply.code(404).send({ error: 'Entry not found' });
    if (entry.author_id !== request.session.user.id && !request.session.user.is_admin) {
      return reply.code(403).send({ error: 'You can only edit your own entries' });
    }

    const { body, tag_ids } = request.body || {};
    const clean = sanitizeEntryBody(body);
    if (!clean) {
      return reply.code(400).send({ error: 'Entry body cannot be empty' });
    }

    db.prepare("UPDATE entries SET body = ?, updated_at = datetime('now') WHERE id = ?").run(clean, entry.id);
    setEntryTags(entry.id, tag_ids);

    const updated = db
      .prepare(
        `SELECT entries.*, users.display_name AS author_name, users.username AS author_username
         FROM entries JOIN users ON users.id = entries.author_id WHERE entries.id = ?`
      )
      .get(entry.id);
    return attachTags(updated);
  });

  fastify.delete('/api/entries/:id', { preHandler: requireAuth }, async (request, reply) => {
    const entry = db.prepare('SELECT * FROM entries WHERE id = ?').get(request.params.id);
    if (!entry) return reply.code(404).send({ error: 'Entry not found' });
    if (entry.author_id !== request.session.user.id && !request.session.user.is_admin) {
      return reply.code(403).send({ error: 'You can only delete your own entries' });
    }
    db.prepare('DELETE FROM entries WHERE id = ?').run(entry.id);
    return { ok: true };
  });
}
