import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import session from '@fastify/session';
import fastifyStatic from '@fastify/static';
import rateLimit from '@fastify/rate-limit';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import './db.js'; // runs schema migrations on import
import authRoutes from './routes/auth.js';
import inviteRoutes from './routes/invites.js';
import tagRoutes from './routes/tags.js';
import entryRoutes from './routes/entries.js';
import userRoutes from './routes/users.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 7272;
const SESSION_SECRET = process.env.SESSION_SECRET;

if (!SESSION_SECRET || SESSION_SECRET.length < 32) {
  console.error(
    'FATAL: SESSION_SECRET is missing or too short. Set a random string of at least 32 characters in your .env file.\n' +
      'Generate one with: openssl rand -hex 32'
  );
  process.exit(1);
}

const fastify = Fastify({ logger: true, trustProxy: true });

await fastify.register(rateLimit, { global: false });
await fastify.register(cookie);
await fastify.register(session, {
  secret: SESSION_SECRET,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  },
});

await fastify.register(authRoutes);
await fastify.register(inviteRoutes);
await fastify.register(tagRoutes);
await fastify.register(entryRoutes);
await fastify.register(userRoutes);

// Serves the built React app. In the Docker image this is populated by the
// frontend build stage; see ../Dockerfile.
await fastify.register(fastifyStatic, {
  root: path.join(__dirname, '../public'),
  wildcard: false,
});

// SPA fallback: any non-API, non-file route serves index.html so client-side
// routing (React Router) can take over.
fastify.setNotFoundHandler((request, reply) => {
  if (request.raw.url.startsWith('/api/')) {
    reply.code(404).send({ error: 'Not found' });
    return;
  }
  reply.sendFile('index.html');
});

try {
  await fastify.listen({ port: PORT, host: '0.0.0.0' });
  console.log(`QuarterDeckLog listening on port ${PORT}`);
} catch (err) {
  fastify.log.error(err);
  process.exit(1);
}
