import { useState } from 'react';
import Modal from './Modal.jsx';
import { api } from '../api.js';

// Lets any signed-in user change their own display name, username and
// password. Roles are not editable here: only an admin can change a role.
export default function ProfileModal({ user, onClose, onSaved }) {
  const [displayName, setDisplayName] = useState(user.display_name);
  const [username, setUsername] = useState(user.username);
  const [profileMsg, setProfileMsg] = useState({ type: '', text: '' });
  const [profileBusy, setProfileBusy] = useState(false);

  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [pwMsg, setPwMsg] = useState({ type: '', text: '' });
  const [pwBusy, setPwBusy] = useState(false);

  const saveProfile = async (e) => {
    e.preventDefault();
    setProfileMsg({ type: '', text: '' });
    setProfileBusy(true);
    try {
      await api.put('/api/me', { display_name: displayName, username });
      await onSaved();
      setProfileMsg({ type: 'ok', text: 'Profile saved.' });
    } catch (err) {
      setProfileMsg({ type: 'error', text: err.message });
    } finally {
      setProfileBusy(false);
    }
  };

  const changePassword = async (e) => {
    e.preventDefault();
    setPwMsg({ type: '', text: '' });
    if (next !== confirm) {
      setPwMsg({ type: 'error', text: "New passwords don't match" });
      return;
    }
    setPwBusy(true);
    try {
      await api.post('/api/auth/change-password', { current_password: current, new_password: next });
      setCurrent('');
      setNext('');
      setConfirm('');
      setPwMsg({ type: 'ok', text: 'Password changed.' });
    } catch (err) {
      setPwMsg({ type: 'error', text: err.message });
    } finally {
      setPwBusy(false);
    }
  };

  return (
    <Modal onClose={onClose} closeOnEscape label="My profile">
      <div className="stack">
        <h3 style={{ margin: 0 }}>My profile</h3>

        <form onSubmit={saveProfile} className="stack">
          <label className="field">
            <span>Display name</span>
            <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required maxLength={100} autoFocus />
          </label>
          <label className="field">
            <span>Username</span>
            <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} required maxLength={64} autoCapitalize="none" />
          </label>
          <p className="muted" style={{ margin: 0 }}>
            Your role: {user.is_admin ? 'Admin' : 'Member'}. Only an admin can change roles.
          </p>
          {profileMsg.text && <p className={profileMsg.type === 'error' ? 'error-text' : 'ok-text'}>{profileMsg.text}</p>}
          <div className="modal-actions" style={{ marginTop: 0 }}>
            <button type="submit" disabled={profileBusy}>{profileBusy ? 'Saving…' : 'Save profile'}</button>
          </div>
        </form>

        <form onSubmit={changePassword} className="stack profile-password">
          <h4 style={{ margin: 0 }}>Change password</h4>
          <input type="password" placeholder="Current password" value={current} onChange={(e) => setCurrent(e.target.value)} required autoComplete="current-password" />
          <input type="password" placeholder="New password (min. 8 characters)" value={next} onChange={(e) => setNext(e.target.value)} required minLength={8} autoComplete="new-password" />
          <input type="password" placeholder="Confirm new password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required autoComplete="new-password" />
          {pwMsg.text && <p className={pwMsg.type === 'error' ? 'error-text' : 'ok-text'}>{pwMsg.text}</p>}
          <div className="modal-actions" style={{ marginTop: 0 }}>
            <button type="button" className="secondary" onClick={onClose}>Close</button>
            <button type="submit" disabled={pwBusy}>{pwBusy ? 'Saving…' : 'Change password'}</button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
