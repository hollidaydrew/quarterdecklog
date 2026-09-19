import argon2 from 'argon2';
import crypto from 'node:crypto';
import { db } from '../db.js';
import { requireAdmin } from '../middleware/auth.js';

const MAX_DISPLAY_NAME = 100;
const MAX_USERNAME = 64;

// No look-alike characters (0/O, 1/l/I) so a temporary password can be read
// aloud or typed from a chat message without mistakes.
const TEMP_PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
const TEMP_PASSWORD_LENGTH = 14;

function generateTempPassword() {
  let out = '';
  for (let i = 0; i < TEMP_PASSWORD_LENGTH; i++) {
    out += TEMP_PASSWORD_ALPHABET[crypto.randomInt(TEMP_PASSWORD_ALPHABET.length)];
  }
  return out;
}

function findActiveUser(id) {
  return db.prepare('SELECT * FROM users WHERE id = ? AND deleted_at IS NULL').get(id);
}

function activeAdminCount() {
  return db.prepare('SELECT COUNT(*) AS n FROM users WHERE is_admin = 1 AND deleted_at IS NULL').get().n;
}

export default async function userRoutes(fastify) {
  fastify.get('/api/users', { preHandler: requireAdmin }, async () => {
    return db
      .prepare(
        `SELECT u.id, u.username, u.display_name, u.is_admin, u.must_change_password, u.created_at,
                inviter.display_name AS invited_by_name
         FROM users u
         LEFT JOIN users inviter ON inviter.id = u.invited_by
         WHERE u.deleted_at IS NULL
         ORDER BY u.created_at ASC, u.id ASC`
      )
      .all();
  });

  // Edit a team member's display name, username and admin role.
  fastify.put('/api/users/:id', { preHandler: requireAdmin }, async (request, reply) => {
    const target = findActiveUser(request.params.id);
    if (!target) return reply.code(404).send({ error: 'User not found' });

    const { display_name, username, is_admin } = request.body || {};
    let nextDisplayName = target.display_name;
    let nextUsername = target.username;
    let nextIsAdmin = target.is_admin;

    if (display_name !== undefined) {
      if (typeof display_name !== 'string' || !display_name.trim()) {
        return reply.code(400).send({ error: 'Display name is required' });
      }
      if (display_name.trim().length > MAX_DISPLAY_NAME) {
        return reply.code(400).send({ error: `Display name can be at most ${MAX_DISPLAY_NAME} characters` });
      }
      nextDisplayName = display_name.trim();
    }

    if (username !== undefined) {
      if (typeof username !== 'string' || !username.trim()) {
        return reply.code(400).send({ error: 'Username is required' });
      }
      if (username.trim().length > MAX_USERNAME) {
        return reply.code(400).send({ error: `Username can be at most ${MAX_USERNAME} characters` });
      }
      nextUsername = username.trim();
      const clash = db
        .prepare('SELECT id FROM users WHERE username = ? AND id != ?')
        .get(nextUsername, target.id);
      if (clash) return reply.code(409).send({ error: 'That username is already taken' });
    }

    if (is_admin !== undefined) {
      if (typeof is_admin !== 'boolean') {
        return reply.code(400).send({ error: 'is_admin must be true or false' });
      }
      nextIsAdmin = is_admin ? 1 : 0;
      if (!is_admin && target.is_admin) {
        if (target.id === request.user.id) {
          return reply.code(400).send({ error: "You can't remove your own admin role" });
        }
        if (activeAdminCount() <= 1) {
          return reply.code(400).send({ error: 'At least one admin account must remain' });
        }
      }
    }

    db.prepare('UPDATE users SET display_name = ?, username = ?, is_admin = ? WHERE id = ?').run(
      nextDisplayName,
      nextUsername,
      nextIsAdmin,
      target.id
    );

    return db
      .prepare('SELECT id, username, display_name, is_admin, must_change_password, created_at FROM users WHERE id = ?')
      .get(target.id);
  });

  // Issues a temporary password. The user is required to replace it on their
  // next request, including any session they already have open.
  fastify.post('/api/users/:id/reset-password', { preHandler: requireAdmin }, async (request, reply) => {
    const target = findActiveUser(request.params.id);
    if (!target) return reply.code(404).send({ error: 'User not found' });
    if (target.id === request.user.id) {
      return reply.code(400).send({ error: "You can't reset your own password here" });
    }

    const temp_password = generateTempPassword();
    const password_hash = await argon2.hash(temp_password);
    db.prepare('UPDATE users SET password_hash = ?, must_change_password = 1 WHERE id = ?').run(
      password_hash,
      target.id
    );
    return { temp_password };
  });

  // Deletes a user's account and access immediately. Their past entries stay in
  // the log under their name (author attribution is part of the historical
  // record). The row is kept as an anonymous tombstone rather than removed,
  // because entries.author_id cascades and would otherwise delete their entries.
  fastify.delete('/api/users/:id', { preHandler: requireAdmin }, async (request, reply) => {
    const target = findActiveUser(request.params.id);
    if (!target) return reply.code(404).send({ error: 'User not found' });
    if (target.id === request.user.id) {
      return reply.code(400).send({ error: "You can't delete your own account" });
    }
    if (target.is_admin && activeAdminCount() <= 1) {
      return reply.code(400).send({ error: 'At least one admin account must remain' });
    }

    const tombstoneUsername = `deleted-${target.id}-${crypto.randomBytes(4).toString('hex')}`;
    db.transaction(() => {
      // Invites this person created stop working along with their account.
      db.prepare('DELETE FROM invites WHERE created_by = ?').run(target.id);
      db.prepare(
        `UPDATE users
         SET deleted_at = datetime('now'), username = ?, password_hash = '!', is_admin = 0, must_change_password = 0
         WHERE id = ?`
      ).run(tombstoneUsername, target.id);
    })();
    return { ok: true };
  });
}
