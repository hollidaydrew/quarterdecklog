import { db } from '../db.js';
import { requireAdmin } from '../middleware/auth.js';
import { MAX_ACTIVITY } from '../activity.js';

export default async function activityRoutes(fastify) {
  // The newest MAX_ACTIVITY events, newest first. Details (entry text, before
  // and after values) are fetched one event at a time to keep this list small.
  fastify.get('/api/activity', { preHandler: requireAdmin }, async () => {
    return db
      .prepare(
        `SELECT id, created_at, actor_name, action, summary, (details IS NOT NULL) AS has_details
         FROM activity_log ORDER BY id DESC LIMIT ?`
      )
      .all(MAX_ACTIVITY);
  });

  // Everything the log holds, details included, for the CSV export. The browser
  // builds the file so times can be shown in the admin's local time.
  fastify.get('/api/activity/export', { preHandler: requireAdmin }, async () => {
    const rows = db
      .prepare(
        `SELECT id, created_at, actor_name, action, summary, details
         FROM activity_log ORDER BY id DESC LIMIT ?`
      )
      .all(MAX_ACTIVITY);
    return rows.map((row) => {
      let details = null;
      if (row.details) {
        try {
          details = JSON.parse(row.details);
        } catch {
          details = null;
        }
      }
      return { ...row, details };
    });
  });

  fastify.get('/api/activity/:id', { preHandler: requireAdmin }, async (request, reply) => {
    const row = db.prepare('SELECT id, details FROM activity_log WHERE id = ?').get(request.params.id);
    if (!row) return reply.code(404).send({ error: 'Activity not found' });
    return { id: row.id, details: row.details ? JSON.parse(row.details) : null };
  });
}
