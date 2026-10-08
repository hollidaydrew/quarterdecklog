import { db } from '../db.js';
import { requireAdmin } from '../middleware/auth.js';
import { generateApiKey } from '../middleware/apiKey.js';
import { logActivity } from '../activity.js';
import { API_ENABLED } from '../config.js';

const MAX_NAME = 60;
const MAX_ACTIVE_KEYS = 25;
const EXPIRY_DAYS = new Set([30, 90, 365]);

function describe(row) {
  return {
    id: row.id,
    name: row.name,
    key_prefix: row.key_prefix,
    scope: row.scope,
    created_by_name: row.created_by_name,
    created_at: row.created_at,
    expires_at: row.expires_at,
    expired: !!row.expires_at && new Date(row.expires_at) <= new Date(),
    last_used_at: row.last_used_at,
  };
}

// Admin screens for API keys. These use the normal sign-in (cookie), never an
// API key, so a key can't be used to create more keys.
export default async function apiKeyRoutes(fastify) {
  fastify.get('/api/admin/api-keys', { preHandler: requireAdmin }, async () => {
    const keys = db
      .prepare('SELECT * FROM api_keys WHERE revoked_at IS NULL ORDER BY created_at DESC, id DESC')
      .all();
    return { enabled: API_ENABLED, keys: keys.map(describe) };
  });

  fastify.post('/api/admin/api-keys', { preHandler: requireAdmin }, async (request, reply) => {
    if (!API_ENABLED) {
      return reply.code(409).send({ error: 'The API is turned off. Set API_ENABLED=true in .env and restart to use it.' });
    }
    const { name, scope, expires_in_days } = request.body || {};
    const cleanName = typeof name === 'string' ? name.trim().replace(/\s+/g, ' ') : '';
    if (!cleanName || cleanName.length > MAX_NAME || /[\u0000-\u001f\u007f]/.test(cleanName)) {
      return reply.code(400).send({ error: `Give the key a name of 1 to ${MAX_NAME} characters` });
    }
    if (scope !== 'read' && scope !== 'write') {
      return reply.code(400).send({ error: "Scope must be 'read' or 'write'" });
    }
    if (expires_in_days != null && !EXPIRY_DAYS.has(expires_in_days)) {
      return reply.code(400).send({ error: 'Expiry must be 30, 90 or 365 days, or none' });
    }

    // The name is what the Activity log shows as the actor, so it can't look
    // like a person, like System, or like another key.
    const lower = cleanName.toLowerCase();
    const taken =
      lower === 'system' ||
      db.prepare('SELECT 1 FROM api_keys WHERE name = ? COLLATE NOCASE AND revoked_at IS NULL').get(cleanName) ||
      db
        .prepare('SELECT 1 FROM users WHERE (lower(display_name) = ? OR lower(username) = ?) AND is_system = 0 AND deleted_at IS NULL')
        .get(lower, lower);
    if (taken) return reply.code(409).send({ error: 'That name is already used by a person, System or another key' });

    const active = db.prepare('SELECT COUNT(*) AS n FROM api_keys WHERE revoked_at IS NULL').get().n;
    if (active >= MAX_ACTIVE_KEYS) {
      return reply.code(409).send({ error: `At most ${MAX_ACTIVE_KEYS} keys can exist at once. Revoke one first.` });
    }

    const { key, hash, prefix } = generateApiKey();
    const expiresAt = expires_in_days ? new Date(Date.now() + expires_in_days * 86400000).toISOString() : null;
    const result = db
      .prepare(
        'INSERT INTO api_keys (name, key_prefix, key_hash, scope, created_by, created_by_name, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
      )
      .run(cleanName, prefix, hash, scope, request.user.id, request.user.display_name, expiresAt);
    logActivity(request.user, 'api_key_created', `${request.user.display_name} created the API key "${cleanName}"`, {
      name: cleanName,
      access: scope === 'write' ? 'read and write' : 'read only',
      expires: expiresAt || 'never',
    });
    const row = db.prepare('SELECT * FROM api_keys WHERE id = ?').get(result.lastInsertRowid);
    // The only time the key itself is ever returned.
    return { ...describe(row), key };
  });

  fastify.delete('/api/admin/api-keys/:id', { preHandler: requireAdmin }, async (request, reply) => {
    const row = db.prepare('SELECT * FROM api_keys WHERE id = ? AND revoked_at IS NULL').get(request.params.id);
    if (!row) return reply.code(404).send({ error: 'API key not found' });
    db.prepare("UPDATE api_keys SET revoked_at = datetime('now') WHERE id = ?").run(row.id);
    logActivity(request.user, 'api_key_revoked', `${request.user.display_name} revoked the API key "${row.name}"`, {
      name: row.name,
    });
    return { ok: true };
  });
}
