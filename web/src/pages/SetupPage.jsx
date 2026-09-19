import { useState } from 'react';
import { api } from '../api.js';
import Logo from '../components/Logo.jsx';

export default function SetupPage({ onDone }) {
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (password !== confirm) {
      setError("Passwords don't match");
      return;
    }
    setBusy(true);
    try {
      await api.post('/api/auth/setup', { username, display_name: displayName, password });
      await onDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-screen">
      <form className="auth-card card" onSubmit={submit}>
        <Logo height={56} className="auth-logo" />
        <h2>Welcome</h2>
        <p className="subtitle">This is a fresh install. Create the first admin account to get started.</p>
        <input type="text" placeholder="Display name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
        <input type="text" placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} required autoCapitalize="none" />
        <input type="password" placeholder="Password (min. 8 characters)" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
        <input type="password" placeholder="Confirm password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
        {error && <p className="error-text">{error}</p>}
        <button type="submit" disabled={busy}>{busy ? 'Creating…' : 'Create admin account'}</button>
      </form>
    </div>
  );
}
