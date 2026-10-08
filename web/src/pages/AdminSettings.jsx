import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import TagChip from '../components/TagChip.jsx';
import Modal from '../components/Modal.jsx';
import MfaSetup from '../components/MfaSetup.jsx';
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

function UserRoster({ currentUser, mfaActive, onSelfChanged }) {
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

  const resetTwoStep = async (u) => {
    if (!confirm(`Reset two-step sign-in for ${u.display_name}? They will set it up again the next time they sign in, and every device they trusted will ask for a code.`)) return;
    setError('');
    try {
      await api.post(`/api/admin/mfa/users/${u.id}/reset`);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const unlock = async (u) => {
    setError('');
    try {
      await api.post(`/api/admin/mfa/users/${u.id}/unlock`);
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
                {mfaActive && (u.mfa_enrolled ? ' · two-step set up' : ' · two-step not set up yet')}
                {u.mfa_locked ? ' · LOCKED after wrong codes' : ''}
              </span>
            </span>
            <span className="row-actions">
              <button className="secondary" onClick={() => setEditing(u)}>Edit</button>
              {u.mfa_locked && <button className="secondary" onClick={() => unlock(u)}>Unlock</button>}
              {u.mfa_enrolled && <button className="secondary" onClick={() => resetTwoStep(u)}>Reset two-step</button>}
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

function NewKeyModal({ created, onClose }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(created.key);
      setCopied(true);
    } catch {
      // Clipboard needs HTTPS; the key is shown to copy by hand.
    }
  };
  return (
    <Modal onClose={onClose} label="New API key">
      <div className="stack">
        <h3 style={{ margin: 0 }}>API key "{created.name}"</h3>
        <code className="temp-password" style={{ wordBreak: 'break-all' }}>{created.key}</code>
        <p className="muted" style={{ margin: 0 }}>
          Copy it now and keep it private, like a password. This is the only time it's shown; if it's lost, revoke it and make a new one.
        </p>
        <div className="modal-actions">
          <button type="button" className="secondary" onClick={copy}>{copied ? 'Copied' : 'Copy key'}</button>
          <button type="button" onClick={onClose}>Done</button>
        </div>
      </div>
    </Modal>
  );
}

function ApiKeyManager() {
  const [info, setInfo] = useState(null); // { enabled, keys } | null while loading
  const [name, setName] = useState('');
  const [scope, setScope] = useState('read');
  const [expires, setExpires] = useState('');
  const [created, setCreated] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => api.get('/api/admin/api-keys').then(setInfo).catch((err) => setError(err.message)), []);
  useEffect(() => { load(); }, [load]);

  const create = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const key = await api.post('/api/admin/api-keys', {
        name,
        scope,
        expires_in_days: expires ? Number(expires) : null,
      });
      setCreated(key);
      setName('');
      load();
    } catch (err) {
      setError(err.message);
    }
    setBusy(false);
  };

  const revoke = async (key) => {
    if (!confirm(`Revoke the "${key.name}" key? Anything using it stops working immediately.`)) return;
    setError('');
    try {
      await api.del(`/api/admin/api-keys/${key.id}`);
    } catch (err) {
      setError(err.message);
    }
    load();
  };

  if (!info) return error ? <p className="error-text">{error}</p> : null;

  return (
    <div>
      {info.enabled ? (
        <p className="muted" style={{ marginTop: 0 }}>
          Keys let scripts and other systems add and read entries and tags. Entries they add belong to "System", and the Activity log shows the key's name.{' '}
          <a href="/api/docs/" target="_blank" rel="noopener">API Docs</a>
        </p>
      ) : (
        <p className="muted" style={{ marginTop: 0 }}>
          The API is turned off. To use it, set <code>API_ENABLED=true</code> in the server's <code>.env</code> file and restart the container.
        </p>
      )}
      {info.enabled && (
        <form onSubmit={create} className="stack" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input
              type="text"
              placeholder="Friendly name (e.g. Nagios, Backup script)"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
              required
              style={{ flex: '1 1 220px' }}
            />
            <select value={scope} onChange={(e) => setScope(e.target.value)} aria-label="Access" style={{ width: 'auto' }}>
              <option value="read">Read only</option>
              <option value="write">Read and write</option>
            </select>
            <select value={expires} onChange={(e) => setExpires(e.target.value)} aria-label="Expires" style={{ width: 'auto' }}>
              <option value="">Never expires</option>
              <option value="30">Expires in 30 days</option>
              <option value="90">Expires in 90 days</option>
              <option value="365">Expires in 1 year</option>
            </select>
            <button type="submit" disabled={busy}>Create key</button>
          </div>
        </form>
      )}
      {error && <p className="error-text">{error}</p>}
      {info.keys.length === 0 && <p className="muted">No API keys yet.</p>}
      {info.keys.map((k) => (
        <div key={k.id} className="list-row user-row">
          <span className="user-info">
            <span>
              {k.name}{' '}
              <span className="muted">
                {k.scope === 'write' ? 'read and write' : 'read only'} · {k.key_prefix}…
                {k.expired ? ' · expired' : k.expires_at ? ` · expires ${formatUsFromDate(new Date(k.expires_at))}` : ''}
              </span>
            </span>
            <span className="muted last-login">
              Created by {k.created_by_name} on {formatDateTimeShort(k.created_at)} ·{' '}
              {k.last_used_at ? `last used ${formatDateTimeShort(k.last_used_at)}` : 'never used'}
            </span>
          </span>
          <span className="row-actions">
            <button className="danger" onClick={() => revoke(k)}>Revoke</button>
          </span>
        </div>
      ))}
      {created && <NewKeyModal created={created} onClose={() => setCreated(null)} />}
    </div>
  );
}

