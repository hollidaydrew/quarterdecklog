import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import TagChip from '../components/TagChip.jsx';
import Modal from '../components/Modal.jsx';
import { formatDateTimeShort, formatUsFromDate } from '../lib/dates.js';

function TagManager() {
  const [tags, setTags] = useState([]);
  const [name, setName] = useState('');
  const [color, setColor] = useState('#5B7CFA');
  const [error, setError] = useState('');

  const load = () => api.get('/api/tags').then(setTags).catch(() => {});
  useEffect(() => { load(); }, []);

  const addTag = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await api.post('/api/tags', { name, color });
      setName('');
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const deleteTag = async (tag) => {
    if (!confirm(`Delete the "${tag.name}" tag? It will be removed from any entries using it.`)) return;
    await api.del(`/api/tags/${tag.id}`);
    load();
  };

  return (
    <div>
      <form onSubmit={addTag} style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <input type="text" placeholder="Tag name (e.g. bug, incident, FYI)" value={name} onChange={(e) => setName(e.target.value)} required />
        <input type="color" value={color} onChange={(e) => setColor(e.target.value)} style={{ width: 48, padding: 2 }} />
        <button type="submit">Add tag</button>
      </form>
      {error && <p className="error-text">{error}</p>}
      <div className="tag-filter-row">
        {tags.map((tag) => (
          <span key={tag.id} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <TagChip tag={tag} />
            <button className="secondary" style={{ padding: '2px 8px' }} onClick={() => deleteTag(tag)}>&times;</button>
          </span>
        ))}
        {tags.length === 0 && <p className="muted">No tags yet.</p>}
      </div>
    </div>
  );
}

