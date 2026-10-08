// The API is off unless the person running the server turns it on.
export const API_ENABLED = process.env.API_ENABLED === 'true';

// Two-step sign-in (see src/mfa.js).
// MFA_ENCRYPTION_KEY encrypts each person's authenticator secret. It is separate
// from SESSION_SECRET on purpose, so changing the session secret never locks
// anyone out. Two-step can't be turned on until it is set (32+ characters).
// MFA_FORCE_OFF=true is the emergency way back in: the server ignores two-step
// entirely while it is set.
export const MFA_ENCRYPTION_KEY = process.env.MFA_ENCRYPTION_KEY || '';
export const MFA_KEY_CONFIGURED = MFA_ENCRYPTION_KEY.length >= 32;
export const MFA_FORCE_OFF = process.env.MFA_FORCE_OFF === 'true';
if (MFA_ENCRYPTION_KEY && !MFA_KEY_CONFIGURED) {
  console.warn('WARNING: MFA_ENCRYPTION_KEY is set but shorter than 32 characters, so it is ignored and two-step sign-in cannot be turned on.');
}
if (MFA_FORCE_OFF) {
  console.warn('WARNING: MFA_FORCE_OFF=true. Two-step sign-in is being ignored. Remove it from .env and restart to use two-step again.');
}
