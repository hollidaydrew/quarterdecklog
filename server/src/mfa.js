import crypto from 'node:crypto';
import { db } from './db.js';
import { MFA_ENCRYPTION_KEY, MFA_KEY_CONFIGURED, MFA_FORCE_OFF } from './config.js';

// Two-step sign-in with an authenticator app (Microsoft Authenticator, Google
// Authenticator, Authy, 1Password and similar). Standard TOTP, RFC 6238: HMAC-SHA1,
// 30-second steps, 6 digits. Those apps only understand these defaults.

export const MAX_DEVICES = 5;
export const TRUST_DAYS = 7;
export const LOCK_AFTER = 5;
export const LOCK_MINUTES = 15;
export const RECOVERY_COUNT = 10;
export const PENDING_MS = 5 * 60 * 1000;
export const DEVICE_COOKIE = 'qdl_td';
export const DEVICE_LIMIT_MESSAGE =
  'Maximum 5 active logged in devices. Sign in on one of your 5 active devices and visit your profile to free up a device slot.';
export const DEVICE_WARNING_MESSAGE = 'Maximum 5 active logged in devices. Visit your profile to free up a device slot';

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const sqlTime = (date) => date.toISOString().slice(0, 19).replace('T', ' ');

// --- the team switch ---
export function mfaSwitchOn() {
  const row = db.prepare("SELECT value FROM app_meta WHERE key = 'mfa_enabled'").get();
  return !!row && row.value === '1';
}
export function setMfaSwitch(on) {
  db.prepare("INSERT INTO app_meta (key, value) VALUES ('mfa_enabled', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(
    on ? '1' : '0'
  );
}
// Whether two-step is being enforced right now. It does NOT depend on the key
// being present: if the switch is on and the key has gone missing, sign-ins are
// refused (fail closed) rather than quietly dropping the protection. The way
// back in is to restore the key, or to set MFA_FORCE_OFF=true for a while.
export function mfaActive() {
  return !MFA_FORCE_OFF && mfaSwitchOn();
}

// Called once at startup.
export function mfaStartupCheck() {
  if (mfaSwitchOn() && !MFA_FORCE_OFF && !MFA_KEY_CONFIGURED) {
    console.error(
      'ERROR: Two-step sign-in is turned on but MFA_ENCRYPTION_KEY is missing (or shorter than 32 characters), so nobody can sign in.\n' +
        'Restore the key in .env, or set MFA_FORCE_OFF=true to get back in, then reset two-step in Admin.'
    );
  }
}

// --- base32 and TOTP ---
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function base32Encode(buffer) {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}
export function base32Decode(text) {
  let bits = 0;
  let value = 0;
  const out = [];
  for (const ch of text.replace(/=+$/, '').toUpperCase()) {
    const idx = B32.indexOf(ch);
    if (idx < 0) throw new Error('bad base32');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export function newSecret() {
  return crypto.randomBytes(20); // 160 bits
}

// The 6-digit code for one 30-second step (RFC 4226 dynamic truncation).
export function totpAt(secret, step) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const hmac = crypto.createHmac('sha1', secret).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 15;
  const bin = ((hmac[offset] & 0x7f) << 24) | (hmac[offset + 1] << 16) | (hmac[offset + 2] << 8) | hmac[offset + 3];
  return String(bin % 1000000).padStart(6, '0');
}

export function currentStep(now = Date.now()) {
  return Math.floor(now / 30000);
}

// Returns the time step the code matches (this step or one either side, for a
// slightly wrong phone clock), or null. A step at or before lastStep is refused,
// so a code can't be used twice.
export function checkTotp(secret, code, lastStep, now = Date.now()) {
  const typed = String(code || '').replace(/\s+/g, '');
  if (!/^\d{6}$/.test(typed)) return null;
  const base = currentStep(now);
  let matched = null;
  for (const delta of [-1, 0, 1]) {
    const step = base + delta;
    const good = crypto.timingSafeEqual(Buffer.from(totpAt(secret, step)), Buffer.from(typed));
    if (good && matched === null && (lastStep === null || lastStep === undefined || step > lastStep)) matched = step;
  }
  return matched;
}

export function otpauthUri(username, secret) {
  return (
    `otpauth://totp/${encodeURIComponent('QuarterDeckLog')}:${encodeURIComponent(username)}` +
    `?secret=${base32Encode(secret)}&issuer=QuarterDeckLog&algorithm=SHA1&digits=6&period=30`
  );
}

// --- secret encryption (AES-256-GCM, key derived from MFA_ENCRYPTION_KEY) ---
function encryptionKey() {
  if (!MFA_KEY_CONFIGURED) throw new Error('MFA_ENCRYPTION_KEY is not set');
  return Buffer.from(crypto.hkdfSync('sha256', MFA_ENCRYPTION_KEY, 'quarterdecklog-mfa', 'authenticator-secret', 32));
}
export function encryptSecret(secret) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const body = Buffer.concat([cipher.update(secret), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64');
}
export function decryptSecret(stored) {
  const raw = Buffer.from(stored, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), raw.subarray(0, 12));
  decipher.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]);
}

