import { db } from '../db.js';
import { requireAuth } from '../middleware/auth.js';

const VIEWS = new Set(['list', 'calendar']);

export default async function meRoutes(fastify) {
  // Remembers the last view (list or calendar) the signed-in user used, so the
  // logo takes them back to it from any device.
  fastify.put('/api/me/view', { preHandler: requireAuth }, async (request, reply) => {
    const { view } = request.body || {};
    if (!VIEWS.has(view)) {
      return reply.code(400).send({ error: "view must be 'list' or 'calendar'" });
    }
    db.prepare('UPDATE users SET preferred_view = ? WHERE id = ?').run(view, request.user.id);
    return { preferred_view: view };
  });
}
