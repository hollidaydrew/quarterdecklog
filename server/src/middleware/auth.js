export async function requireAuth(request, reply) {
  if (!request.session.user) {
    reply.code(401).send({ error: 'Not authenticated' });
  }
}

export async function requireAdmin(request, reply) {
  if (!request.session.user) {
    reply.code(401).send({ error: 'Not authenticated' });
    return;
  }
  if (!request.session.user.is_admin) {
    reply.code(403).send({ error: 'Admin access required' });
  }
}
