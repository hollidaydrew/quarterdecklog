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
  const [allTags, setAllTags] = useState([]);
  const [authors, setAuthors] = useState([]);
  const [tagIds, setTagIds] = useState([]); // an entry with ANY of these stays
  const [authorId, setAuthorId] = useState('');
  const tagKey = tagIds.join(',');

  useEffect(() => {
    if (inputRef.current) inputRef.current.focus();
    api.get('/api/tags').then(setAllTags).catch(() => {});
    api.get('/api/entries/authors').then(setAuthors).catch(() => {});
  }, []);

  const runSearch = async (q) => {
    setBusy(true);
    setError('');
    try {
      const extra = `${tagKey ? `&tag_ids=${tagKey}` : ''}${authorId !== '' ? `&author_id=${authorId}` : ''}`;
      setFound(await api.get(`/api/entries/search?q=${encodeURIComponent(q)}${extra}`));
      setSearched(q);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const submit = (e) => {
    e.preventDefault();
    const q = query.trim();
    if (q.length < 2) {
      setError('Type at least 2 characters.');
      return;
    }
    runSearch(q);
  };

  // Changing a filter after a search runs the same words again.
  useEffect(() => {
    if (searched) runSearch(searched);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tagKey, authorId]);

  const toggleTag = (id) => setTagIds((ids) => (ids.includes(id) ? ids.filter((t) => t !== id) : [...ids, id]));
  const filtered = tagIds.length > 0 || authorId !== '';

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
      {(allTags.length > 0 || authors.length > 1) && (
        <div className="filter-bar">
          {allTags.map((tag) => (
            <TagChip key={tag.id} tag={tag} outline active={tagIds.includes(tag.id)} onClick={() => toggleTag(tag.id)} />
          ))}
          {authors.length > 1 && (
            <select value={authorId} onChange={(e) => setAuthorId(e.target.value)} aria-label="Person">
              <option value="">Everyone</option>
              {authors.map((a) => (
                <option key={a.id} value={a.id}>{a.name}{a.deleted ? ' (deleted user)' : ''}</option>
              ))}
            </select>
          )}
          {filtered && (
            <button type="button" className="secondary" style={{ padding: '4px 10px' }} onClick={() => { setTagIds([]); setAuthorId(''); }}>Clear filters</button>
          )}
        </div>
      )}
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
