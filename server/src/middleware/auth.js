import { db } from '../db.js';

// The session stores only the user's id. The user row is re-read from the
// database on every request, so role changes, password resets and deletions
// take effect immediately instead of when the session eventually expires.
export function loadSessionUser(request) {
  const id = request.session.userId;
  if (!id) return null;
  return db.prepare('SELECT * FROM users WHERE id = ? AND deleted_at IS NULL').get(id) || null;
}

// Requires a signed-in user, but allows one who still has to change a
// temporary password (used only by the change-password route).
export async function requireSession(request, reply) {
  const user = loadSessionUser(request);
  if (!user) {
    if (request.session.userId) await request.session.destroy();
    reply.code(401).send({ error: 'Not authenticated' });
    return reply;
  }
  request.user = user;
}

export async function requireAuth(request, reply) {
  const blocked = await requireSession(request, reply);
  if (blocked) return blocked;
  if (request.user.must_change_password) {
    reply.code(403).send({
      error: 'Choose a new password before continuing',
      code: 'PASSWORD_CHANGE_REQUIRED',
    });
    return reply;
  }
}

export async function requireAdmin(request, reply) {
  const blocked = await requireAuth(request, reply);
  if (blocked) return blocked;
  if (!request.user.is_admin) {
    reply.code(403).send({ error: 'Admin access required' });
    return reply;
  }
}
