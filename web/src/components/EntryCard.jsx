import TagChip from './TagChip.jsx';

function formatTime(isoOrSqlTimestamp) {
  // SQLite datetime('now') yields 'YYYY-MM-DD HH:MM:SS' in UTC; normalize to ISO for Date parsing.
  const iso = isoOrSqlTimestamp.includes('T') ? isoOrSqlTimestamp : isoOrSqlTimestamp.replace(' ', 'T') + 'Z';
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export default function EntryCard({ entry, canEdit, onEdit, onDelete }) {
  return (
    <div className="card entry-card">
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
      <div className="entry-body" dangerouslySetInnerHTML={{ __html: entry.body }} />
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
