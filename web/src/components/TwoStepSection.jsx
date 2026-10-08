import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import MfaSetup from './MfaSetup.jsx';
import RecoveryCodes from './RecoveryCodes.jsx';
import { formatDateTimeShort } from '../lib/dates.js';

// "Two-step sign-in" inside My profile. A person can't turn it on or off for
// themselves (an admin controls it for the team); here they see whether they
// are set up, make new recovery codes, and free up a trusted-device slot.
export default function TwoStepSection({ onChanged }) {
  const [info, setInfo] = useState(null);
  const [view, setView] = useState('main'); // main | setup | recovery | codes
  const [codes, setCodes] = useState([]);
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => api.get('/api/me/mfa').then(setInfo).catch(() => {}), []);
  useEffect(() => { load(); }, [load]);

  if (!info || (!info.active && !info.enrolled)) return null;

  const removeDevice = async (d) => {
    if (!confirm(`Remove "${d.label}"? It will ask for a code the next time it signs in.`)) return;
    setError('');
    try {
      await api.del(`/api/me/devices/${d.id}`);
      await load();
      if (onChanged) onChanged();
    } catch (err) {
      setError(err.message);
    }
  };

  const regenerate = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const r = await api.post('/api/me/mfa/recovery', { password, code });
      setCodes(r.recovery_codes);
      setPassword('');
      setCode('');
      setView('codes');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const finish = async () => {
    setView('main');
    await load();
    if (onChanged) onChanged();
  };

  let body;
  if (view === 'setup') {
    body = <MfaSetup needPassword onFinished={finish} onCancel={() => setView('main')} />;
  } else if (view === 'codes') {
    body = <RecoveryCodes codes={codes} onDone={finish} />;
  } else if (view === 'recovery') {
    body = (
      <form className="stack" onSubmit={regenerate}>
        <p className="muted" style={{ margin: 0 }}>New recovery codes replace the old ones. Enter your password and a current code from your app.</p>
        <input type="password" placeholder="Your password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
        <input type="text" inputMode="numeric" autoComplete="one-time-code" placeholder="6-digit code" maxLength={7} value={code} onChange={(e) => setCode(e.target.value)} required />
        {error && <p className="error-text">{error}</p>}
        <div className="modal-actions" style={{ marginTop: 0, justifyContent: 'flex-start' }}>
          <button type="submit" disabled={busy}>{busy ? 'Checking…' : 'Make new codes'}</button>
          <button type="button" className="secondary" onClick={() => { setView('main'); setError(''); }}>Cancel</button>
        </div>
      </form>
    );
  } else {
    body = (
      <div className="stack">
        {info.enrolled ? (
          <p style={{ margin: 0 }}>
            Set up with an authenticator app. {info.recoveryLeft} recovery {info.recoveryLeft === 1 ? 'code' : 'codes'} left.
            {!info.active && ' The team is not using two-step sign-in right now.'}
          </p>
        ) : (
          <p style={{ margin: 0 }}>Not set up yet. Your admin turned on two-step sign-in, so you will be asked to set it up the next time you sign in.</p>
        )}
        <div className="modal-actions" style={{ marginTop: 0, justifyContent: 'flex-start' }}>
          {!info.enrolled && <button type="button" onClick={() => setView('setup')}>Set up now</button>}
          {info.enrolled && info.active && <button type="button" className="secondary" onClick={() => setView('recovery')}>New recovery codes</button>}
        </div>
        {info.enrolled && info.active && (
          <div className="stack" style={{ gap: 6 }}>
            <strong style={{ fontSize: 14 }}>Trusted devices ({info.devices.length} of {info.maxDevices})</strong>
            <p className="muted" style={{ margin: 0 }}>
              A device that passed a code is trusted for 7 days, then asks again. At most {info.maxDevices} can be trusted at once; remove one to free a slot.
            </p>
            {info.devices.length === 0 && <p className="muted" style={{ margin: 0 }}>No trusted devices.</p>}
            {info.devices.map((d) => (
              <div key={d.id} className="list-row" style={{ padding: '8px 0' }}>
                <span className="user-info">
                  <span>{d.label}{d.current ? ' · this device' : ''}</span>
                  <span className="muted last-login">Verified {formatDateTimeShort(d.created_at)} · asks again {formatDateTimeShort(d.expires_at)}</span>
                </span>
                <span className="row-actions"><button className="secondary" onClick={() => removeDevice(d)}>Remove</button></span>
              </div>
            ))}
            {error && <p className="error-text">{error}</p>}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="stack profile-password">
      <h4 style={{ margin: 0 }}>Two-step sign-in</h4>
      {body}
    </div>
  );
}
