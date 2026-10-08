import argon2 from 'argon2';
import crypto from 'node:crypto';
import { db } from '../db.js';
import { loadSessionUser, requireAuth, requireAdmin } from '../middleware/auth.js';
import { logActivity } from '../activity.js';
import { publicUser } from '../utils/publicUser.js';
import { completeSignIn } from '../utils/signIn.js';
import { MFA_FORCE_OFF, MFA_KEY_CONFIGURED } from '../config.js';
import {
  DEVICE_COOKIE,
  DEVICE_LIMIT_MESSAGE,
  LOCK_MINUTES,
  MAX_DEVICES,
  PENDING_MS,
  TRUST_DAYS,
  base32Decode,
  base32Encode,
  checkTotp,
  clearFailures,
  clearMfa,
  decryptSecret,
  encryptSecret,
  issueDevice,
  lockMinutesLeft,
  looksLikeRecoveryCode,
  mfaActive,
  mfaStatusFor,
  mfaSwitchOn,
  newSecret,
  otpauthUri,
  purgeExpiredDevices,
  recordFailure,
  recoveryHash,
  refreshDeviceWarning,
  replaceRecoveryCodes,
  setMfaSwitch,
} from '../mfa.js';

const STEP_LIMIT = { rateLimit: { max: 10, timeWindow: '5 minutes' } };
const NUKE_PHRASE = 'HARD RESET';
const hashToken = (value) => crypto.createHash('sha256').update(value).digest('hex');

// The person who passed the password check but is not signed in yet.
function pendingUser(request, kind) {
  const p = request.session.mfaPending;
  if (!p || p.expires < Date.now() || (kind && p.kind !== kind)) return null;
  return db.prepare('SELECT * FROM users WHERE id = ? AND deleted_at IS NULL AND is_system = 0').get(p.userId) || null;
}

function setDeviceCookie(reply, token) {
  reply.setCookie(DEVICE_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: TRUST_DAYS * 86400,
  });
}

const lockMessage = (minutes) =>
  `Too many wrong codes. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}, or ask an admin to unlock your account.`;

// A wrong code: counts toward the lock. Returns the reply to send.
function wrongCode(reply, user) {
  const locked = recordFailure(user.id);
  if (locked) {
    logActivity(user, 'mfa_locked', `${user.display_name}'s account was locked for ${LOCK_MINUTES} minutes after 5 wrong codes`);
    return reply.code(429).send({ error: lockMessage(LOCK_MINUTES), code: 'MFA_LOCKED' });
  }
  return reply.code(400).send({ error: "That code isn't right. Check the code in your app and try again." });
}

// Reads the person's authenticator secret. A wrong MFA_ENCRYPTION_KEY can't
// decrypt it: fail closed and tell the admin in the log.
function readSecret(user, request) {
  try {
    return decryptSecret(user.mfa_secret_enc);
  } catch (err) {
    request.log.error(`two-step: cannot decrypt the secret for user ${user.id} (has MFA_ENCRYPTION_KEY changed?)`);
    return null;
  }
}

