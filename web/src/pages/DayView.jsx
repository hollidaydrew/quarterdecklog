import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../api.js';
import EntryCard from '../components/EntryCard.jsx';
import EntryEditor from '../components/EntryEditor.jsx';
import TagChip from '../components/TagChip.jsx';
import Modal from '../components/Modal.jsx';

export default function DayView({ user }) {
  const { date } = useParams();
  const [entries, setEntries] = useState([]);
  const [allTags, setAllTags] = useState([]);
  const [activeFilterIds, setActiveFilterIds] = useState(new Set());
  const [modalMode, setModalMode] = useState(null); // null | 'new' | entry object being edited
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = () => {
    api.get(`/api/entries?date=${date}`).then(setEntries).catch((err) => setError(err.message));
  };

  useEffect(() => {
    load();
    api.get('/api/tags').then(setAllTags);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  const toggleFilter = (id) => {
    setActiveFilterIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const visibleEntries = activeFilterIds.size === 0
    ? entries
    : entries.filter((e) => e.tags.some((t) => activeFilterIds.has(t.id)));

  const handleSave = async ({ body, tag_ids }) => {
    setSaving(true);
    setError('');
    try {
      if (modalMode === 'new') {
        await api.post('/api/entries', { body, entry_date: date, tag_ids });
      } else {
        await api.put(`/api/entries/${modalMode.id}`, { body, tag_ids });
      }
      setModalMode(null);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (entry) => {
    if (!confirm('Delete this entry? This cannot be undone.')) return;
    await api.del(`/api/entries/${entry.id}`);
    load();
  };

  const niceDate = new Date(date + 'T00:00:00').toLocaleDateString(undefined, {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  return (
    <div>
      <div className="day-header">
        <div>
          <Link to="/" className="muted">&larr; Calendar</Link>
          <h2 style={{ margin: '4px 0 0' }}>{niceDate}</h2>
        </div>
        <button onClick={() => setModalMode('new')}>+ New entry</button>
      </div>

      {allTags.length > 0 && (
        <div className="tag-filter-row">
          {allTags.map((tag) => (
            <TagChip key={tag.id} tag={tag} outline active={activeFilterIds.has(tag.id)} onClick={() => toggleFilter(tag.id)} />
          ))}
        </div>
      )}

      {error && <p className="error-text">{error}</p>}

      <div className="entry-list">
        {visibleEntries.length === 0 && <p className="muted">No entries for this day yet.</p>}
        {visibleEntries.map((entry) => (
          <EntryCard
            key={entry.id}
            entry={entry}
            canEdit={entry.author_id === user.id || user.is_admin}
            onEdit={() => setModalMode(entry)}
            onDelete={() => handleDelete(entry)}
          />
        ))}
      </div>

      {modalMode && (
        <Modal onClose={() => setModalMode(null)}>
          <h3 style={{ marginTop: 0 }}>{modalMode === 'new' ? 'New entry' : 'Edit entry'}</h3>
          <EntryEditor
            initialBody={modalMode === 'new' ? '' : modalMode.body}
            allTags={allTags}
            initialTagIds={modalMode === 'new' ? [] : modalMode.tags.map((t) => t.id)}
            onSave={handleSave}
            onCancel={() => setModalMode(null)}
            saving={saving}
          />
        </Modal>
      )}
    </div>
  );
}
