import { db } from '../db.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

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
      return db.prepare('SELECT * FROM tags WHERE id = ?').get(result.lastInsertRowid);
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
    return db.prepare('SELECT * FROM tags WHERE id = ?').get(tag.id);
  });

  fastify.delete('/api/tags/:id', { preHandler: requireAdmin }, async (request, reply) => {
    const tag = db.prepare('SELECT * FROM tags WHERE id = ?').get(request.params.id);
    if (!tag) return reply.code(404).send({ error: 'Tag not found' });
    db.prepare('DELETE FROM tags WHERE id = ?').run(tag.id);
    return { ok: true };
  });
}