export default async function mfaRoutes(fastify) {
  // ---------------------------------------------------------------- sign-in
  // Second step of a sign-in: the 6-digit code, or a recovery code.
  fastify.post('/api/auth/mfa/verify', { config: STEP_LIMIT }, async (request, reply) => {
    const user = mfaActive() ? pendingUser(request, 'code') : null;
    if (!user || !user.mfa_enabled_at) {
      return reply.code(400).send({ error: 'That sign-in timed out. Enter your password again.', code: 'MFA_EXPIRED' });
    }
    const wait = lockMinutesLeft(user);
    if (wait) return reply.code(429).send({ error: lockMessage(wait), code: 'MFA_LOCKED' });

    const code = request.body && typeof request.body.code === 'string' ? request.body.code.slice(0, 40) : '';
    const secret = readSecret(user, request);
    if (!secret) {
      return reply.code(503).send({ error: 'Two-step sign-in is unavailable right now. Ask an admin for help.' });
    }

    let usedRecovery = false;
    let accepted = false;
    if (looksLikeRecoveryCode(code) && !/^\d{6}$/.test(code.replace(/\s+/g, ''))) {
      const used = db
        .prepare("UPDATE user_recovery_codes SET used_at = datetime('now') WHERE user_id = ? AND code_hash = ? AND used_at IS NULL")
        .run(user.id, recoveryHash(code));
      accepted = used.changes === 1;
      usedRecovery = accepted;
    } else {
      const step = checkTotp(secret, code, user.mfa_last_step);
      if (step !== null) {
        // Only the first request to use this time step wins, so a code can't be used twice.
        accepted =
          db
            .prepare('UPDATE users SET mfa_last_step = ? WHERE id = ? AND (mfa_last_step IS NULL OR mfa_last_step < ?)')
            .run(step, user.id, step).changes === 1;
      }
    }
    if (!accepted) return wrongCode(reply, user);

    // The device limit is re-checked here, in the same step that records the
    // device, so two sign-ins at once can't go past 5.
    const token = db.transaction(() => issueDevice(user.id, request.headers['user-agent'], request.cookies[DEVICE_COOKIE]))();
    if (token === null) {
      logActivity(user, 'mfa_device_limit', `${user.display_name} was refused a sign-in: 5 active devices`);
      return reply.code(403).send({ error: DEVICE_LIMIT_MESSAGE, code: 'MFA_DEVICE_LIMIT' });
    }
    clearFailures(user.id);
    setDeviceCookie(reply, token);
    if (usedRecovery) {
      const left = db.prepare('SELECT COUNT(*) AS n FROM user_recovery_codes WHERE user_id = ? AND used_at IS NULL').get(user.id).n;
      logActivity(user, 'mfa_recovery_used', `${user.display_name} signed in with a recovery code (${left} left)`);
    }
    completeSignIn(request, user);
    return publicUser(user);
  });

  // ------------------------------------------------------------------ setup
  // Starts setting up an authenticator: a new secret to scan or type into the
  // app. For someone mid-sign-in no password is asked (they just gave it); for
  // someone already signed in the password is asked again.
  fastify.post('/api/auth/mfa/setup/start', { config: STEP_LIMIT }, async (request, reply) => {
    if (!MFA_KEY_CONFIGURED || MFA_FORCE_OFF) {
      return reply.code(409).send({ error: "Two-step sign-in isn't available on this server." });
    }
    let user = pendingUser(request, 'setup');
    if (!user) {
      user = loadSessionUser(request);
      if (!user) return reply.code(400).send({ error: 'That sign-in timed out. Enter your password again.', code: 'MFA_EXPIRED' });
      if (user.must_change_password) return reply.code(403).send({ error: 'Choose a new password first' });
      const password = request.body && request.body.password;
      const ok = typeof password === 'string' && (await argon2.verify(user.password_hash, password).catch(() => false));
      if (!ok) return reply.code(400).send({ error: 'Your password is incorrect' });
    }
    if (user.mfa_enabled_at) {
      return reply.code(409).send({ error: 'Two-step sign-in is already set up. Ask an admin to reset it if you need to start again.' });
    }
    const secret = newSecret();
    request.session.mfaEnroll = { userId: user.id, secret: base32Encode(secret), expires: Date.now() + PENDING_MS * 2 };
    return { secret: base32Encode(secret), uri: otpauthUri(user.username, secret) };
  });

  // Proves the app works: the first code from it turns two-step on for this
  // person. Returns the recovery codes, shown only this once.
  fastify.post('/api/auth/mfa/setup/confirm', { config: STEP_LIMIT }, async (request, reply) => {
    const pending = pendingUser(request, 'setup');
    const user = pending || loadSessionUser(request);
    const enroll = request.session.mfaEnroll;
    if (!user || !enroll || enroll.userId !== user.id || enroll.expires < Date.now()) {
      return reply.code(400).send({ error: 'That setup timed out. Start again.', code: 'MFA_EXPIRED' });
    }
    if (user.mfa_enabled_at) return reply.code(409).send({ error: 'Two-step sign-in is already set up.' });
    const secret = base32Decode(enroll.secret);
    const code = request.body && typeof request.body.code === 'string' ? request.body.code : '';
    const step = checkTotp(secret, code, null);
    if (step === null) return reply.code(400).send({ error: "That code isn't right. Check the code in your app and try again." });

    const result = db.transaction(() => {
      db.prepare(
        "UPDATE users SET mfa_secret_enc = ?, mfa_enabled_at = datetime('now'), mfa_last_step = ?, mfa_failed_count = 0, mfa_locked_until = NULL WHERE id = ?"
      ).run(encryptSecret(secret), step, user.id);
      const codes = replaceRecoveryCodes(user.id);
      // Setting up counts as a code check on this device.
      const token = issueDevice(user.id, request.headers['user-agent'], request.cookies[DEVICE_COOKIE]);
      return { codes, token };
    })();
    if (result.token) setDeviceCookie(reply, result.token);
    logActivity(user, 'mfa_enrolled', `${user.display_name} set up two-step sign-in`);
    if (pending) completeSignIn(request, user);
    delete request.session.mfaEnroll;
    return { recovery_codes: result.codes };
  });

  // ---------------------------------------------------------------- profile
  fastify.get('/api/me/mfa', { preHandler: requireAuth }, async (request) => {
    purgeExpiredDevices();
    const status = mfaStatusFor(request.user);
    const current = request.cookies[DEVICE_COOKIE] ? hashToken(request.cookies[DEVICE_COOKIE]) : null;
    const devices = db
      .prepare("SELECT id, label, created_at, expires_at, token_hash FROM mfa_trusted_devices WHERE user_id = ? AND expires_at > datetime('now') ORDER BY created_at")
      .all(request.user.id)
      .map((d) => ({ id: d.id, label: d.label, created_at: d.created_at, expires_at: d.expires_at, current: d.token_hash === current }));
    const recoveryLeft = request.user.mfa_enabled_at
      ? db.prepare('SELECT COUNT(*) AS n FROM user_recovery_codes WHERE user_id = ? AND used_at IS NULL').get(request.user.id).n
      : 0;
    return { ...status, switchOn: mfaSwitchOn(), maxDevices: MAX_DEVICES, devices, recoveryLeft };
  });

  // "Free up a device slot": only the person's own devices.
  fastify.delete('/api/me/devices/:id', { preHandler: requireAuth }, async (request, reply) => {
    const removed = db
      .prepare('DELETE FROM mfa_trusted_devices WHERE id = ? AND user_id = ?')
      .run(request.params.id, request.user.id);
    if (removed.changes === 0) return reply.code(404).send({ error: 'Device not found' });
    refreshDeviceWarning(request.user.id);
    logActivity(request.user, 'mfa_device_removed', `${request.user.display_name} removed a trusted device`);
    return { ok: true };
  });

  fastify.post('/api/me/mfa/warning/dismiss', { preHandler: requireAuth }, async (request) => {
    db.prepare('UPDATE users SET mfa_device_warning_closed = 1 WHERE id = ?').run(request.user.id);
    return { ok: true };
  });

  // New recovery codes (the old ones stop working). Needs the password AND a
  // current code from the app.
  fastify.post('/api/me/mfa/recovery', { preHandler: requireAuth, config: STEP_LIMIT }, async (request, reply) => {
    const user = request.user;
    if (!user.mfa_enabled_at) return reply.code(409).send({ error: 'Two-step sign-in is not set up.' });
    const wait = lockMinutesLeft(user);
    if (wait) return reply.code(429).send({ error: lockMessage(wait), code: 'MFA_LOCKED' });
    const { password, code } = request.body || {};
    const ok = typeof password === 'string' && (await argon2.verify(user.password_hash, password).catch(() => false));
    if (!ok) return reply.code(400).send({ error: 'Your password is incorrect' });
    const secret = readSecret(user, request);
    if (!secret) return reply.code(503).send({ error: 'Two-step sign-in is unavailable right now. Ask an admin for help.' });
    const step = checkTotp(secret, code, user.mfa_last_step);
    const accepted =
      step !== null &&
      db
        .prepare('UPDATE users SET mfa_last_step = ? WHERE id = ? AND (mfa_last_step IS NULL OR mfa_last_step < ?)')
        .run(step, user.id, step).changes === 1;
    if (!accepted) return wrongCode(reply, user);
    clearFailures(user.id);
    const codes = db.transaction(() => replaceRecoveryCodes(user.id))();
    logActivity(user, 'mfa_recovery_regenerated', `${user.display_name} made new recovery codes`);
    return { recovery_codes: codes };
  });

  // ------------------------------------------------------------------ admin
  fastify.get('/api/admin/mfa', { preHandler: requireAdmin }, async () => {
    const people = db
      .prepare(
        `SELECT id, username, display_name, (mfa_enabled_at IS NOT NULL) AS enrolled,
                (mfa_locked_until IS NOT NULL AND mfa_locked_until > datetime('now')) AS locked
         FROM users WHERE deleted_at IS NULL AND is_system = 0 ORDER BY display_name COLLATE NOCASE`
      )
      .all();
    return {
      enabled: mfaSwitchOn(),
      active: mfaActive(),
      keyConfigured: MFA_KEY_CONFIGURED,
      forceOff: MFA_FORCE_OFF,
      enrolledCount: people.filter((p) => p.enrolled).length,
      people: people.map((p) => ({ ...p, enrolled: !!p.enrolled, locked: !!p.locked })),
    };
  });

  // The team switch. Turning it on needs the key set on the server and the
  // admin's own authenticator already set up, so nobody locks themselves out.
  fastify.put('/api/admin/mfa', { preHandler: requireAdmin }, async (request, reply) => {
    const { enabled } = request.body || {};
    if (typeof enabled !== 'boolean') return reply.code(400).send({ error: 'enabled must be true or false' });
    if (enabled) {
      if (MFA_FORCE_OFF) {
        return reply.code(409).send({ error: 'Two-step sign-in is forced off on this server (MFA_FORCE_OFF).' });
      }
      if (!MFA_KEY_CONFIGURED) {
        return reply.code(409).send({
          error: 'Set MFA_ENCRYPTION_KEY (at least 32 characters) in .env and restart before turning two-step sign-in on.',
          code: 'MFA_KEY_MISSING',
        });
      }
      if (!request.user.mfa_enabled_at) {
        return reply.code(409).send({ error: 'Set up your own authenticator first, then turn this on.', code: 'MFA_ADMIN_SETUP_REQUIRED' });
      }
    }
    if (mfaSwitchOn() === enabled) return { enabled };
    db.transaction(() => {
      setMfaSwitch(enabled);
      // Turning it off ends every trusted device. Secrets are kept.
      if (!enabled) db.prepare('DELETE FROM mfa_trusted_devices').run();
      if (!enabled) db.prepare('UPDATE users SET mfa_device_warning_closed = 0').run();
    })();
    logActivity(request.user, enabled ? 'mfa_switch_on' : 'mfa_switch_off', `${request.user.display_name} turned two-step sign-in ${enabled ? 'on' : 'off'} for the team`);
    return { enabled };
  });

  // Lost phone: clears one person's setup so they set it up again at next sign-in.
  fastify.post('/api/admin/mfa/users/:id/reset', { preHandler: requireAdmin }, async (request, reply) => {
    const target = db.prepare('SELECT * FROM users WHERE id = ? AND deleted_at IS NULL AND is_system = 0').get(request.params.id);
    if (!target) return reply.code(404).send({ error: 'User not found' });
    db.transaction(() => clearMfa(target.id))();
    logActivity(request.user, 'mfa_reset', `${request.user.display_name} reset two-step sign-in for ${target.display_name}`, {
      user: target.display_name,
    });
    return { ok: true };
  });

  fastify.post('/api/admin/mfa/users/:id/unlock', { preHandler: requireAdmin }, async (request, reply) => {
    const target = db.prepare('SELECT * FROM users WHERE id = ? AND deleted_at IS NULL AND is_system = 0').get(request.params.id);
    if (!target) return reply.code(404).send({ error: 'User not found' });
    clearFailures(target.id);
    logActivity(request.user, 'mfa_unlocked', `${request.user.display_name} unlocked ${target.display_name}'s account`, {
      user: target.display_name,
    });
    return { ok: true };
  });

  // The nuke: every secret, recovery code and trusted device, for everyone.
  // It never decrypts anything, so it still works if MFA_ENCRYPTION_KEY was lost.
  fastify.post('/api/admin/mfa/nuke', { preHandler: requireAdmin, config: STEP_LIMIT }, async (request, reply) => {
    const { password, phrase } = request.body || {};
    if (phrase !== NUKE_PHRASE) return reply.code(400).send({ error: `Type ${NUKE_PHRASE} exactly to confirm.` });
    const ok = typeof password === 'string' && (await argon2.verify(request.user.password_hash, password).catch(() => false));
    if (!ok) return reply.code(400).send({ error: 'Your password is incorrect' });
    const people = db.transaction(() => {
      const n = db.prepare('SELECT COUNT(*) AS n FROM users WHERE mfa_enabled_at IS NOT NULL').get().n;
      db.prepare(
        `UPDATE users SET mfa_secret_enc = NULL, mfa_enabled_at = NULL, mfa_last_step = NULL, mfa_failed_count = 0,
                          mfa_locked_until = NULL, mfa_device_warning_closed = 0`
      ).run();
      db.prepare('DELETE FROM user_recovery_codes').run();
      db.prepare('DELETE FROM mfa_trusted_devices').run();
      return n;
    })();
    logActivity(request.user, 'mfa_nuked', `${request.user.display_name} reset all two-step secrets (${people} ${people === 1 ? 'person' : 'people'})`, {
      people_reset: people,
    });
    return { ok: true, people };
  });
}
