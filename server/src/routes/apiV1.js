import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { db, SYSTEM_USER_ID } from '../db.js';
import { requireAdmin } from '../middleware/auth.js';
import { requireApiKey } from '../middleware/apiKey.js';
import { sanitizeEntryBody } from '../utils/sanitize.js';
import { isValidDateString, isFutureEntryDate } from '../utils/date.js';
import { htmlToText, logActivity, usDate, APP_VERSION } from '../activity.js';
import { attachTags, entrySnapshot, tagNamesFor } from './entries.js';
import { CSP } from '../csp.js';


const COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const MAX_TEXT = 50000;
const MAX_HTML = 100000;
const MAX_TAGS_PER_ENTRY = 20;
const MAX_TAG_NAME = 100;
const DEFAULT_PAGE = 100;
const MAX_PAGE = 500;

// Every API call, good or bad, counts against this per-address limit, which is
// what slows down someone guessing keys. Each key also has its own limit.
const ADDRESS_LIMIT = { rateLimit: { max: 120, timeWindow: '1 minute' } };

const isoUtc = (sqlite) => `${sqlite.replace(' ', 'T')}Z`;

// --- JSON schemas: these both validate requests and build the API Docs page ---
const errorSchema = {
  type: 'object',
  properties: { error: { type: 'string' } },
  required: ['error'],
};
const tagSchema = {
  type: 'object',
  properties: {
    id: { type: 'integer' },
    name: { type: 'string' },
    color: { type: 'string', description: 'Hex colour such as #5B7CFA' },
  },
  required: ['id', 'name', 'color'],
};
const entrySchema = {
  type: 'object',
  properties: {
    id: { type: 'integer' },
    entry_date: { type: 'string', description: 'The day the entry belongs to (YYYY-MM-DD)' },
    text: { type: 'string', description: 'The entry as plain text' },
    html: { type: 'string', description: 'The entry as stored (cleaned HTML)' },
    tags: { type: 'array', items: tagSchema },
    author: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        is_system: { type: 'boolean', description: 'True for entries written through the API' },
      },
      required: ['name', 'is_system'],
    },
    created_at: { type: 'string', description: 'UTC, ISO 8601' },
    updated_at: { type: 'string', description: 'UTC, ISO 8601' },
  },
  required: ['id', 'entry_date', 'text', 'html', 'tags', 'author', 'created_at', 'updated_at'],
};
const security = [{ bearerAuth: [] }];
const errors = (...codes) =>
  Object.fromEntries(codes.map((c) => [c, { ...errorSchema, description: ERROR_TEXT[c] }]));
const ERROR_TEXT = {
  400: 'The request was not valid',
  401: 'Missing, wrong, expired or revoked API key',
  403: 'The key does not allow this (read-only key, or an entry not written through the API)',
  404: 'Not found',
  409: 'Conflict',
  429: 'Too many requests',
};
const bodyFields = {
  text: {
    type: 'string',
    minLength: 1,
    maxLength: MAX_TEXT,
    description: 'Plain text. Line breaks are kept; nothing in it is treated as HTML. Send either text or html.',
  },
  html: {
    type: 'string',
    minLength: 1,
    maxLength: MAX_HTML,
    description:
      'HTML, cleaned the same way as the entry editor: only basic formatting, lists, headings, quotes, code and http/https/mailto links survive. Send either text or html.',
  },
  tags: {
    type: 'array',
    maxItems: MAX_TAGS_PER_ENTRY,
    items: { type: 'string', minLength: 1, maxLength: MAX_TAG_NAME },
    description: 'Names of existing tags (not case-sensitive). An unknown name is refused; create it first with POST /api/v1/tags.',
  },
  tag_ids: {
    type: 'array',
    maxItems: MAX_TAGS_PER_ENTRY,
    items: { type: 'integer' },
    description: 'Ids of existing tags. May be combined with tags.',
  },
};

// Plain text -> the same HTML shape the editor saves: one div per line.
function textToHtml(text) {
  const escape = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  return text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => `<div>${line ? escape(line) : '<br>'}</div>`)
    .join('');
}

