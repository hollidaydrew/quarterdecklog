import { useEffect, useRef, useState } from 'react';
import qrcode from 'qrcode-generator';
import { api } from '../api.js';
import RecoveryCodes from './RecoveryCodes.jsx';

// The QR code is drawn here in the browser, so the secret never goes to an
// outside service. It is a small image (a data: URL), which the app's
// content-security-policy already allows.
function qrDataUrl(text) {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  return qr.createDataURL(5, 4);
}

// Sets up an authenticator app: scan the QR code (or type the key), enter the
// first code to prove it works, then save the recovery codes.
//   needPassword: true for someone already signed in (they re-enter their
//   password); false mid-sign-in, when they have just given it.
//   onFinished runs after they confirm they saved the recovery codes.
export default function MfaSetup({ needPassword, onFinished, onCancel }) {
  const [step, setStep] = useState(needPassword ? 'password' : 'starting'); // password | starting | scan | codes
  const [password, setPassword] = useState('');
  const [setup, setSetup] = useState(null); // { secret, uri }
  const [qr, setQr] = useState('');
  const [code, setCode] = useState('');
  const [codes, setCodes] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const start = async (pw) => {
    setError('');
    setBusy(true);
    try {
      const s = await api.post('/api/auth/mfa/setup/start', pw ? { password: pw } : {});
      setSetup(s);
      setQr(qrDataUrl(s.uri));
      setStep('scan');
    } catch (err) {
      setError(err.message);
      setStep(needPassword ? 'password' : 'starting');
    } finally {
      setBusy(false);
    }
  };

  const started = useRef(false);
  useEffect(() => {
    if (!needPassword && !started.current) {
      started.current = true;
      start();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submitPassword = (e) => {
    e.preventDefault();
    start(password);
  };

  const confirm = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const r = await api.post('/api/auth/mfa/setup/confirm', { code });
      setCodes(r.recovery_codes);
      setStep('codes');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (step === 'codes') return <RecoveryCodes codes={codes} onDone={onFinished} />;

  if (step === 'password') {
    return (
      <form className="stack" onSubmit={submitPassword}>
        <p style={{ margin: 0 }}>Enter your password to start setting up two-step sign-in.</p>
        <input type="password" placeholder="Your password" value={password} onChange={(e) => setPassword(e.target.value)} required autoFocus autoComplete="current-password" />
        {error && <p className="error-text">{error}</p>}
        <div className="modal-actions" style={{ justifyContent: 'flex-start' }}>
          <button type="submit" disabled={busy}>{busy ? 'Starting…' : 'Continue'}</button>
          {onCancel && <button type="button" className="secondary" onClick={onCancel}>Cancel</button>}
        </div>
      </form>
    );
  }

  if (step === 'starting' || !setup) {
    return (
      <div className="stack">
        {error ? <p className="error-text">{error}</p> : <p className="muted">Getting ready…</p>}
        {error && onCancel && <button type="button" className="secondary" onClick={onCancel}>Back</button>}
      </div>
    );
  }

  const spaced = setup.secret.replace(/(.{4})/g, '$1 ').trim();
  return (
    <form className="stack" onSubmit={confirm}>
      <p style={{ margin: 0 }}>
        <strong>Set up two-step sign-in.</strong> Open an authenticator app (Microsoft Authenticator, Google Authenticator, Authy, 1Password and similar), add an account, and scan this code.
      </p>
      <img className="qr-image" src={qr} alt="QR code for your authenticator app" width="190" height="190" />
      <p className="muted" style={{ margin: 0 }}>
        Can't scan it? Choose to enter a key and type this (spaces don't matter):
      </p>
      <code className="temp-password" style={{ wordBreak: 'break-all' }}>{spaced}</code>
      <p style={{ margin: 0 }}>Then enter the 6-digit code the app shows.</p>
      <input
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        placeholder="6-digit code"
        maxLength={7}
        value={code}
        onChange={(e) => setCode(e.target.value)}
        required
        autoFocus
      />
      {error && <p className="error-text">{error}</p>}
      <div className="modal-actions" style={{ justifyContent: 'flex-start' }}>
        <button type="submit" disabled={busy || code.replace(/\s/g, '').length !== 6}>{busy ? 'Checking…' : 'Turn on'}</button>
        {onCancel && <button type="button" className="secondary" onClick={onCancel}>Cancel</button>}
      </div>
    </form>
  );
}
