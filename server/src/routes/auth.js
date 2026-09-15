import argon2 from 'argon2';
import { db } from '../db.js';

function publicUser(user) {
  return { id: user.id, username: user.username, display_name: user.display_name, is_admin: !!user.is_admin };
}

export default async function authRoutes(fastify) {
  // Tells the frontend whether to show the first-run "create admin" screen
  fastify.get('/api/auth/status', async (request) => {
    const userCount = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
    return {
      setupRequired: userCount === 0,
      user: request.session.user ? publicUser(request.session.user) : null,
    };
  });

  // First-run only: creates the sole admin account. Refuses once any user exists,
  // so this can never be used to create a second admin later.
  fastify.post('/api/auth/setup', async (request, reply) => {
    const userCount = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
    if (userCount > 0) {
      return reply.code(403).send({ error: 'Setup has already been completed' });
    }

    const { username, display_name, password } = request.body || {};
    if (!username || !display_name || !password || password.length < 8) {
      return reply.code(400).send({ error: 'Username, display name, and a password of at least 8 characters are required' });
    }

    const password_hash = await argon2.hash(password);
    const result = db
      .prepare('INSERT INTO users (username, display_name, password_hash, is_admin) VALUES (?, ?, ?, 1)')
      .run(username.trim(), display_name.trim(), password_hash);

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
    request.session.user = user;
    return publicUser(user);
  });

  fastify.post(
    '/api/auth/login',
    { config: { rateLimit: { max: 10, timeWindow: '5 minutes' } } },
    async (request, reply) => {
      const { username, password } = request.body || {};
      if (!username || !password) {
        return reply.code(400).send({ error: 'Username and password are required' });
      }

      const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username.trim());
      // Always run argon2.verify, even with a dummy hash, so login timing
      // doesn't reveal whether a username exists.
      const DUMMY_HASH = '$argon2id$v=19$m=65536,t=3,p=4$c29tZXNhbHQ$XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';
      const ok = await argon2.verify(user ? user.password_hash : DUMMY_HASH, password).catch(() => false);

      if (!user || !ok) {
        return reply.code(401).send({ error: 'Invalid username or password' });
      }

      request.session.user = user;
      return publicUser(user);
    }
  );

  fastify.post('/api/auth/logout', async (request) => {
    await request.session.destroy();
    return { ok: true };
  });

  // Looks up an invite without consuming it, so the join page can render
  // "You're invited" before the person sets a password.
  fastify.get('/api/auth/invite/:token', async (request, reply) => {
    const invite = db.prepare('SELECT * FROM invites WHERE token = ?').get(request.params.token);
    if (!invite || invite.used_at || new Date(invite.expires_at) < new Date()) {
      return reply.code(404).send({ error: 'This invite link is invalid or has expired' });
    }
    return { valid: true };
  });

  fastify.post('/api/auth/join/:token', async (request, reply) => {
    const invite = db.prepare('SELECT * FROM invites WHERE token = ?').get(request.params.token);
    if (!invite || invite.used_at || new Date(invite.expires_at) < new Date()) {
      return reply.code(404).send({ error: 'This invite link is invalid or has expired' });
    }

    const { username, display_name, password } = request.body || {};
    if (!username || !display_name || !password || password.length < 8) {
      return reply.code(400).send({ error: 'Username, display name, and a password of at least 8 characters are required' });
    }

    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username.trim());
    if (existing) {
      return reply.code(409).send({ error: 'That username is already taken' });
    }

    const password_hash = await argon2.hash(password);
    const result = db
      .prepare('INSERT INTO users (username, display_name, password_hash, is_admin) VALUES (?, ?, ?, 0)')
      .run(username.trim(), display_name.trim(), password_hash);

    db.prepare("UPDATE invites SET used_at = datetime('now'), used_by = ? WHERE id = ?").run(result.lastInsertRowid, invite.id);

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
    request.session.user = user;
    return publicUser(user);
  });
}