// Returns { clean } or { error }. Exactly one of text / html must be given.
function buildBody({ text, html }) {
  if ((text === undefined) === (html === undefined)) {
    return { error: 'Send exactly one of text or html' };
  }
  const clean = sanitizeEntryBody(text !== undefined ? textToHtml(text) : html);
  if (!clean || !htmlToText(clean)) return { error: 'Entry body cannot be empty' };
  return { clean };
}

// Turns tag names and ids into a list of tag ids, or an error naming what was not found.
function resolveTags({ tags, tag_ids }) {
  const ids = new Set();
  const missing = [];
  for (const name of tags || []) {
    const row = db.prepare('SELECT id FROM tags WHERE lower(trim(name)) = ?').get(name.trim().toLowerCase());
    if (row) ids.add(row.id);
    else missing.push(name);
  }
  for (const id of tag_ids || []) {
    if (db.prepare('SELECT 1 FROM tags WHERE id = ?').get(id)) ids.add(id);
    else missing.push(`#${id}`);
  }
  if (missing.length) return { error: `Unknown tag: ${missing.slice(0, 5).join(', ')}` };
  if (ids.size > MAX_TAGS_PER_ENTRY) return { error: `At most ${MAX_TAGS_PER_ENTRY} tags per entry` };
  return { ids: [...ids] };
}

function setEntryTags(entryId, tagIds) {
  db.prepare('DELETE FROM entry_tags WHERE entry_id = ?').run(entryId);
  const insert = db.prepare('INSERT OR IGNORE INTO entry_tags (entry_id, tag_id) VALUES (?, ?)');
  for (const id of tagIds) insert.run(entryId, id);
}

const ENTRY_SELECT = `SELECT entries.*, users.display_name AS author_name, users.is_system AS author_is_system
                      FROM entries JOIN users ON users.id = entries.author_id`;

function present(row) {
  const { tags } = attachTags({ id: row.id });
  return {
    id: row.id,
    entry_date: row.entry_date,
    text: htmlToText(row.body, Infinity),
    html: row.body,
    tags,
    author: { name: row.author_name, is_system: !!row.author_is_system },
    created_at: isoUtc(row.created_at),
    updated_at: isoUtc(row.updated_at),
  };
}

// What the Activity log shows as the actor: the key's friendly name.
const actorFor = (key) => ({ id: null, display_name: key.name });