function SecurityManager({ currentUser, onSelfChanged }) {
  const [info, setInfo] = useState(null);
  const [view, setView] = useState('main'); // main | setup
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [nukePassword, setNukePassword] = useState('');
  const [nukePhrase, setNukePhrase] = useState('');
  const [nukeMsg, setNukeMsg] = useState('');

  const load = useCallback(() => api.get('/api/admin/mfa').then(setInfo).catch((err) => setError(err.message)), []);
  useEffect(() => { load(); }, [load]);

  if (!info) return error ? <p className="error-text">{error}</p> : null;

  const me = info.people.find((p) => p.id === currentUser.id);
  const notSetUp = info.people.filter((p) => !p.enrolled);

  const setSwitch = async (enabled) => {
    const text = enabled
      ? 'Turn on two-step sign-in for the whole team? Everyone will set up an authenticator app at their next sign-in (people already signed in are not interrupted), then enter a code from it at most once every 7 days on each device.'
      : 'Turn off two-step sign-in? Nobody will be asked for a code, and every trusted device is forgotten. People keep their setup, so turning it back on does not make them start over.';
    if (!confirm(text)) return;
    setError('');
    setBusy(true);
    try {
      await api.put('/api/admin/mfa', { enabled });
      await load();
      await onSelfChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const nuke = async (e) => {
    e.preventDefault();
    setNukeMsg('');
    setError('');
    if (!confirm('Delete EVERY person\'s two-step setup, recovery codes and trusted devices? Everyone will have to set up again at their next sign-in. This cannot be undone.')) return;
    setBusy(true);
    try {
      const r = await api.post('/api/admin/mfa/nuke', { password: nukePassword, phrase: nukePhrase });
      setNukePassword('');
      setNukePhrase('');
      setNukeMsg(`Done. ${r.people} ${r.people === 1 ? 'person' : 'people'} will set up again at next sign-in.`);
      await load();
      await onSelfChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack">
      <div>
        <h3 style={{ margin: '0 0 4px' }}>Two-step sign-in</h3>
        <p className="muted" style={{ margin: '0 0 8px' }}>
          When on, everyone signs in with their password and a 6-digit code from an authenticator app (Microsoft Authenticator, Google Authenticator and similar).
          A device that passes a code is trusted for 7 days, and each person can trust up to 5 devices. People cannot turn it on or off for themselves.
        </p>
        {info.forceOff && (
          <p className="error-text">The server has MFA_FORCE_OFF=true, so two-step sign-in is being ignored. Remove it from .env and restart to use it again.</p>
        )}
        {!info.keyConfigured && !info.forceOff && (
          <p className="error-text">
            This server has no MFA_ENCRYPTION_KEY. Add one (at least 32 characters, for example from <code>openssl rand -hex 32</code>) to .env and restart before turning two-step on. Keep a copy of it somewhere safe.
          </p>
        )}
        {error && <p className="error-text">{error}</p>}
        <p style={{ margin: '0 0 8px' }}>
          Status: <strong>{info.enabled ? (info.active ? 'On' : 'On (not being enforced)') : 'Off'}</strong>
          {' · '}{info.enrolledCount} of {info.people.length} {info.people.length === 1 ? 'person has' : 'people have'} set it up
        </p>

        {view === 'setup' ? (
          <div className="card" style={{ marginBottom: 8 }}>
            <MfaSetup needPassword onFinished={async () => { setView('main'); await load(); await onSelfChanged(); }} onCancel={() => setView('main')} />
          </div>
        ) : info.enabled ? (
          <button type="button" className="secondary" onClick={() => setSwitch(false)} disabled={busy}>Turn off for the team</button>
        ) : me && !me.enrolled ? (
          <div className="stack">
            <p className="muted" style={{ margin: 0 }}>First set up your own authenticator, so you can't lock yourself out.</p>
            <div><button type="button" onClick={() => setView('setup')} disabled={!info.keyConfigured || info.forceOff}>Set up my authenticator</button></div>
          </div>
        ) : (
          <button type="button" onClick={() => setSwitch(true)} disabled={busy || !info.keyConfigured || info.forceOff}>Turn on for the team</button>
        )}

        {info.enabled && notSetUp.length > 0 && (
          <p className="muted" style={{ margin: '10px 0 0' }}>
            Not set up yet: {notSetUp.map((p) => p.display_name).join(', ')}. They will be asked at their next sign-in.
          </p>
        )}
      </div>

      <div className="danger-zone">
        <h3 style={{ margin: '0 0 4px' }}>Reset everyone</h3>
        <p className="muted" style={{ margin: '0 0 8px' }}>
          Deletes every stored authenticator secret, recovery code and trusted device, for everyone. Use it if the MFA_ENCRYPTION_KEY was lost or changed, or to start over.
          It works even when the secrets can't be read. To reset just one person (a lost phone), use Reset two-step on the Team tab.
        </p>
        <form onSubmit={nuke} className="stack">
          <input type="password" placeholder="Your password" value={nukePassword} onChange={(e) => setNukePassword(e.target.value)} required autoComplete="current-password" />
          <input type="text" placeholder="Type HARD RESET to confirm" value={nukePhrase} onChange={(e) => setNukePhrase(e.target.value)} required autoComplete="off" />
          {nukeMsg && <p className="ok-text">{nukeMsg}</p>}
          <div><button type="submit" className="danger" disabled={busy || nukePhrase !== 'HARD RESET' || !nukePassword}>Reset all two-step setups</button></div>
        </form>
      </div>
    </div>
  );
}

const MAX_IMPORT_BYTES = 50 * 1024 * 1024;

// Export the whole log to a file, and add a file's entries back. Import only
// ever adds: nothing already here is changed or deleted.
function DataManager() {
  const [step, setStep] = useState('pick'); // 'pick' | 'preview' | 'done'
  const [fileData, setFileData] = useState(null);
  const [fileName, setFileName] = useState('');
  const [summary, setSummary] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setStep('pick');
    setFileData(null);
    setFileName('');
    setSummary(null);
    setResult(null);
    setError('');
  };

  const choose = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    setError('');
    if (file.size > MAX_IMPORT_BYTES) {
      setError('That file is larger than 50 MB.');
      return;
    }
    setBusy(true);
    try {
      let data;
      try {
        data = JSON.parse(await file.text());
      } catch {
        throw new Error('That file is not a QuarterDeckLog export (it is not valid JSON).');
      }
      setSummary(await api.post('/api/admin/import/preview', data));
      setFileData(data);
      setFileName(file.name);
      setStep('preview');
    } catch (err) {
      setError(err.message);
    }
    setBusy(false);
  };

  const confirm = async () => {
    setError('');
    setBusy(true);
    try {
      setResult(await api.post('/api/admin/import', fileData));
      setFileData(null);
      setStep('done');
    } catch (err) {
      setError(err.message);
    }
    setBusy(false);
  };

  const n = (v) => Number(v).toLocaleString('en-US');

  return (
    <div className="stack">
      <div>
        <h3 style={{ margin: '0 0 4px' }}>Export</h3>
        <p className="muted" style={{ margin: '0 0 8px' }}>
          Downloads every entry, tag and author name as one file. It holds no passwords, API keys or Activity log.
        </p>
        <a className="button-link" href="/api/admin/export" download>Download export</a>
      </div>

      <div>
        <h3 style={{ margin: '12px 0 4px' }}>Import</h3>
        <p className="muted" style={{ margin: '0 0 8px' }}>
          Adds the entries and tags from an export file. Nothing already here is changed or deleted, and entries that are already here are skipped, so importing the same file twice adds nothing.
          People in the file who are not here become locked accounts that can't sign in, so their entries keep their name.
        </p>
        {error && <p className="error-text">{error}</p>}
        {step === 'pick' && (
          <label className="button-link file-pick">
            {busy ? 'Reading…' : 'Choose export file…'}
            <input type="file" accept=".json,application/json" onChange={choose} disabled={busy} hidden />
          </label>
        )}
        {step === 'preview' && summary && (
          <div className="stack">
            <p style={{ margin: 0 }}>
              <strong>{fileName}</strong>: {n(summary.total)} {summary.total === 1 ? 'entry' : 'entries'} in the file.
              {' '}{n(summary.entries)} will be added, {n(summary.alreadyThere)} are already here.
              {summary.tags > 0 && ` ${n(summary.tags)} new ${summary.tags === 1 ? 'tag' : 'tags'}.`}
              {summary.people > 0 && ` ${n(summary.people)} ${summary.people === 1 ? 'person' : 'people'} will be added as locked accounts.`}
            </p>
            <div className="modal-actions" style={{ justifyContent: 'flex-start' }}>
              <button type="button" onClick={confirm} disabled={busy || summary.entries + summary.tags + summary.people === 0}>
                {busy ? 'Importing…' : 'Import'}
              </button>
              <button type="button" className="secondary" onClick={reset} disabled={busy}>Cancel</button>
            </div>
          </div>
        )}
        {step === 'done' && result && (
          <div className="stack">
            <p style={{ margin: 0 }}>
              Imported {n(result.entries)} {result.entries === 1 ? 'entry' : 'entries'}; {n(result.alreadyThere)} were already here.
              {result.tags > 0 && ` ${n(result.tags)} new ${result.tags === 1 ? 'tag' : 'tags'}.`}
              {result.people > 0 && ` ${n(result.people)} ${result.people === 1 ? 'person' : 'people'} added as locked accounts.`}
            </p>
            <div><button type="button" className="secondary" onClick={reset}>Done</button></div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function AdminSettings({ currentUser, mfa, onSelfChanged }) {
  const [tab, setTab] = useState('tags');

  return (
    <div className="card">
      <div className="admin-tabs">
        <button className={tab === 'tags' ? 'active' : 'secondary'} onClick={() => setTab('tags')}>Tags</button>
        <button className={tab === 'invites' ? 'active' : 'secondary'} onClick={() => setTab('invites')}>Invites</button>
        <button className={tab === 'users' ? 'active' : 'secondary'} onClick={() => setTab('users')}>Team</button>
        <button className={tab === 'api' ? 'active' : 'secondary'} onClick={() => setTab('api')}>API keys</button>
        <button className={tab === 'security' ? 'active' : 'secondary'} onClick={() => setTab('security')}>Security</button>
        <button className={tab === 'data' ? 'active' : 'secondary'} onClick={() => setTab('data')}>Data</button>
      </div>
      {tab === 'tags' && <TagManager />}
      {tab === 'invites' && <InviteManager />}
      {tab === 'users' && <UserRoster currentUser={currentUser} mfaActive={!!(mfa && mfa.active)} onSelfChanged={onSelfChanged} />}
      {tab === 'security' && <SecurityManager currentUser={currentUser} onSelfChanged={onSelfChanged} />}
      {tab === 'api' && <ApiKeyManager />}
      {tab === 'data' && <DataManager />}
    </div>
  );
}