function InviteManager() {
  const [invites, setInvites] = useState(null);
  const [copiedId, setCopiedId] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    return api.get('/api/invites').then(setInvites).catch((err) => setError(err.message));
  }, []);

  // Refresh while this tab is open so a link disappears soon after it is used.
  useEffect(() => {
    load();
    const timer = setInterval(load, 15000);
    return () => clearInterval(timer);
  }, [load]);

  const linkFor = (inv) => `${window.location.origin}/join/${inv.token}`;

  const copy = async (inv) => {
    try {
      await navigator.clipboard.writeText(linkFor(inv));
      setCopiedId(inv.id);
      setTimeout(() => setCopiedId((id) => (id === inv.id ? null : id)), 2000);
    } catch {
      // Clipboard needs HTTPS; the link is also shown in full to copy by hand.
    }
  };

  const createInvite = async () => {
    setError('');
    try {
      const { token } = await api.post('/api/invites');
      const rows = await api.get('/api/invites');
      setInvites(rows);
      const created = rows.find((r) => r.token === token);
      if (created) copy(created);
    } catch (err) {
      setError(err.message);
    }
  };

  const revoke = async (inv) => {
    setError('');
    try {
      await api.del(`/api/invites/${inv.id}`);
    } catch (err) {
      setError(err.message);
    }
    load();
  };

  return (
    <div>
      <button onClick={createInvite}>Generate invite link</button>
      {error && <p className="error-text" style={{ marginTop: 10 }}>{error}</p>}
      <div style={{ marginTop: 20 }}>
        {invites && invites.length === 0 && <p className="muted">No pending invites.</p>}
        {(invites || []).map((inv) => {
          const expired = new Date(inv.expires_at) < new Date();
          return (
            <div key={inv.id} className="list-row invite-row">
              <div className="invite-info">
                {expired ? (
                  <span className="muted">Expired {formatUsFromDate(new Date(inv.expires_at))}</span>
                ) : (
                  <code className="invite-link">{linkFor(inv)}</code>
                )}
                <span className="muted">
                  Created by {inv.created_by_name}
                  {!expired && ` · expires ${formatUsFromDate(new Date(inv.expires_at))}`}
                </span>
              </div>
              <div className="row-actions">
                {!expired && (
                  <button className="secondary" onClick={() => copy(inv)}>{copiedId === inv.id ? 'Copied' : 'Copy link'}</button>
                )}
                <button className="secondary" onClick={() => revoke(inv)}>Revoke</button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EditUserModal({ user, isSelf, onClose, onSaved }) {
  const [displayName, setDisplayName] = useState(user.display_name);
  const [username, setUsername] = useState(user.username);
  const [isAdmin, setIsAdmin] = useState(!!user.is_admin);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await api.put(`/api/users/${user.id}`, { display_name: displayName, username, is_admin: isAdmin });
      await onSaved();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <Modal onClose={onClose} closeOnEscape label="Edit user">
      <form onSubmit={submit} className="stack">
        <h3 style={{ margin: 0 }}>Edit {user.display_name}</h3>
        <label className="field">
          <span>Display name</span>
          <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required maxLength={100} autoFocus />
        </label>
        <label className="field">
          <span>Username</span>
          <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} required maxLength={64} autoCapitalize="none" />
        </label>
        <label className="check">
          <input type="checkbox" checked={isAdmin} onChange={(e) => setIsAdmin(e.target.checked)} disabled={isSelf && isAdmin} />
          <span>Admin</span>
        </label>
        {isSelf && isAdmin && <p className="muted" style={{ margin: 0 }}>You can't remove your own admin role.</p>}
        {error && <p className="error-text">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="secondary" onClick={onClose}>Cancel</button>
          <button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button>
        </div>
      </form>
    </Modal>
  );
}

function TempPasswordModal({ name, password, onClose }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
    } catch {
      // Clipboard needs HTTPS; the password is shown to copy by hand.
    }
  };
  return (
    <Modal onClose={onClose} closeOnEscape label="Temporary password">
      <div className="stack">
        <h3 style={{ margin: 0 }}>Temporary password for {name}</h3>
        <code className="temp-password">{password}</code>
        <p className="muted" style={{ margin: 0 }}>
          Share it with {name} privately. They'll be asked to choose a new password the next time they use the app. This is the only time it's shown.
        </p>
        <div className="modal-actions">
          <button type="button" className="secondary" onClick={copy}>{copied ? 'Copied' : 'Copy password'}</button>
          <button type="button" onClick={onClose}>Done</button>
        </div>
      </div>
    </Modal>
  );
}

function UserRoster({ currentUser, onSelfChanged }) {
  const [users, setUsers] = useState([]);
  const [editing, setEditing] = useState(null);
  const [tempPassword, setTempPassword] = useState(null); // { name, password }
  const [error, setError] = useState('');

  const load = useCallback(() => api.get('/api/users').then(setUsers).catch(() => {}), []);
  useEffect(() => { load(); }, [load]);

  const deleteUser = async (u) => {
    if (!confirm(`Delete ${u.display_name}? They lose access immediately. Their past entries stay in the log under their name.`)) return;
    setError('');
    try {
      await api.del(`/api/users/${u.id}`);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const resetPassword = async (u) => {
    if (!confirm(`Reset ${u.display_name}'s password? Their current password stops working and they must choose a new one.`)) return;
    setError('');
    try {
      const { temp_password } = await api.post(`/api/users/${u.id}/reset-password`);
      setTempPassword({ name: u.display_name, password: temp_password });
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const saved = async () => {
    const editedSelf = editing && editing.id === currentUser.id;
    setEditing(null);
    await load();
    if (editedSelf) await onSelfChanged();
  };

  return (
    <div>
      {error && <p className="error-text">{error}</p>}
      {users.map((u) => {
        const isSelf = u.id === currentUser.id;
        return (
          <div key={u.id} className="list-row user-row">
            <span className="user-info">
              <span>
                {u.display_name}{' '}
                <span className="muted">
                  @{u.username}
                  {u.is_admin ? ' · admin' : ''}
                  {u.must_change_password ? ' · temporary password pending' : ''}
                  {u.invited_by_name ? ` · invited by ${u.invited_by_name}` : ''}
                </span>
              </span>
              <span className="muted last-login">
                {u.last_login_at ? `Last login: ${formatDateTimeShort(u.last_login_at)}` : 'No login recorded yet'}
              </span>
            </span>
            <span className="row-actions">
              <button className="secondary" onClick={() => setEditing(u)}>Edit</button>
              {!isSelf && <button className="secondary" onClick={() => resetPassword(u)}>Reset password</button>}
              {!isSelf && <button className="danger" onClick={() => deleteUser(u)}>Delete</button>}
            </span>
          </div>
        );
      })}
      {editing && (
        <EditUserModal user={editing} isSelf={editing.id === currentUser.id} onClose={() => setEditing(null)} onSaved={saved} />
      )}
      {tempPassword && (
        <TempPasswordModal name={tempPassword.name} password={tempPassword.password} onClose={() => setTempPassword(null)} />
      )}
    </div>
  );
}

export default function AdminSettings({ currentUser, onSelfChanged }) {
  const [tab, setTab] = useState('tags');

  return (
    <div className="card">
      <div className="admin-tabs">
        <button className={tab === 'tags' ? 'active' : 'secondary'} onClick={() => setTab('tags')}>Tags</button>
        <button className={tab === 'invites' ? 'active' : 'secondary'} onClick={() => setTab('invites')}>Invites</button>
        <button className={tab === 'users' ? 'active' : 'secondary'} onClick={() => setTab('users')}>Team</button>
      </div>
      {tab === 'tags' && <TagManager />}
      {tab === 'invites' && <InviteManager />}
      {tab === 'users' && <UserRoster currentUser={currentUser} onSelfChanged={onSelfChanged} />}
    </div>
  );
}
