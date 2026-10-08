import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api.js';
import Logo from '../components/Logo.jsx';
import MfaSetup from '../components/MfaSetup.jsx';

export default function JoinPage({ onDone }) {
  const { token } = useParams();
  const [checking, setChecking] = useState(true);
  const [inviteError, setInviteError] = useState('');

  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [needsSetup, setNeedsSetup] = useState(false); // two-step is on: set up the authenticator before signing in

  useEffect(() => {
    api
      .get(`/api/auth/invite/${token}`)
      .catch((err) => setInviteError(err.message))
      .finally(() => setChecking(false));
  }, [token]);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (password !== confirm) {
      setError("Passwords don't match");
      return;
    }
    setBusy(true);
    try {
      const r = await api.post(`/api/auth/join/${token}`, { username, display_name: displayName, password });
      if (r && r.mfa_required === 'setup') setNeedsSetup(true);
      else await onDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (checking) return null;

  if (inviteError) {
    return (
      <div className="auth-screen">
        <div className="auth-card card">
          <Logo className="auth-logo" />
          <p className="error-text">{inviteError}</p>
          <p className="muted">Ask whoever sent you this link to generate a new one.</p>
        </div>
      </div>
    );
  }

  if (needsSetup) {
    return (
      <div className="auth-screen">
        <div className="auth-card card">
          <Logo className="auth-logo" />
          <p className="muted" style={{ margin: 0 }}>Your account is ready. Two-step sign-in is on for this team, so set it up now.</p>
          <MfaSetup needPassword={false} onFinished={onDone} />
        </div>
      </div>
    );
  }

  return (
    <div className="auth-screen">
      <form className="auth-card card" onSubmit={submit}>
        <Logo className="auth-logo" />
        <input type="text" placeholder="Display name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
        <input type="text" placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} required autoCapitalize="none" />
        <input type="password" placeholder="Password (min. 8 characters)" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
        <input type="password" placeholder="Confirm password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
        {error && <p className="error-text">{error}</p>}
        <button type="submit" disabled={busy}>{busy ? 'Joining…' : 'Join'}</button>
      </form>
    </div>
  );
}
