import { db } from '../db.js';
import { logActivity } from '../activity.js';

// Finishes a sign-in: from here the person is signed in. It runs after the
// password (and, when two-step is on, the code or the trusted-device cookie).
export function completeSignIn(request, user) {
  delete request.session.mfaPending;
  delete request.session.mfaEnroll;
  request.session.userId = user.id;
  // The sign-in time before this one; the "since you last signed in" banner
  // uses it (null on a first sign-in).
  request.session.previousLoginAt = user.last_login_at || null;
  db.prepare("UPDATE users SET last_login_at = datetime('now') WHERE id = ?").run(user.id);
  logActivity(user, 'sign_in', `${user.display_name} signed in`);
}
