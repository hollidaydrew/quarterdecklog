import { nanoid } from 'nanoid';
import { db } from '../db.js';
import { requireAdmin } from '../middleware/auth.js';
import { logActivity } from '../activity.js';

const DEFAULT_EXPIRY_DAYS = 7;

export default async function inviteRoutes(fastify) {
  // Pending invites only. Once someone joins, the invite is consumed and the
  // admin who created it is recorded on the new user (users.invited_by).
  fastify.get('/api/invites', { preHandler: requireAdmin }, async () => {
    return db
      .prepare(
        `SELECT invites.id, invites.token, invites.expires_at, invites.created_at,
                creator.display_name AS created_by_name
         FROM invites
         JOIN users creator ON creator.id = invites.created_by
         WHERE invites.used_at IS NULL
         ORDER BY invites.created_at DESC, invites.id DESC`
      )
      .all();
  });

  fastify.post('/api/invites', { preHandler: requireAdmin }, async (request) => {
    const token = nanoid(24);
    const expiresAt = new Date(Date.now() + DEFAULT_EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString();
    db.prepare('INSERT INTO invites (token, created_by, expires_at) VALUES (?, ?, ?)').run(
      token,
      request.user.id,
      expiresAt
    );
    logActivity(request.user, 'invite_created', `${request.user.display_name} created an invite`, { expires_at: expiresAt });
    return { token, expires_at: expiresAt };
  });

  fastify.delete('/api/invites/:id', { preHandler: requireAdmin }, async (request, reply) => {
    const invite = db.prepare('SELECT * FROM invites WHERE id = ?').get(request.params.id);
    if (!invite) return reply.code(404).send({ error: 'Invite not found' });
    if (invite.used_at) return reply.code(400).send({ error: 'Invite has already been used' });
    db.prepare('DELETE FROM invites WHERE id = ?').run(invite.id);
    logActivity(request.user, 'invite_revoked', `${request.user.display_name} revoked an invite`);
    return { ok: true };
  });
}
