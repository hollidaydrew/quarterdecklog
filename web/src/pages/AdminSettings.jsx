import { useEffect, useState } from 'react';
import { api } from '../api.js';
import TagChip from '../components/TagChip.jsx';

function TagManager() {
  const [tags, setTags] = useState([]);
  const [name, setName] = useState('');
  const [color, setColor] = useState('#5B7CFA');
  const [error, setError] = useState('');

  const load = () => api.get('/api/tags').then(setTags);
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
  const [invites, setInvites] = useState([]);
  const [freshLink, setFreshLink] = useState('');

  const load = () => api.get('/api/invites').then(setInvites);
  useEffect(() => { load(); }, []);

  const createInvite = async () => {
    const { token } = await api.post('/api/invites');
    const link = `${window.location.origin}/join/${token}`;
    setFreshLink(link);
    navigator.clipboard?.writeText(link).catch(() => {});
    load();
  };

  const revoke = async (invite) => {
    await api.del(`/api/invites/${invite.id}`);
    load();
  };

  return (
    <div>
      <button onClick={createInvite}>Generate invite link</button>
      {freshLink && (
        <p className="muted" style={{ marginTop: 10 }}>
          Copied to clipboard: <code>{freshLink}</code>
        </p>
      )}
      <div style={{ marginTop: 20 }}>
        {invites.length === 0 && <p className="muted">No invites yet.</p>}
        {invites.map((inv) => (
          <div key={inv.id} className="list-row">
            <span className="muted">
              Created by {inv.created_by_name} · expires {new Date(inv.expires_at).toLocaleDateString()}
              {inv.used_at && ` · used by ${inv.used_by_name}`}
            </span>
            {!inv.used_at && <button className="secondary" onClick={() => revoke(inv)}>Revoke</button>}
          </div>
        ))}
      </div>
    </div>
  );
}

function UserRoster() {
  const [users, setUsers] = useState([]);
  const load = () => api.get('/api/users').then(setUsers);
  useEffect(() => { load(); }, []);

  const removeUser = async (u) => {
    if (!confirm(`Remove ${u.display_name}'s access? Their past entries stay in the log.`)) return;
    try {
      await api.del(`/api/users/${u.id}`);
      load();
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <div>
      {users.map((u) => (
        <div key={u.id} className="list-row">
          <span>{u.display_name} <span className="muted">@{u.username}{u.is_admin ? ' · admin' : ''}</span></span>
          <button className="secondary" onClick={() => removeUser(u)}>Remove</button>
        </div>
      ))}
    </div>
  );
}

export default function AdminSettings() {
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
      {tab === 'users' && <UserRoster />}
    </div>
  );
}
