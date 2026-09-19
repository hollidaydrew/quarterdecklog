import TagChip from './TagChip.jsx';
import { formatDateTimeShort } from '../lib/dates.js';
import { entryTintClass } from '../lib/easterEggTags.js';

// Easter egg tags (see lib/easterEggTags.js, deliberately left out of the User
// Guide and release notes) can tint a card in the day view, such as the light
// orange "Incident" card. `plain` turns the tint off, as the special tag pages do.
export default function EntryCard({ entry, canEdit, onEdit, onDelete, plain = false }) {
  const tint = plain ? '' : entryTintClass(entry);
  return (
    <div className={`card entry-card${tint ? ` ${tint}` : ''}`}>
      <div className="entry-meta">
        <span>
          <strong>{entry.author_name}</strong>
          {entry.author_deleted ? <span className="muted"> (deleted user)</span> : null}
          {' · '}{formatDateTimeShort(entry.created_at)}
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
