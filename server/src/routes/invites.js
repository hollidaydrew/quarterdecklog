import { nanoid } from 'nanoid';
import { db } from '../db.js';
import { requireAdmin } from '../middleware/auth.js';

const DEFAULT_EXPIRY_DAYS = 7;

export default async function inviteRoutes(fastify) {
  fastify.get('/api/invites', { preHandler: requireAdmin }, async () => {
    return db
      .prepare(
        `SELECT invites.id, invites.token, invites.expires_at, invites.used_at, invites.created_at,
                creator.display_name AS created_by_name,
                joined.display_name AS used_by_name
         FROM invites
         JOIN users creator ON creator.id = invites.created_by
         LEFT JOIN users joined ON joined.id = invites.used_by
         ORDER BY invites.created_at DESC`
      )
      .all();
  });

  fastify.post('/api/invites', { preHandler: requireAdmin }, async (request) => {
    const token = nanoid(24);
    const expiresAt = new Date(Date.now() + DEFAULT_EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString();
    db.prepare('INSERT INTO invites (token, created_by, expires_at) VALUES (?, ?, ?)').run(
      token,
      request.session.user.id,
      expiresAt
    );
    return { token, expires_at: expiresAt };
  });

  fastify.delete('/api/invites/:id', { preHandler: requireAdmin }, async (request, reply) => {
    const invite = db.prepare('SELECT * FROM invites WHERE id = ?').get(request.params.id);
    if (!invite) return reply.code(404).send({ error: 'Invite not found' });
    if (invite.used_at) return reply.code(400).send({ error: 'Invite has already been used' });
    db.prepare('DELETE FROM invites WHERE id = ?').run(invite.id);
    return { ok: true };
  });
}
