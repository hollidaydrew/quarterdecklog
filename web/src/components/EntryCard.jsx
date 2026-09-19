import TagChip from './TagChip.jsx';

function formatTime(isoOrSqlTimestamp) {
  // SQLite datetime('now') yields 'YYYY-MM-DD HH:MM:SS' in UTC; normalize to ISO for Date parsing.
  const iso = isoOrSqlTimestamp.includes('T') ? isoOrSqlTimestamp : isoOrSqlTimestamp.replace(' ', 'T') + 'Z';
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

// EASTER EGG (deliberately left out of the User Guide and release notes):
// an entry that uses a tag named "Incident" (any capitalisation) gets a light
// orange card via the .entry-incident class in index.css, so it stands out
// from the other entries on the day.
const isIncident = (entry) => entry.tags.some((t) => t.name.trim().toLowerCase() === 'incident');

export default function EntryCard({ entry, canEdit, onEdit, onDelete }) {
  return (
    <div className={`card entry-card${isIncident(entry) ? ' entry-incident' : ''}`}>
      <div className="entry-meta">
        <span>
          <strong>{entry.author_name}</strong>
          {entry.author_deleted ? <span className="muted"> (deleted user)</span> : null}
          {' · '}{formatTime(entry.created_at)}
        </span>
        {canEdit && (
          <span>
            <button className="secondary" onClick={onEdit} style={{ padding: '4px 10px', marginRight: 6 }}>Edit</button>
            <button className="danger" onClick={onDelete} style={{ padding: '4px 10px' }}>Delete</button>
          </span>
        )}
      </div>
      <div className="entry-body trix-content" dangerouslySetInnerHTML={{ __html: entry.body }} />
      {entry.tags.length > 0 && (
        <div className="entry-tags">
          {entry.tags.map((tag) => (
            <TagChip key={tag.id} tag={tag} />
          ))}
        </div>
      )}
    </div>
  );
}
