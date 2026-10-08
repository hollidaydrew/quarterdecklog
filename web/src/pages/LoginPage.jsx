import { useState } from 'react';
import { api } from '../api.js';
import Logo from '../components/Logo.jsx';
import MfaSetup from '../components/MfaSetup.jsx';

export default function LoginPage({ onDone }) {
  const [stage, setStage] = useState('password'); // 'password' | 'code' | 'setup'
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [useRecovery, setUseRecovery] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const back = () => {
    setStage('password');
    setCode('');
    setError('');
    setUseRecovery(false);
  };

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const r = await api.post('/api/auth/login', { username, password });
      // When two-step is on and this browser has not passed a code recently the
      // server does not sign us in yet; it asks for the code (or setup) first.
      if (r && r.mfa_required) {
        setStage(r.mfa_required);
        setPassword('');
      } else {
        await onDone();
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const submitCode = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await api.post('/api/auth/mfa/verify', { code });
      await onDone();
    } catch (err) {
      setError(err.message);
      if (err.message.startsWith('That sign-in timed out')) back();
    } finally {
      setBusy(false);
    }
  };

  if (stage === 'setup') {
    return (
      <div className="auth-screen">
        <div className="auth-card card">
          <Logo className="auth-logo" />
          <MfaSetup needPassword={false} onFinished={onDone} onCancel={back} />
        </div>
      </div>
    );
  }

  if (stage === 'code') {
    return (
      <div className="auth-screen">
        <form className="auth-card card" onSubmit={submitCode}>
          <Logo className="auth-logo" />
          <h2>Two-step sign-in</h2>
          <p className="subtitle">
            {useRecovery
              ? 'Enter one of your recovery codes. Each works once.'
              : 'Enter the 6-digit code from your authenticator app.'}
          </p>
          <input
            type="text"
            inputMode={useRecovery ? 'text' : 'numeric'}
            autoComplete="one-time-code"
            placeholder={useRecovery ? 'Recovery code' : '6-digit code'}
            maxLength={useRecovery ? 14 : 7}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            required
            autoFocus
            autoCapitalize="none"
          />
          {error && <p className="error-text">{error}</p>}
          <button type="submit" disabled={busy}>{busy ? 'Checking…' : 'Sign in'}</button>
          <button type="button" className="secondary" onClick={() => { setUseRecovery((v) => !v); setCode(''); setError(''); }}>
            {useRecovery ? 'Use my authenticator app' : 'Use a recovery code'}
          </button>
          <button type="button" className="secondary" onClick={back}>Back</button>
        </form>
      </div>
    );
  }

  return (
    <div className="auth-screen">
      <form className="auth-card card" onSubmit={submit}>
        <Logo className="auth-logo" />
        <input type="text" placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} required autoCapitalize="none" autoComplete="username" autoFocus />
        <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
        {error && <p className="error-text">{error}</p>}
        <button type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
    </div>
  );
}
