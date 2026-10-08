import { db } from '../db.js';

// "System" and the names of API keys appear as the actor in the Activity log,
// so a person can't take one as their display name and pose as an API client.
export function isReservedDisplayName(name) {
  const lower = String(name || '').trim().toLowerCase();
  if (lower === 'system') return true;
  return !!db.prepare('SELECT 1 FROM api_keys WHERE name = ? COLLATE NOCASE AND revoked_at IS NULL').get(lower);
}
