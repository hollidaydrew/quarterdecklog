import crypto from 'node:crypto';
import { db } from '../db.js';

export const KEY_PREFIX = 'qdl_';

// A key is 32 random bytes (256 bits), so a plain SHA-256 of it is enough to
// store: there is nothing to guess or to brute-force, unlike a password.
export function generateApiKey() {
  const key = KEY_PREFIX + crypto.randomBytes(32).toString('base64url');
  return { key, hash: hashApiKey(key), prefix: key.slice(0, 8) };
}

export function hashApiKey(key) {
  return crypto.createHash('sha256').update(key).digest('hex');
}

// Each key may make this many calls a minute. Counted in memory, which is
// enough for a single-container app and resets on restart.
const KEY_LIMIT = 60;
const WINDOW_MS = 60 * 1000;
const buckets = new Map();

function secondsOverLimit(keyId) {
  const now = Date.now();
  let bucket = buckets.get(keyId);
  if (!bucket || bucket.resetAt <= now) {
    // Drop spent buckets so the map can't grow without bound.
    for (const [id, b] of buckets) if (b.resetAt <= now) buckets.delete(id);
    bucket = { count: 0, resetAt: now + WINDOW_MS };
    buckets.set(keyId, bucket);
  }
  bucket.count += 1;
  return bucket.count > KEY_LIMIT ? Math.ceil((bucket.resetAt - now) / 1000) : 0;
}

const BAD_KEY = 'A valid API key is required (Authorization: Bearer <key>)';

function deny(reply, status, message) {
  if (status === 401) reply.header('WWW-Authenticate', 'Bearer');
  reply.code(status).send({ error: message });
  return reply;
}

// Returns a preHandler that requires a valid key with at least the given
// scope ('read' or 'write'; a write key can also read). The key row is
// re-read on every call, so revoking a key or letting it expire takes effect
// at once. The same 401 is used for every kind of bad key so a caller can't
// tell a wrong key from an expired or revoked one.
export function requireApiKey(scope = 'read') {
  return async function apiKeyAuth(request, reply) {
    const header = request.headers.authorization;
    const match = typeof header === 'string' ? /^Bearer ([A-Za-z0-9_-]{20,100})$/.exec(header) : null;
    if (!match) return deny(reply, 401, BAD_KEY);

    const row = db
      .prepare('SELECT * FROM api_keys WHERE key_hash = ? AND revoked_at IS NULL')
      .get(hashApiKey(match[1]));
    if (!row || (row.expires_at && new Date(row.expires_at) <= new Date())) {
      return deny(reply, 401, BAD_KEY);
    }

    const wait = secondsOverLimit(row.id);
    if (wait) {
      reply.header('Retry-After', String(wait));
      return deny(reply, 429, 'Too many requests for this API key. Try again shortly.');
    }
    if (scope === 'write' && row.scope !== 'write') {
      return deny(reply, 403, 'This API key is read-only');
    }

    // Last-used is written at most once a minute so reads stay cheap.
    if (!row.last_used_at || Date.now() - new Date(`${row.last_used_at}Z`).getTime() > WINDOW_MS) {
      db.prepare("UPDATE api_keys SET last_used_at = datetime('now') WHERE id = ?").run(row.id);
    }
    request.apiKey = row;
  };
}
