import { db } from '../db.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { logActivity } from '../activity.js';

const COLOR_RE = /^#[0-9a-fA-F]{6}$/;

export default async function tagRoutes(fastify) {
  fastify.get('/api/tags', { preHandler: requireAuth }, async () => {
    return db.prepare('SELECT * FROM tags ORDER BY name COLLATE NOCASE').all();
  });

  fastify.post('/api/tags', { preHandler: requireAdmin }, async (request, reply) => {
    const { name, color } = request.body || {};
    if (!name || typeof name !== 'string' || !name.trim()) {
      return reply.code(400).send({ error: 'Tag name is required' });
    }
    if (color && !COLOR_RE.test(color)) {
      return reply.code(400).send({ error: 'Color must be a hex value like #5B7CFA' });
    }
    try {
      const result = db
        .prepare('INSERT INTO tags (name, color) VALUES (?, ?)')
        .run(name.trim(), color || '#5B7CFA');
      const created = db.prepare('SELECT * FROM tags WHERE id = ?').get(result.lastInsertRowid);
      logActivity(request.user, 'tag_created', `${request.user.display_name} created the tag "${created.name}"`, {
        name: created.name,
        color: created.color,
      });
      return created;
    } catch (err) {
      if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        return reply.code(409).send({ error: 'A tag with that name already exists' });
      }
      throw err;
    }
  });

  fastify.put('/api/tags/:id', { preHandler: requireAdmin }, async (request, reply) => {
    const tag = db.prepare('SELECT * FROM tags WHERE id = ?').get(request.params.id);
    if (!tag) return reply.code(404).send({ error: 'Tag not found' });

    const { name, color } = request.body || {};
    if (color && !COLOR_RE.test(color)) {
      return reply.code(400).send({ error: 'Color must be a hex value like #5B7CFA' });
    }
    db.prepare('UPDATE tags SET name = ?, color = ? WHERE id = ?').run(
      (name || tag.name).trim(),
      color || tag.color,
      tag.id
    );
    const updated = db.prepare('SELECT * FROM tags WHERE id = ?').get(tag.id);
    if (updated.name !== tag.name || updated.color !== tag.color) {
      logActivity(request.user, 'tag_updated', `${request.user.display_name} edited the tag "${tag.name}"`, {
        changes: [
          ...(updated.name !== tag.name ? [{ field: 'Name', from: tag.name, to: updated.name }] : []),
          ...(updated.color !== tag.color ? [{ field: 'Color', from: tag.color, to: updated.color }] : []),
        ],
      });
    }
    return updated;
  });

  fastify.delete('/api/tags/:id', { preHandler: requireAdmin }, async (request, reply) => {
    const tag = db.prepare('SELECT * FROM tags WHERE id = ?').get(request.params.id);
    if (!tag) return reply.code(404).send({ error: 'Tag not found' });
    const uses = db.prepare('SELECT COUNT(*) AS n FROM entry_tags WHERE tag_id = ?').get(tag.id).n;
    db.prepare('DELETE FROM tags WHERE id = ?').run(tag.id);
    logActivity(request.user, 'tag_deleted', `${request.user.display_name} deleted the tag "${tag.name}"`, {
      name: tag.name,
      entries_that_used_it: uses,
    });
    return { ok: true };
  });
}
