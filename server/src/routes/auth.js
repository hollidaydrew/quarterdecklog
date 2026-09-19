import argon2 from 'argon2';
import { db } from '../db.js';
import { loadSessionUser, requireSession } from '../middleware/auth.js';

function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    display_name: user.display_name,
    is_admin: !!user.is_admin,
    must_change_password: !!user.must_change_password,
    preferred_view: user.preferred_view === 'calendar' ? 'calendar' : 'list',
  };
}

function findOpenInvite(token) {
  const invite = db.prepare('SELECT * FROM invites WHERE token = ?').get(token);
  if (!invite || invite.used_at || new Date(invite.expires_at) < new Date()) return null;
  return invite;
}

export default async function authRoutes(fastify) {
  // Tells the frontend whether to show the first-run "create admin" screen
  fastify.get('/api/auth/status', async (request) => {
    const userCount = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
    const user = loadSessionUser(request);
    if (!user && request.session.userId) await request.session.destroy();
    return {
      setupRequired: userCount === 0,
      user: user ? publicUser(user) : null,
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
    request.session.userId = user.id;
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

      const user = db
        .prepare('SELECT * FROM users WHERE username = ? AND deleted_at IS NULL')
        .get(username.trim());
      // Always run argon2.verify, even with a dummy hash, so login timing
      // doesn't reveal whether a username exists.
      const DUMMY_HASH = '$argon2id$v=19$m=65536,t=3,p=4$c29tZXNhbHQ$XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';
      const ok = await argon2.verify(user ? user.password_hash : DUMMY_HASH, password).catch(() => false);

      if (!user || !ok) {
        return reply.code(401).send({ error: 'Invalid username or password' });
      }

      request.session.userId = user.id;
      return publicUser(user);
    }
  );

  fastify.post('/api/auth/logout', async (request) => {
    await request.session.destroy();
    return { ok: true };
  });

  // Used on first sign-in after an admin issues a temporary password. Also
  // allowed for any signed-in user, but the UI only offers it when required.
  fastify.post(
    '/api/auth/change-password',
    {
      preHandler: requireSession,
      config: { rateLimit: { max: 10, timeWindow: '5 minutes' } },
    },
    async (request, reply) => {
      const { current_password, new_password } = request.body || {};
      if (!current_password || !new_password) {
        return reply.code(400).send({ error: 'Enter your temporary password and a new password' });
      }
      if (new_password.length < 8) {
        return reply.code(400).send({ error: 'New password must be at least 8 characters' });
      }

      const ok = await argon2.verify(request.user.password_hash, current_password).catch(() => false);
      if (!ok) {
        return reply.code(400).send({ error: 'The temporary password is incorrect' });
      }
      if (new_password === current_password) {
        return reply.code(400).send({ error: 'Choose a password different from the temporary one' });
      }

      const password_hash = await argon2.hash(new_password);
      db.prepare('UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?').run(
        password_hash,
        request.user.id
      );
      return publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(request.user.id));
    }
  );

  // Looks up an invite without consuming it, so the join page can render
  // "You're invited" before the person sets a password.
  fastify.get('/api/auth/invite/:token', async (request, reply) => {
    if (!findOpenInvite(request.params.token)) {
      return reply.code(404).send({ error: 'This invite link is invalid or has expired' });
    }
    return { valid: true };
  });

  fastify.post('/api/auth/join/:token', async (request, reply) => {
    const invite = findOpenInvite(request.params.token);
    if (!invite) {
      return reply.code(404).send({ error: 'This invite link is invalid or has expired' });
    }

    const { username, display_name, password } = request.body || {};
    if (!username || !display_name || !password || password.length < 8) {
      return reply.code(400).send({ error: 'Username, display name, and a password of at least 8 characters are required' });
    }

    const password_hash = await argon2.hash(password);

    // Re-check and consume the invite in one transaction so a link can only
    // ever create one account, even if two people submit it at the same moment.
    const join = db.transaction(() => {
      const fresh = db.prepare('SELECT * FROM invites WHERE id = ?').get(invite.id);
      if (!fresh) return { error: 'invalid' };
      if (db.prepare('SELECT id FROM users WHERE username = ?').get(username.trim())) {
        return { error: 'taken' };
      }
      const result = db
        .prepare(
          'INSERT INTO users (username, display_name, password_hash, is_admin, invited_by) VALUES (?, ?, ?, 0, ?)'
        )
        .run(username.trim(), display_name.trim(), password_hash, fresh.created_by);
      db.prepare('DELETE FROM invites WHERE id = ?').run(fresh.id);
      return { id: result.lastInsertRowid };
    });
    const outcome = join();

    if (outcome.error === 'invalid') {
      return reply.code(404).send({ error: 'This invite link is invalid or has expired' });
    }
    if (outcome.error === 'taken') {
      return reply.code(409).send({ error: 'That username is already taken' });
    }

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(outcome.id);
    request.session.userId = user.id;
    return publicUser(user);
  });
}
