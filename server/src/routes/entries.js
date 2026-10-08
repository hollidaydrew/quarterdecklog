import { db } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { sanitizeEntryBody } from '../utils/sanitize.js';
import { isValidDateString, isValidYearMonth, isFutureEntryDate } from '../utils/date.js';
import { htmlToText, logActivity, usDate } from '../activity.js';
import { parseSearchQuery } from '../utils/searchQuery.js';
import { SEARCH_AVAILABLE, indexEntry, indexStatus, removeFromIndex } from '../searchIndex.js';

// Most entries the by-tag page returns; keep in step with LIMIT in web/src/pages/TagPage.jsx.
const BY_TAG_LIMIT = 1000;
// Most entries the Rollup page returns for one date range.
const ROLLUP_LIMIT = 5000;
// Rollup and Search can be narrowed to some tags (an entry with ANY of them
// stays, like the day view) and to one author. The ids are checked as plain
// numbers and every value reaches SQL as a bound parameter.
const MAX_FILTER_TAGS = 20;
const ID_RE = /^\d{1,9}$/;
const MAX_PINNED = 5;
// Most entries one search returns (the same as the Rollup limit).
const SEARCH_LIMIT = 5000;

function parseEntryFilters(query) {
  let tagIds = [];
  if (query.tag_ids !== undefined && query.tag_ids !== '') {
    const parts = typeof query.tag_ids === 'string' ? query.tag_ids.split(',') : [];
    if (!parts.length || parts.length > MAX_FILTER_TAGS || !parts.every((p) => ID_RE.test(p))) {
      return { error: `tag_ids must be up to ${MAX_FILTER_TAGS} comma-separated tag numbers` };
    }
    tagIds = [...new Set(parts.map(Number))];
  }
  let authorId = null;
  if (query.author_id !== undefined && query.author_id !== '') {
    if (!ID_RE.test(String(query.author_id))) return { error: 'author_id must be a number' };
    authorId = Number(query.author_id);
  }
  return { tagIds, authorId };
}

// The extra WHERE conditions (each starting with AND) and their parameters.
function filterClause({ tagIds, authorId }) {
  let sql = '';
  const params = [];
  if (authorId !== null) {
    sql += ' AND entries.author_id = ?';
    params.push(authorId);
  }
  if (tagIds.length) {
    sql += ` AND entries.id IN (SELECT entry_id FROM entry_tags WHERE tag_id IN (${tagIds.map(() => '?').join(',')}))`;
    params.push(...tagIds);
  }
  return { sql, params };
}

