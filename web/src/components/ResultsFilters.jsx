import { useState } from 'react';
import TagChip from './TagChip.jsx';

// The boxed "Filters" area shared by Rollup and Search, so the two pages look
// and behave the same. On a phone it folds away behind a button that says how
// many filters are on. activeCount is the number of filters currently applied;
// onClear shows a "Clear filters" button when there is something to clear.
export function FilterPanel({ activeCount = 0, onClear, children }) {
  const [open, setOpen] = useState(false);
  return (
    <section className={`filter-panel${open ? ' is-open' : ''}`} aria-labelledby="filter-panel-title">
      <div className="filter-head">
        <h2 id="filter-panel-title">Filters{activeCount > 0 ? <span className="filter-on"> · {activeCount} on</span> : null}</h2>
        <div className="filter-head-actions">
          {activeCount > 0 && onClear && (
            <button type="button" className="secondary filter-clear" onClick={onClear}>Clear filters</button>
          )}
          <button
            type="button"
            className="secondary filter-toggle"
            aria-expanded={open}
            aria-controls="filter-panel-body"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? 'Hide' : 'Show'}
          </button>
        </div>
      </div>
      <div id="filter-panel-body" className="filter-body">{children}</div>
    </section>
  );
}

// One labelled line inside the panel: DATES, TAGS, PERSON, SORT.
export function FilterRow({ label, children }) {
  const id = `filter-${label.toLowerCase()}`;
  return (
    <div className="filter-row">
      <div className="filter-label" id={id}>{label}</div>
      <div className="filter-field" role="group" aria-labelledby={id}>{children}</div>
    </div>
  );
}

// Two short fields (Person and Sort) side by side on a wide screen, stacked on a phone.
export function FilterPair({ children }) {
  return <div className="filter-pair">{children}</div>;
}

// Click tags to filter; an entry with ANY of the chosen tags stays.
export function TagPicker({ tags, selected, onToggle }) {
  if (tags.length === 0) return <span className="muted">No tags yet</span>;
  return tags.map((tag) => (
    <TagChip key={tag.id} tag={tag} outline active={selected.includes(tag.id)} onClick={() => onToggle(tag.id)} />
  ));
}

export function PersonSelect({ authors, value, onChange }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} aria-label="Person">
      <option value="">Everyone</option>
      {authors.map((a) => (
        <option key={a.id} value={a.id}>{a.name}{a.deleted ? ' (deleted user)' : ''}</option>
      ))}
    </select>
  );
}
