import { db } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { logActivity } from '../activity.js';
import { parseProfileFields } from '../utils/profile.js';
import { publicUser } from '../utils/publicUser.js';

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

  // Anyone can edit their own display name and username. Roles are not part of
  // this route: a request that mentions is_admin is refused outright, so nobody
  // can make themselves an admin. (Passwords use POST /api/auth/change-password.)
  fastify.put('/api/me', { preHandler: requireAuth }, async (request, reply) => {
    const body = request.body || {};
    if ('is_admin' in body) {
      return reply.code(403).send({ error: "You can't change your own role" });
    }

    const parsed = parseProfileFields(body, request.user);
    if (parsed.error) return reply.code(parsed.status).send({ error: parsed.error });

    if (parsed.changes.length > 0) {
      db.prepare('UPDATE users SET display_name = ?, username = ? WHERE id = ?').run(
        parsed.display_name,
        parsed.username,
        request.user.id
      );
      logActivity(
        request.user,
        'profile_updated',
        `${request.user.display_name} updated their profile (${parsed.changes.map((c) => c.field.toLowerCase()).join(', ')})`,
        { changes: parsed.changes }
      );
    }
    return publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(request.user.id));
  });
}
