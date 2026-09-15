import { db } from '../db.js';
import { requireAdmin } from '../middleware/auth.js';

export default async function userRoutes(fastify) {
  fastify.get('/api/users', { preHandler: requireAdmin }, async () => {
    return db
      .prepare('SELECT id, username, display_name, is_admin, created_at FROM users ORDER BY created_at ASC')
      .all();
  });

  // Removes a user's access. Their past entries remain (author attribution
  // is part of the log's historical record) but the account can no longer log in.
  fastify.delete('/api/users/:id', { preHandler: requireAdmin }, async (request, reply) => {
    const target = db.prepare('SELECT * FROM users WHERE id = ?').get(request.params.id);
    if (!target) return reply.code(404).send({ error: 'User not found' });
    if (target.id === request.session.user.id) {
      return reply.code(400).send({ error: "You can't remove your own account" });
    }
    const adminCount = db.prepare('SELECT COUNT(*) AS n FROM users WHERE is_admin = 1').get().n;
    if (target.is_admin && adminCount <= 1) {
      return reply.code(400).send({ error: 'At least one admin account must remain' });
    }
    db.prepare('DELETE FROM users WHERE id = ?').run(target.id);
    return { ok: true };
  });
}