export function attachTags(entry) {
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
export function entrySnapshot(body, tagNames) {
  return { text: htmlToText(body), tags: tagNames };
}

export function tagNamesFor(entryId) {
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

  // Every entry in a date range, newest day first (and newest first within a
  // day, like the day view). Feeds the Rollup page. `truncated` is true when
  // the range holds more than ROLLUP_LIMIT entries and the oldest were left out.
  fastify.get('/api/entries/rollup', { preHandler: requireAuth }, async (request, reply) => {
    const { from, to } = request.query;
    if (!isValidDateString(from) || !isValidDateString(to) || from > to) {
      return reply.code(400).send({ error: 'from and to must be valid YYYY-MM-DD dates, with from on or before to' });
    }
    const filters = parseEntryFilters(request.query);
    if (filters.error) return reply.code(400).send({ error: filters.error });
    const extra = filterClause(filters);
    const rows = db
      .prepare(
        `SELECT entries.*, users.display_name AS author_name, users.username AS author_username,
                (users.deleted_at IS NOT NULL) AS author_deleted
         FROM entries
         JOIN users ON users.id = entries.author_id
         WHERE entries.entry_date >= ? AND entries.entry_date <= ?${extra.sql}
         ORDER BY entries.entry_date DESC, entries.created_at DESC, entries.id DESC
         LIMIT ?`
      )
      .all(from, to, ...extra.params, ROLLUP_LIMIT + 1);
    const truncated = rows.length > ROLLUP_LIMIT;
    return { entries: rows.slice(0, ROLLUP_LIMIT).map(attachTags), truncated };
  });

  // "Since you last signed in": entries other people (and the API) added after
  // this person's PREVIOUS sign-in, grouped by day. The time comes from the
  // session, not the browser, so it can't be asked for with someone else's.
  // Entries are counted by when they were written, so a late entry for an old
  // day still counts as new.
  fastify.get('/api/entries/since', { preHandler: requireAuth }, async (request) => {
    const since = request.session.previousLoginAt || null;
    if (!since) return { since: null, total: 0, days: [] };
    const total = db
      .prepare('SELECT COUNT(*) AS n FROM entries WHERE created_at > ? AND author_id != ?')
      .get(since, request.user.id).n;
    const days = db
      .prepare(
        `SELECT entry_date, COUNT(*) AS count FROM entries
         WHERE created_at > ? AND author_id != ?
         GROUP BY entry_date ORDER BY entry_date DESC LIMIT 60`
      )
      .all(since, request.user.id);
    return { since, total, days };
  });

  // Everyone who has written an entry, for the Rollup and Search author filter.
  // Deleted people and System are included because their entries still exist.
  fastify.get('/api/entries/authors', { preHandler: requireAuth }, async () => {
    return db
      .prepare(
        `SELECT id, display_name AS name, (deleted_at IS NOT NULL) AS deleted, is_system AS system
         FROM users WHERE id IN (SELECT DISTINCT author_id FROM entries)
         ORDER BY is_system, name COLLATE NOCASE`
      )
      .all()
      .map((u) => ({ id: u.id, name: u.name, deleted: !!u.deleted, system: !!u.system }));
  });

  // Pinned standing notes: a few entries kept at the top of the log.
  fastify.get('/api/entries/pinned', { preHandler: requireAuth }, async () => {
    const rows = db
      .prepare(
        `SELECT entries.*, users.display_name AS author_name, users.username AS author_username,
                (users.deleted_at IS NOT NULL) AS author_deleted
         FROM entries
         JOIN users ON users.id = entries.author_id
         WHERE entries.pinned_at IS NOT NULL
         ORDER BY entries.pinned_at DESC, entries.id DESC`
      )
      .all();
    return rows.map(attachTags);
  });

  // Anyone signed in can pin or unpin: it is a shared team note. Pinning is not
  // an edit, so it leaves the entry's text, edited marker and times alone. The
  // limit is checked inside the same transaction as the change, so two people
  // pinning at once can't go past it.
  fastify.put('/api/entries/:id/pin', { preHandler: requireAuth }, async (request, reply) => {
    const { pinned } = request.body || {};
    if (typeof pinned !== 'boolean') return reply.code(400).send({ error: 'pinned must be true or false' });
    const outcome = db.transaction(() => {
      const entry = db.prepare('SELECT * FROM entries WHERE id = ?').get(request.params.id);
      if (!entry) return { status: 404, error: 'Entry not found' };
      if (!!entry.pinned_at === pinned) return { entry, changed: false };
      if (pinned) {
        const count = db.prepare('SELECT COUNT(*) AS n FROM entries WHERE pinned_at IS NOT NULL').get().n;
        if (count >= MAX_PINNED) {
          return { status: 409, error: `Only ${MAX_PINNED} entries can be pinned at once. Unpin one first.` };
        }
        db.prepare("UPDATE entries SET pinned_at = datetime('now'), pinned_by_name = ? WHERE id = ?").run(
          request.user.display_name,
          entry.id
        );
      } else {
        db.prepare('UPDATE entries SET pinned_at = NULL, pinned_by_name = NULL WHERE id = ?').run(entry.id);
      }
      return { entry, changed: true };
    })();
    if (outcome.error) return reply.code(outcome.status).send({ error: outcome.error });
    if (outcome.changed) {
      const { entry } = outcome;
      logActivity(
        request.user,
        pinned ? 'entry_pinned' : 'entry_unpinned',
        `${request.user.display_name} ${pinned ? 'pinned' : 'unpinned'} an entry for ${usDate(entry.entry_date)}`,
        { entry_id: entry.id, entry_date: entry.entry_date }
      );
    }
    return { ok: true, pinned };
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
         ORDER BY entries.created_at DESC, entries.id DESC`
      )
      .all(date);
    return rows.map(attachTags);
  });

  // Every entry that uses the named tag (case-insensitive), newest first. Used
  // by the easter egg tag pages (see web/src/lib/easterEggTags.js).
  fastify.get('/api/entries/by-tag', { preHandler: requireAuth }, async (request, reply) => {
    const name = typeof request.query.name === 'string' ? request.query.name.trim().toLowerCase() : '';
    if (!name || name.length > 100) {
      return reply.code(400).send({ error: 'A tag name is required' });
    }
    const rows = db
      .prepare(
        `SELECT entries.*, users.display_name AS author_name, users.username AS author_username,
                (users.deleted_at IS NOT NULL) AS author_deleted
         FROM entries
         JOIN users ON users.id = entries.author_id
         WHERE entries.id IN (
           SELECT entry_tags.entry_id FROM entry_tags
           JOIN tags ON tags.id = entry_tags.tag_id
           WHERE lower(trim(tags.name)) = ?
         )
         ORDER BY entries.entry_date DESC, entries.created_at DESC, entries.id DESC
         LIMIT ?`
      )
      .all(name, BY_TAG_LIMIT);
    return rows.map(attachTags);
  });

  // Search. Words typed must all appear (from the start of a word) in an entry's
  // text or tag names; "quoted words" must appear together; a leading minus
  // leaves a word out. Matching is done by the full-text index (searchIndex.js).
  // Optional date range, tags, person and sort, like Rollup. Returns whole
  // entries (the newest or oldest SEARCH_LIMIT of them), so the page can show,
  // print and export them. `terms` is what to highlight. `indexing` is set only
  // while the index is still being built after an upgrade.
  fastify.get(
    '/api/entries/search',
    { preHandler: requireAuth, config: { rateLimit: { max: 120, timeWindow: '1 minute' } } },
    async (request, reply) => {
      if (!SEARCH_AVAILABLE) return reply.code(503).send({ error: 'Search is unavailable on this server.' });
      const q = typeof request.query.q === 'string' ? request.query.q.trim() : '';
      if (q.length < 2 || q.length > 100) {
        return reply.code(400).send({ error: 'Search for 2 to 100 characters' });
      }
      const parsed = parseSearchQuery(q);
      if (parsed.error) return reply.code(400).send({ error: parsed.error });
      const filters = parseEntryFilters(request.query);
      if (filters.error) return reply.code(400).send({ error: filters.error });
      const extra = filterClause(filters);

      const { from, to } = request.query;
      let dateSql = '';
      const dateParams = [];
      if (from !== undefined && from !== '') {
        if (!isValidDateString(from)) return reply.code(400).send({ error: 'from must be a valid YYYY-MM-DD date' });
        dateSql += ' AND entries.entry_date >= ?';
        dateParams.push(from);
      }
      if (to !== undefined && to !== '') {
        if (!isValidDateString(to)) return reply.code(400).send({ error: 'to must be a valid YYYY-MM-DD date' });
        dateSql += ' AND entries.entry_date <= ?';
        dateParams.push(to);
      }
      if (dateParams.length === 2 && from > to) {
        return reply.code(400).send({ error: 'from must be on or before to' });
      }
      const dir = request.query.sort === 'oldest' ? 'ASC' : 'DESC';

      const rows = db
        .prepare(
          `SELECT entries.*, users.display_name AS author_name, users.username AS author_username,
                  (users.deleted_at IS NOT NULL) AS author_deleted
           FROM entry_search
           JOIN entries ON entries.id = entry_search.rowid
           JOIN users ON users.id = entries.author_id
           WHERE entry_search MATCH ?${dateSql}${extra.sql}
           ORDER BY entries.entry_date ${dir}, entries.created_at ${dir}, entries.id ${dir}
           LIMIT ?`
        )
        .all(parsed.match, ...dateParams, ...extra.params, SEARCH_LIMIT + 1);
      const truncated = rows.length > SEARCH_LIMIT;
      return {
        entries: rows.slice(0, SEARCH_LIMIT).map(attachTags),
        truncated,
        terms: parsed.terms,
        indexing: indexStatus(),
      };
    }
  );

  fastify.post('/api/entries', { preHandler: requireAuth }, async (request, reply) => {
    const { body, entry_date, tag_ids } = request.body || {};
    if (!isValidDateString(entry_date)) {
      return reply.code(400).send({ error: 'entry_date must be a valid YYYY-MM-DD string' });
    }
    if (isFutureEntryDate(entry_date)) {
      return reply.code(400).send({ error: "Entries can't be dated in the future" });
    }
    const clean = sanitizeEntryBody(body);
    if (!clean) {
      return reply.code(400).send({ error: 'Entry body cannot be empty' });
    }

    const result = db
      .prepare('INSERT INTO entries (author_id, body, entry_date) VALUES (?, ?, ?)')
      .run(request.user.id, clean, entry_date);
    setEntryTags(result.lastInsertRowid, tag_ids);
    indexEntry(result.lastInsertRowid);
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
    indexEntry(entry.id);
    const afterTagIds = db.prepare('SELECT tag_id FROM entry_tags WHERE entry_id = ?').all(entry.id).map((r) => r.tag_id).sort();
    if (clean !== entry.body || beforeTagIds.join() !== afterTagIds.join()) {
      db.prepare("UPDATE entries SET edited_at = datetime('now') WHERE id = ?").run(entry.id);
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
    removeFromIndex(entry.id);
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
