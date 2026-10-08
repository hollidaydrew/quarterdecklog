import { useMemo, useState } from 'react';
import TagChip from './TagChip.jsx';
import { formatDateTimeShort, isLateEntry } from '../lib/dates.js';
import { entryTintClass } from '../lib/easterEggTags.js';
import { copyText, entryToText } from '../lib/entryText.js';
import { highlightHtml } from '../lib/highlight.js';

// Easter egg tags (see lib/easterEggTags.js, deliberately left out of the User
// Guide and release notes) can tint a card in the day view, such as the light
// orange "Incident" card. `plain` turns the tint off, as the special tag pages do.
// onPin (optional) shows the pin icon; without it the card has no pin button.
// highlight (optional): the search terms to mark inside the entry text.
export default function EntryCard({ entry, canEdit, onEdit, onDelete, onPin, highlight, plain = false }) {
  const tint = plain ? '' : entryTintClass(entry);
  const [copy, setCopy] = useState('idle'); // 'idle' | 'ok' | 'fail'
  const pinned = !!entry.pinned_at;
  const late = isLateEntry(entry);
  const bodyHtml = useMemo(() => highlightHtml(entry.body, highlight), [entry.body, highlight]);

  const doCopy = async () => {
    setCopy((await copyText(entryToText(entry))) ? 'ok' : 'fail');
    setTimeout(() => setCopy('idle'), 2000);
  };

  return (
    <div className={`card entry-card${tint ? ` ${tint}` : ''}`}>
      <div className="entry-meta">
        <span>
          <strong>{entry.author_name}</strong>
          {entry.author_deleted ? <span className="muted"> (deleted user)</span> : null}
          {' · '}{formatDateTimeShort(entry.created_at)}
          {entry.edited_at ? ` · edited ${formatDateTimeShort(entry.edited_at)}` : ''}
          {late ? <span className="late-label">Late entry</span> : null}
        </span>
        <span className="entry-actions">
          <button
            type="button"
            className="card-icon"
            onClick={doCopy}
            aria-label="Copy entry as text"
            title={copy === 'ok' ? 'Copied' : copy === 'fail' ? 'Copy failed' : 'Copy entry as text'}
          >
            {copy === 'ok' ? (
              <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 8.5l3.2 3.2L13 4.8" /></svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="5.5" y="5.5" width="8" height="8" rx="1.5" /><path d="M10.5 5.5v-2a1.5 1.5 0 0 0-1.5-1.5H4A1.5 1.5 0 0 0 2.5 3.5V9A1.5 1.5 0 0 0 4 10.5h1.5" /></svg>
            )}
          </button>
          {onPin && (
            <button
              type="button"
              className={`card-icon${pinned ? ' is-on' : ''}`}
              onClick={() => onPin(entry, !pinned)}
              aria-label={pinned ? 'Unpin entry' : 'Pin entry'}
              aria-pressed={pinned}
              title={pinned ? 'Unpin entry' : 'Pin entry to the top of the log'}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" fill={pinned ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="8" cy="5.5" r="3.5" /><path d="M8 9v6" /></svg>
            </button>
          )}
          {canEdit && (
            <>
              <button className="secondary" onClick={onEdit} style={{ padding: '4px 10px', marginLeft: 6 }}>Edit</button>
              <button className="danger" onClick={onDelete} style={{ padding: '4px 10px', marginLeft: 6 }}>Delete</button>
            </>
          )}
        </span>
      </div>
      <div className="entry-body trix-content" dangerouslySetInnerHTML={{ __html: bodyHtml }} />
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
