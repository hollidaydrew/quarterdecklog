import { useEffect, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import EntryCard from '../components/EntryCard.jsx';
import { findEasterEgg } from '../lib/easterEggTags.js';

const LIMIT = 1000; // keep in step with the server's limit in routes/entries.js

// Special page for an easter egg tag (see lib/easterEggTags.js): every entry
// with the tag, newest to oldest, shown like the day view but without tinting.
export default function TagPage({ user }) {
  const { slug } = useParams();
  const egg = findEasterEgg(slug);
  const [entries, setEntries] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!egg) return undefined;
    let cancelled = false;
    setEntries(null);
    setError('');
    api
      .get(`/api/entries/by-tag?name=${encodeURIComponent(egg.tagName)}`)
      .then((rows) => !cancelled && setEntries(rows))
      .catch((err) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [egg]);

  if (!egg) return <Navigate to="/" replace />;

  return (
    <div>
      <div className="day-header">
        <div>
          <Link to="/" className="muted">&larr; Back to your log</Link>
          <h2 style={{ margin: '4px 0 0' }}>{egg.title}</h2>
        </div>
      </div>
      <p className="muted" style={{ margin: '0 0 12px' }}>Newest first.</p>
      {error && <p className="error-text">{error}</p>}
      {entries && entries.length === 0 && <p className="muted">No entries have this tag yet.</p>}
      {entries && entries.length >= LIMIT && <p className="muted">Showing the newest {LIMIT.toLocaleString()}.</p>}
      <div className="entry-list">
        {entries && entries.map((entry) => <EntryCard key={entry.id} entry={entry} plain canEdit={false} />)}
      </div>
    </div>
  );
}