// --- recovery codes ---
// No look-alike characters (0/O, 1/I/L), like the temporary passwords.
const RECOVERY_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const normalizeRecovery = (code) => String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
export function looksLikeRecoveryCode(code) {
  return normalizeRecovery(code).length === 10;
}
export function recoveryHash(code) {
  return sha256(normalizeRecovery(code));
}
function newRecoveryCode() {
  let s = '';
  for (let i = 0; i < 10; i++) s += RECOVERY_ALPHABET[crypto.randomInt(RECOVERY_ALPHABET.length)];
  return `${s.slice(0, 5)}-${s.slice(5)}`;
}
// Replaces a person's recovery codes and returns the new ones (shown once).
export function replaceRecoveryCodes(userId) {
  const codes = Array.from({ length: RECOVERY_COUNT }, newRecoveryCode);
  db.prepare('DELETE FROM user_recovery_codes WHERE user_id = ?').run(userId);
  const insert = db.prepare('INSERT OR IGNORE INTO user_recovery_codes (user_id, code_hash) VALUES (?, ?)');
  for (const code of codes) insert.run(userId, recoveryHash(code));
  return codes;
}

// --- the 5-wrong-codes lock ---
export function lockMinutesLeft(user) {
  if (!user.mfa_locked_until) return 0;
  const left = new Date(`${user.mfa_locked_until.replace(' ', 'T')}Z`).getTime() - Date.now();
  return left > 0 ? Math.ceil(left / 60000) : 0;
}
// Counts one wrong code. Returns true when this one locked the account.
export function recordFailure(userId) {
  const row = db.prepare('SELECT mfa_failed_count FROM users WHERE id = ?').get(userId);
  const count = (row ? row.mfa_failed_count : 0) + 1;
  if (count >= LOCK_AFTER) {
    db.prepare('UPDATE users SET mfa_failed_count = 0, mfa_locked_until = ? WHERE id = ?').run(
      sqlTime(new Date(Date.now() + LOCK_MINUTES * 60000)),
      userId
    );
    return true;
  }
  db.prepare('UPDATE users SET mfa_failed_count = ? WHERE id = ?').run(count, userId);
  return false;
}
export function clearFailures(userId) {
  db.prepare('UPDATE users SET mfa_failed_count = 0, mfa_locked_until = NULL WHERE id = ?').run(userId);
}

