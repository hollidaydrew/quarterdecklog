import { useState } from 'react';
import { api } from '../api.js';
import Logo from '../components/Logo.jsx';

// Shown instead of the app when an admin has issued a temporary password.
export default function ChangePasswordPage({ onDone, onLogout }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (next !== confirm) {
      setError("Passwords don't match");
      return;
    }
    setBusy(true);
    try {
      await api.post('/api/auth/change-password', { current_password: current, new_password: next });
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
        <Logo className="auth-logo" />
        <h2>Choose a new password</h2>
        <p className="subtitle">An admin gave you a temporary password. Enter it once, then choose your own.</p>
        <input type="password" placeholder="Temporary password" value={current} onChange={(e) => setCurrent(e.target.value)} required autoFocus autoComplete="current-password" />
        <input type="password" placeholder="New password (min. 8 characters)" value={next} onChange={(e) => setNext(e.target.value)} required minLength={8} autoComplete="new-password" />
        <input type="password" placeholder="Confirm new password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required autoComplete="new-password" />
        {error && <p className="error-text">{error}</p>}
        <button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save new password'}</button>
        <button type="button" className="secondary" onClick={onLogout}>Log out</button>
      </form>
    </div>
  );
}
