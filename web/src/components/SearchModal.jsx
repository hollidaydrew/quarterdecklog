import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Modal from './Modal.jsx';
import TagChip from './TagChip.jsx';
import { api } from '../api.js';
import { formatDateTimeShort, formatUs } from '../lib/dates.js';

// Searches every entry's text and tags. Picking a result opens that day.
export default function SearchModal({ onClose }) {
  const navigate = useNavigate();
  const inputRef = useRef(null);
  const [query, setQuery] = useState('');
  const [found, setFound] = useState(null); // { total, results } for the last search
  const [searched, setSearched] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (inputRef.current) inputRef.current.focus();
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    const q = query.trim();
    if (q.length < 2) {
      setError('Type at least 2 characters.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      setFound(await api.get(`/api/entries/search?q=${encodeURIComponent(q)}`));
      setSearched(q);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const open = (date) => {
    onClose();
    navigate(`/list/${date}`);
  };

  return (
    <Modal onClose={onClose} wide closeOnEscape label="Search entries">
      <div className="release-head">
        <h3 style={{ margin: 0 }}>Search entries</h3>
        <button type="button" className="secondary" onClick={onClose}>Close</button>
      </div>
      <form className="search-form" onSubmit={submit}>
        <input
          ref={inputRef}
          type="search"
          value={query}
          maxLength={100}
          placeholder="Words in an entry or a tag"
          aria-label="Search entries"
          onChange={(e) => setQuery(e.target.value)}
        />
        <button type="submit" disabled={busy}>{busy ? 'Searching…' : 'Search'}</button>
      </form>
      {error && <p className="error-text">{error}</p>}
      {found && found.total === 0 && <p className="muted">No entries match &ldquo;{searched}&rdquo;.</p>}
      {found && found.total > 0 && (
        <>
          <p className="muted" style={{ margin: '4px 0 8px' }}>
            {found.total > found.results.length
              ? `Showing the newest ${found.results.length} of ${found.total} matches. Add more words to narrow it down.`
              : `${found.total} ${found.total === 1 ? 'match' : 'matches'}, newest first.`}
          </p>
          <ul className="search-results">
            {found.results.map((r) => (
              <li key={r.id}>
                <button type="button" className="search-result" onClick={() => open(r.entry_date)}>
                  <span className="search-result-head">
                    <strong>{formatUs(r.entry_date)}</strong>
                    <span className="muted">
                      {r.author_name}{r.author_deleted ? ' (deleted user)' : ''} · {formatDateTimeShort(r.created_at)}
                    </span>
                  </span>
                  <span className="search-snippet">{r.snippet}</span>
                  {r.tags.length > 0 && (
                    <span className="entry-tags">
                      {r.tags.map((tag) => <TagChip key={tag.id} tag={tag} />)}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </Modal>
  );
}