// --- trusted devices: a random cookie value, stored only as a hash ---
export function deviceLabel(userAgent) {
  const ua = String(userAgent || '');
  if (!ua) return 'Unknown device';
  let browser = 'Browser';
  if (/Edg\//.test(ua)) browser = 'Edge';
  else if (/OPR\/|Opera/.test(ua)) browser = 'Opera';
  else if (/Firefox\//.test(ua)) browser = 'Firefox';
  else if (/Chrome\/|CriOS\//.test(ua)) browser = 'Chrome';
  else if (/Safari\//.test(ua)) browser = 'Safari';
  let os = 'unknown system';
  if (/iPhone|iPad|iPod/.test(ua)) os = 'iOS';
  else if (/Android/.test(ua)) os = 'Android';
  else if (/Windows/.test(ua)) os = 'Windows';
  else if (/Mac OS X|Macintosh/.test(ua)) os = 'macOS';
  else if (/CrOS/.test(ua)) os = 'ChromeOS';
  else if (/Linux/.test(ua)) os = 'Linux';
  return `${browser} on ${os}`.slice(0, 40);
}

export function purgeExpiredDevices() {
  db.prepare("DELETE FROM mfa_trusted_devices WHERE expires_at <= datetime('now')").run();
}
export function activeDeviceCount(userId) {
  return db
    .prepare("SELECT COUNT(*) AS n FROM mfa_trusted_devices WHERE user_id = ? AND expires_at > datetime('now')")
    .get(userId).n;
}
// A trusted-device cookie that belongs to this person and has not expired.
export function validDevice(userId, cookieValue) {
  if (typeof cookieValue !== 'string' || cookieValue.length < 20 || cookieValue.length > 100) return null;
  return (
    db
      .prepare("SELECT * FROM mfa_trusted_devices WHERE user_id = ? AND token_hash = ? AND expires_at > datetime('now')")
      .get(userId, sha256(cookieValue)) || null
  );
}
// Trusts a device for 7 days from now (fixed: later sign-ins never extend it).
// Replaces only THIS browser's own old row, never another device's. Returns the
// new cookie value, or null when the person already has 5 active devices. Run
// inside a transaction so two sign-ins at once can't go past the limit.
export function issueDevice(userId, userAgent, oldCookieValue) {
  purgeExpiredDevices();
  if (typeof oldCookieValue === 'string' && oldCookieValue.length >= 20 && oldCookieValue.length <= 100) {
    db.prepare('DELETE FROM mfa_trusted_devices WHERE user_id = ? AND token_hash = ?').run(userId, sha256(oldCookieValue));
  }
  if (activeDeviceCount(userId) >= MAX_DEVICES) return null;
  const token = crypto.randomBytes(32).toString('base64url');
  db.prepare('INSERT INTO mfa_trusted_devices (user_id, token_hash, label, expires_at) VALUES (?, ?, ?, ?)').run(
    userId,
    sha256(token),
    deviceLabel(userAgent),
    sqlTime(new Date(Date.now() + TRUST_DAYS * 86400000))
  );
  return token;
}
export function revokeDevices(userId) {
  db.prepare('DELETE FROM mfa_trusted_devices WHERE user_id = ?').run(userId);
  db.prepare('UPDATE users SET mfa_device_warning_closed = 0 WHERE id = ?').run(userId);
}
// When the person has fewer than 5 devices again, the closed notice may come back.
export function refreshDeviceWarning(userId) {
  if (activeDeviceCount(userId) < MAX_DEVICES) {
    db.prepare('UPDATE users SET mfa_device_warning_closed = 0 WHERE id = ? AND mfa_device_warning_closed != 0').run(userId);
  }
}
// Everything two-step knows about one person (used by reset and by deleting a person).
export function clearMfa(userId) {
  db.prepare(
    `UPDATE users SET mfa_secret_enc = NULL, mfa_enabled_at = NULL, mfa_last_step = NULL, mfa_failed_count = 0,
                      mfa_locked_until = NULL, mfa_device_warning_closed = 0 WHERE id = ?`
  ).run(userId);
  db.prepare('DELETE FROM user_recovery_codes WHERE user_id = ?').run(userId);
  db.prepare('DELETE FROM mfa_trusted_devices WHERE user_id = ?').run(userId);
}

// What the browser needs to know about the signed-in person's two-step state.
export function mfaStatusFor(user) {
  if (!mfaActive()) return { active: false, enrolled: !!user.mfa_enabled_at, deviceCount: 0, showDeviceWarning: false };
  refreshDeviceWarning(user.id);
  const deviceCount = activeDeviceCount(user.id);
  const fresh = db.prepare('SELECT mfa_device_warning_closed FROM users WHERE id = ?').get(user.id);
  return {
    active: true,
    enrolled: !!user.mfa_enabled_at,
    deviceCount,
    showDeviceWarning: !!user.mfa_enabled_at && deviceCount >= MAX_DEVICES && !fresh.mfa_device_warning_closed,
  };
}
