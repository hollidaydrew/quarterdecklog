import argon2 from 'argon2';
import crypto from 'node:crypto';
import { db } from '../db.js';
import { requireAdmin } from '../middleware/auth.js';
import { logActivity } from '../activity.js';
import { parseProfileFields } from '../utils/profile.js';

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
        `SELECT u.id, u.username, u.display_name, u.is_admin, u.must_change_password, u.created_at, u.last_login_at,
                inviter.display_name AS invited_by_name
         FROM users u
         LEFT JOIN users inviter ON inviter.id = u.invited_by
         WHERE u.deleted_at IS NULL
         ORDER BY u.created_at ASC, u.id ASC`
      )
      .all();
  });

  // Edit a team member's display name, username and admin role. (Everyone can
  // edit their own name and username through PUT /api/me; only an admin can
  // change a role.)
  fastify.put('/api/users/:id', { preHandler: requireAdmin }, async (request, reply) => {
    const target = findActiveUser(request.params.id);
    if (!target) return reply.code(404).send({ error: 'User not found' });

    const parsed = parseProfileFields(request.body, target);
    if (parsed.error) return reply.code(parsed.status).send({ error: parsed.error });

    const { is_admin } = request.body || {};
    let nextIsAdmin = target.is_admin;
    const changes = [...parsed.changes];

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
      if (nextIsAdmin !== target.is_admin) {
        changes.push({ field: 'Admin role', from: target.is_admin ? 'yes' : 'no', to: nextIsAdmin ? 'yes' : 'no' });
      }
    }

    db.prepare('UPDATE users SET display_name = ?, username = ?, is_admin = ? WHERE id = ?').run(
      parsed.display_name,
      parsed.username,
      nextIsAdmin,
      target.id
    );

    if (changes.length > 0) {
      const whose = target.id === request.user.id ? 'their own account' : `${target.display_name}'s account`;
      logActivity(
        request.user,
        'user_updated',
        `${request.user.display_name} edited ${whose} (${changes.map((c) => c.field.toLowerCase()).join(', ')})`,
        { user: target.display_name, changes }
      );
    }

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
    logActivity(request.user, 'password_reset', `${request.user.display_name} reset ${target.display_name}'s password`, {
      user: target.display_name,
    });
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
    logActivity(request.user, 'user_deleted', `${request.user.display_name} deleted the user ${target.display_name}`, {
      user: target.display_name,
      username: target.username,
    });
    return { ok: true };
  });
}
