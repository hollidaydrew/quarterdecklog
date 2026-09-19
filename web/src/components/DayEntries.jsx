import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import EntryCard from './EntryCard.jsx';
import EntryEditor from './EntryEditor.jsx';
import TagChip from './TagChip.jsx';
import Modal from './Modal.jsx';
import { parseDateStr } from '../lib/dates.js';

// One day's entries with tag filter and create/edit/delete. Used by the
// calendar's day page and by the right-hand pane of the list view.
// onChanged runs after an entry is created, edited or deleted.
export default function DayEntries({ date, user, backLink, onChanged }) {
  const [entries, setEntries] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [allTags, setAllTags] = useState([]);
  const [activeFilterIds, setActiveFilterIds] = useState(new Set());
  const [modalMode, setModalMode] = useState(null); // null | 'new' | entry object being edited
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    return api
      .get(`/api/entries?date=${date}`)
      .then((rows) => {
        setEntries(rows);
        setLoaded(true);
      })
      .catch((err) => setError(err.message));
  }, [date]);

  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    setEntries([]);
    setError('');
    api
      .get(`/api/entries?date=${date}`)
      .then((rows) => {
        if (cancelled) return;
        setEntries(rows);
        setLoaded(true);
      })
      .catch((err) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [date]);

  useEffect(() => {
    api.get('/api/tags').then(setAllTags);
  }, []);

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
      await load();
      if (onChanged) onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (entry) => {
    if (!confirm('Delete this entry? This cannot be undone.')) return;
    await api.del(`/api/entries/${entry.id}`);
    await load();
    if (onChanged) onChanged();
  };

  const { y, m, d } = parseDateStr(date);
  const niceDate = new Date(y, m - 1, d, 12).toLocaleDateString(undefined, {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  let emptyText = null;
  if (loaded && visibleEntries.length === 0) {
    if (entries.length === 0) emptyText = 'No entries for this day yet.';
    else if (activeFilterIds.size === 1) emptyText = 'No entries for that tag, on this day.';
    else emptyText = 'No entries for that tag combination, on this day.';
  }

  return (
    <div>
      <div className="day-header">
        <div>
          {backLink && <Link to={backLink.to} className="muted">&larr; {backLink.label}</Link>}
          <h2 style={{ margin: backLink ? '4px 0 0' : 0 }}>{niceDate}</h2>
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
        {emptyText && <p className="muted">{emptyText}</p>}
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
