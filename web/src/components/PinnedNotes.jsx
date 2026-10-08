import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import TagChip from './TagChip.jsx';
import { formatUs } from '../lib/dates.js';
import { entryTintClass } from '../lib/easterEggTags.js';

const COLLAPSED = 2;

// The few entries the team has pinned as standing notes, shown above the day
// view, List and Calendar so they are always in sight. Anyone can unpin. The
// day view tells this to reload by firing a "qdl-pins-changed" event.
export default function PinnedNotes() {
  const [notes, setNotes] = useState([]);
  const [showAll, setShowAll] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api.get('/api/entries/pinned').then(setNotes).catch(() => {});
  }, []);

  useEffect(() => {
    load();
    window.addEventListener('qdl-pins-changed', load);
    return () => window.removeEventListener('qdl-pins-changed', load);
  }, [load]);

  const unpin = async (note) => {
    setError('');
    try {
      await api.put(`/api/entries/${note.id}/pin`, { pinned: false });
      window.dispatchEvent(new Event('qdl-pins-changed'));
    } catch (err) {
      setError(err.message);
    }
  };

  if (notes.length === 0) return null;
  const shown = showAll ? notes : notes.slice(0, COLLAPSED);

  return (
    <section className="pinned-notes" aria-label="Pinned notes">
      <div className="pinned-head">
        <span>Pinned</span>
        {notes.length > COLLAPSED && (
          <button type="button" className="secondary" style={{ padding: '2px 10px' }} onClick={() => setShowAll((v) => !v)}>
            {showAll ? 'Show fewer' : `Show all (${notes.length})`}
          </button>
        )}
      </div>
      {error && <p className="error-text">{error}</p>}
      {shown.map((note) => (
        // The same tint the entry has in the log (for example the light orange for an Incident).
        <div key={note.id} className={`card pinned-note${entryTintClass(note) ? ` ${entryTintClass(note)}` : ''}`}>
          <div className="pinned-note-meta">
            <span>
              <strong>{note.author_name}</strong> · for{' '}
              <Link to={`/list/${note.entry_date}`}>{formatUs(note.entry_date)}</Link>
              {note.pinned_by_name ? ` · pinned by ${note.pinned_by_name}` : ''}
            </span>
            <button type="button" className="card-icon is-on" onClick={() => unpin(note)} aria-label="Unpin entry" title="Unpin entry">
              <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" fill="currentColor" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="8" cy="5.5" r="3.5" /><path d="M8 9v6" /></svg>
            </button>
          </div>
          <div className="entry-body trix-content" dangerouslySetInnerHTML={{ __html: note.body }} />
          {note.tags.length > 0 && (
            <div className="entry-tags">
              {note.tags.map((tag) => <TagChip key={tag.id} tag={tag} />)}
            </div>
          )}
        </div>
      ))}
    </section>
  );
}