export default async function apiV1Routes(fastify) {
  await fastify.register(swagger, {
    hideUntagged: true,
    openapi: {
      openapi: '3.0.3',
      info: {
        title: 'QuarterDeckLog API',
        version: APP_VERSION,
        description:
          'Add and read log entries and tags from scripts and other systems.\n\n' +
          '**Keys.** An admin creates a key under Admin → API keys and gives it a name. The key is shown once. ' +
          'Send it on every call as `Authorization: Bearer <key>`. A read-only key can only read; a read and write key can also add entries and tags.\n\n' +
          '**Authors.** Entries written through the API belong to the user "System". The Activity log shows the key\'s name as who did it.\n\n' +
          '**Limits.** 60 calls a minute per key (HTTP 429 with Retry-After when exceeded). Entry text is limited to ' +
          `${MAX_TEXT.toLocaleString('en-US')} characters (plain text) or ${MAX_HTML.toLocaleString('en-US')} (HTML), and ${MAX_TAGS_PER_ENTRY} tags per entry. ` +
          'Browsers on other websites are not allowed to call this API (no CORS); use it from servers and scripts.',
      },
      components: {
        securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', description: 'An API key, starting with qdl_' } },
      },
      tags: [
        { name: 'Entries', description: 'Log entries' },
        { name: 'Tags', description: 'Tags that entries can carry' },
      ],
    },
  });

  // The docs page is for admins only: it is served from this same site, behind
  // the normal sign-in. It follows the app's content-security-policy exactly.
  await fastify.register(swaggerUi, {
    routePrefix: '/api/docs',
    uiHooks: { onRequest: requireAdmin },
    staticCSP: CSP,
    // The default top bar carries another project's logo and a box for loading
    // any spec URL; neither belongs here.
    theme: { title: 'API Docs', css: [{ filename: 'qdl.css', content: '.swagger-ui .topbar { display: none; }' }] },
    uiConfig: { docExpansion: 'list', deepLinking: false, persistAuthorization: false },
  });

  // Same {error} shape as the rest of the app, and never any internal detail
  // for a server error.
  fastify.setErrorHandler((err, request, reply) => {
    const status = err.statusCode >= 400 && err.statusCode < 500 ? err.statusCode : 500;
    if (status === 500) request.log.error(err);
    reply.code(status).send({ error: status === 500 ? 'Internal server error' : err.message });
  });

  // Many HTTP clients send "Content-Type: application/json" even on calls with
  // no body (DELETE, for one). Treat an empty body as {} instead of an error.
  // Anything else is parsed by Fastify's own JSON parser, which refuses
  // __proto__ and constructor tricks.
  const parseJson = fastify.getDefaultJsonParser('error', 'error');
  fastify.removeContentTypeParser('application/json');
  fastify.addContentTypeParser('application/json', { parseAs: 'string' }, (request, body, done) => {
    if (body === '') return done(null, {});
    parseJson(request, body, done);
  });

  // Keys are checked in onRequest, before the body is read or validated, so a
  // caller without a valid key can't make the server parse a large body.
  const read = [requireApiKey('read')];
  const write = [requireApiKey('write')];

  fastify.get(
    '/api/v1/tags',
    {
      onRequest: read,
      config: ADDRESS_LIMIT,
      schema: {
        tags: ['Tags'],
        summary: 'List tags',
        security,
        response: { 200: { type: 'array', items: tagSchema }, ...errors(401, 429) },
      },
    },
    async () => db.prepare('SELECT id, name, color FROM tags ORDER BY name COLLATE NOCASE').all()
  );

  fastify.post(
    '/api/v1/tags',
    {
      onRequest: write,
      bodyLimit: 4096,
      config: ADDRESS_LIMIT,
      schema: {
        tags: ['Tags'],
        summary: 'Create a tag',
        description: 'Needs a read and write key. Tags can be created here but renamed or deleted only by an admin in the app.',
        security,
        body: {
          type: 'object',
          required: ['name'],
          properties: {
            name: { type: 'string', minLength: 1, maxLength: MAX_TAG_NAME },
            color: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$', description: 'Hex colour. Defaults to #5B7CFA.' },
          },
        },
        response: { 201: tagSchema, ...errors(400, 401, 403, 409, 429) },
      },
    },
    async (request, reply) => {
      const name = request.body.name.trim();
      if (!name) return reply.code(400).send({ error: 'Tag name is required' });
      if (db.prepare('SELECT 1 FROM tags WHERE lower(trim(name)) = ?').get(name.toLowerCase())) {
        return reply.code(409).send({ error: 'A tag with that name already exists' });
      }
      const color = request.body.color || '#5B7CFA';
      const result = db.prepare('INSERT INTO tags (name, color) VALUES (?, ?)').run(name, color);
      logActivity(actorFor(request.apiKey), 'tag_created', `${request.apiKey.name} created the tag "${name}"`, {
        name,
        color,
        via: 'API',
      });
      return reply.code(201).send({ id: Number(result.lastInsertRowid), name, color });
    }
  );

  fastify.get(
    '/api/v1/entries',
    {
      onRequest: read,
      config: ADDRESS_LIMIT,
      schema: {
        tags: ['Entries'],
        summary: 'List entries for a date or a date range',
        description:
          'Give either `date`, or both `from` and `to`. Newest day first, and newest first within a day, like the app. Use `limit` and `offset` to page.',
        security,
        querystring: {
          type: 'object',
          properties: {
            date: { type: 'string', description: 'One day, YYYY-MM-DD' },
            from: { type: 'string', description: 'First day, YYYY-MM-DD' },
            to: { type: 'string', description: 'Last day, YYYY-MM-DD' },
            limit: { type: 'integer', minimum: 1, maximum: MAX_PAGE, default: DEFAULT_PAGE },
            offset: { type: 'integer', minimum: 0, default: 0 },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              total: { type: 'integer', description: 'Entries in the range, across all pages' },
              limit: { type: 'integer' },
              offset: { type: 'integer' },
              entries: { type: 'array', items: entrySchema },
            },
            required: ['total', 'limit', 'offset', 'entries'],
          },
          ...errors(400, 401, 429),
        },
      },
    },
    async (request, reply) => {
      const { date, limit, offset } = request.query;
      let { from, to } = request.query;
      if (date !== undefined) {
        if (from !== undefined || to !== undefined) {
          return reply.code(400).send({ error: 'Use either date, or from and to, not both' });
        }
        from = to = date;
      }
      if (!isValidDateString(from) || !isValidDateString(to) || from > to) {
        return reply.code(400).send({
          error: 'Give a valid date (YYYY-MM-DD), or from and to dates with from on or before to',
        });
      }
      const total = db
        .prepare('SELECT COUNT(*) AS n FROM entries WHERE entry_date >= ? AND entry_date <= ?')
        .get(from, to).n;
      const rows = db
        .prepare(
          `${ENTRY_SELECT}
           WHERE entries.entry_date >= ? AND entries.entry_date <= ?
           ORDER BY entries.entry_date DESC, entries.created_at DESC, entries.id DESC
           LIMIT ? OFFSET ?`
        )
        .all(from, to, limit, offset);
      return { total, limit, offset, entries: rows.map(present) };
    }
  );

  fastify.get(
    '/api/v1/entries/:id',
    {
      onRequest: read,
      config: ADDRESS_LIMIT,
      schema: {
        tags: ['Entries'],
        summary: 'Get one entry',
        security,
        params: { type: 'object', properties: { id: { type: 'integer', minimum: 1 } } },
        response: { 200: entrySchema, ...errors(400, 401, 404, 429) },
      },
    },
    async (request, reply) => {
      const row = db.prepare(`${ENTRY_SELECT} WHERE entries.id = ?`).get(request.params.id);
      if (!row) return reply.code(404).send({ error: 'Entry not found' });
      return present(row);
    }
  );

  fastify.post(
    '/api/v1/entries',
    {
      onRequest: write,
      bodyLimit: 256 * 1024,
      config: ADDRESS_LIMIT,
      schema: {
        tags: ['Entries'],
        summary: 'Add an entry',
        description: 'Needs a read and write key. The entry is written by the user "System".',
        security,
        body: {
          type: 'object',
          required: ['entry_date'],
          properties: {
            entry_date: {
              type: 'string',
              description:
                "The day the entry belongs to, YYYY-MM-DD. Today or an earlier day; a date after tomorrow's UTC date is refused, because the log records the past.",
            },
            ...bodyFields,
          },
        },
        response: { 201: entrySchema, ...errors(400, 401, 403, 429) },
      },
    },
    async (request, reply) => {
      const { entry_date } = request.body;
      if (!isValidDateString(entry_date)) {
        return reply.code(400).send({ error: 'entry_date must be a valid YYYY-MM-DD date' });
      }
      if (isFutureEntryDate(entry_date)) {
        return reply.code(400).send({ error: "Entries can't be dated in the future" });
      }
      const built = buildBody(request.body);
      if (built.error) return reply.code(400).send({ error: built.error });
      const resolved = resolveTags(request.body);
      if (resolved.error) return reply.code(400).send({ error: resolved.error });

      const id = db.transaction(() => {
        const result = db
          .prepare('INSERT INTO entries (author_id, body, entry_date) VALUES (?, ?, ?)')
          .run(SYSTEM_USER_ID, built.clean, entry_date);
        setEntryTags(result.lastInsertRowid, resolved.ids);
        return Number(result.lastInsertRowid);
      })();

      logActivity(actorFor(request.apiKey), 'entry_created', `${request.apiKey.name} added an entry for ${usDate(entry_date)}`, {
        entry_id: id,
        entry_date,
        via: 'API',
        after: entrySnapshot(built.clean, tagNamesFor(id)),
      });
      return reply.code(201).send(present(db.prepare(`${ENTRY_SELECT} WHERE entries.id = ?`).get(id)));
    }
  );

  fastify.put(
    '/api/v1/entries/:id',
    {
      onRequest: write,
      bodyLimit: 256 * 1024,
      config: ADDRESS_LIMIT,
      schema: {
        tags: ['Entries'],
        summary: 'Replace an entry written through the API',
        description:
          'Needs a read and write key. Only entries written by "System" can be changed; entries written by people are refused. ' +
          'The date cannot be changed. If neither `tags` nor `tag_ids` is sent the entry keeps its tags; send an empty list to remove them all.',
        security,
        params: { type: 'object', properties: { id: { type: 'integer', minimum: 1 } } },
        body: { type: 'object', properties: bodyFields },
        response: { 200: entrySchema, ...errors(400, 401, 403, 404, 429) },
      },
    },
    async (request, reply) => {
      const entry = db.prepare('SELECT * FROM entries WHERE id = ?').get(request.params.id);
      if (!entry) return reply.code(404).send({ error: 'Entry not found' });
      if (entry.author_id !== SYSTEM_USER_ID) {
        return reply.code(403).send({ error: 'The API can only change entries that were written through the API' });
      }
      const built = buildBody(request.body);
      if (built.error) return reply.code(400).send({ error: built.error });
      const changesTags = request.body.tags !== undefined || request.body.tag_ids !== undefined;
      const resolved = changesTags ? resolveTags(request.body) : null;
      if (resolved && resolved.error) return reply.code(400).send({ error: resolved.error });

      const beforeTags = tagNamesFor(entry.id);
      db.transaction(() => {
        db.prepare("UPDATE entries SET body = ?, updated_at = datetime('now') WHERE id = ?").run(built.clean, entry.id);
        if (resolved) setEntryTags(entry.id, resolved.ids);
      })();
      const afterTags = tagNamesFor(entry.id);
      if (built.clean !== entry.body || beforeTags.join() !== afterTags.join()) {
        logActivity(actorFor(request.apiKey), 'entry_updated', `${request.apiKey.name} edited an entry for ${usDate(entry.entry_date)}`, {
          entry_id: entry.id,
          entry_date: entry.entry_date,
          author: 'System',
          via: 'API',
          before: entrySnapshot(entry.body, beforeTags),
          after: entrySnapshot(built.clean, afterTags),
        });
      }
      return present(db.prepare(`${ENTRY_SELECT} WHERE entries.id = ?`).get(entry.id));
    }
  );

  fastify.delete(
    '/api/v1/entries/:id',
    {
      onRequest: write,
      config: ADDRESS_LIMIT,
      schema: {
        tags: ['Entries'],
        summary: 'Delete an entry written through the API',
        description: 'Needs a read and write key. Only entries written by "System" can be deleted. This cannot be undone.',
        security,
        params: { type: 'object', properties: { id: { type: 'integer', minimum: 1 } } },
        response: {
          200: { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'] },
          ...errors(400, 401, 403, 404, 429),
        },
      },
    },
    async (request, reply) => {
      const entry = db.prepare('SELECT * FROM entries WHERE id = ?').get(request.params.id);
      if (!entry) return reply.code(404).send({ error: 'Entry not found' });
      if (entry.author_id !== SYSTEM_USER_ID) {
        return reply.code(403).send({ error: 'The API can only delete entries that were written through the API' });
      }
      const beforeTags = tagNamesFor(entry.id);
      db.prepare('DELETE FROM entries WHERE id = ?').run(entry.id);
      logActivity(actorFor(request.apiKey), 'entry_deleted', `${request.apiKey.name} deleted an entry for ${usDate(entry.entry_date)}`, {
        entry_id: entry.id,
        entry_date: entry.entry_date,
        author: 'System',
        via: 'API',
        before: entrySnapshot(entry.body, beforeTags),
      });
      return { ok: true };
    }
  );
}
