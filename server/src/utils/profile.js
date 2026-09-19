import { db } from '../db.js';

export const MAX_DISPLAY_NAME = 100;
export const MAX_USERNAME = 64;

// Validates the editable profile fields shared by "edit my profile" and the
// admin's "edit user". Returns { error, status } or the cleaned values plus
// the list of fields that actually changed. Role changes are handled by the
// callers, never here.
export function parseProfileFields(body, current) {
  const { display_name, username } = body || {};
  const next = { display_name: current.display_name, username: current.username };

  if (display_name !== undefined) {
    if (typeof display_name !== 'string' || !display_name.trim()) {
      return { status: 400, error: 'Display name is required' };
    }
    if (display_name.trim().length > MAX_DISPLAY_NAME) {
      return { status: 400, error: `Display name can be at most ${MAX_DISPLAY_NAME} characters` };
    }
    next.display_name = display_name.trim();
  }

  if (username !== undefined) {
    if (typeof username !== 'string' || !username.trim()) {
      return { status: 400, error: 'Username is required' };
    }
    if (username.trim().length > MAX_USERNAME) {
      return { status: 400, error: `Username can be at most ${MAX_USERNAME} characters` };
    }
    next.username = username.trim();
    const clash = db.prepare('SELECT id FROM users WHERE username = ? AND id != ?').get(next.username, current.id);
    if (clash) return { status: 409, error: 'That username is already taken' };
  }

  const changes = [];
  if (next.display_name !== current.display_name) {
    changes.push({ field: 'Display name', from: current.display_name, to: next.display_name });
  }
  if (next.username !== current.username) {
    changes.push({ field: 'Username', from: current.username, to: next.username });
  }
  return { ...next, changes };
}
