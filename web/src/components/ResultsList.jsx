import { useEffect, useMemo, useState } from 'react';
import EntryCard from './EntryCard.jsx';
import { formatUs, weekdayName } from '../lib/dates.js';

export const PAGE_SIZES = [10, 20, 50, 100, 250, 500, 1000, 5000];
const DEFAULT_PAGE_SIZE = 20;

// One slim line. By default only the Per page choice shows (and only when there
// are more entries than the smallest page). Choose a number that splits the
// results into pages and the rest comes back: which entries are showing, and
// Previous / Next. The line repeats below the list when there is more than one
// page, without the Per page choice.
function Pager({ count, pageSize, onPageSize, page, pages, onPage, withSize = true }) {
  const first = (page - 1) * pageSize + 1;
  const last = Math.min(count, page * pageSize);
  return (
    <div className="pager no-print">
      {withSize && (
        <label>
          Per page
          <select value={pageSize} onChange={(e) => onPageSize(Number(e.target.value))}>
            {PAGE_SIZES.map((n) => <option key={n} value={n}>{n === 5000 ? '5,000 (max)' : n}</option>)}
          </select>
        </label>
      )}
      {pages > 1 && (
        <>
          <span className="pager-range">{first}-{last} of {count}</span>
          <button type="button" className="secondary" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</button>
          <span>Page {page} of {pages}</span>
          <button type="button" className="secondary" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next</button>
        </>
      )}
    </div>
  );
}

// The results half of Rollup and Search, laid out like a page from the log: a
// header with a double rule (what this is, the range or query, the counts, and
// the Print / CSV buttons that act on exactly these results), then the entries
// grouped by day, each day ruled off with its entry count.
//   title    the range or the words searched
//   summary  what the list is narrowed by (tags, user, dates), or ''
//   actions  the Print and Export buttons
//   notice   an extra line under the title (limits, indexing)
//   highlight search terms to mark in each entry
//   resetKey changes whenever the results change, to return to page 1
export default function ResultsList({ title, summary, actions, notice, entries, truncated, highlight, resetKey, emptyText }) {
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [resetKey, pageSize]);

  const count = entries.length;
  const pages = Math.max(1, Math.ceil(count / pageSize));
  const current = Math.min(page, pages);
  const shown = useMemo(() => entries.slice((current - 1) * pageSize, current * pageSize), [entries, current, pageSize]);

  // Entries per day across ALL results, so a day split over two pages still
  // shows its true count.
  const perDay = useMemo(() => {
    const m = new Map();
    for (const e of entries) m.set(e.entry_date, (m.get(e.entry_date) || 0) + 1);
    return m;
  }, [entries]);

  const days = [];
  for (const entry of shown) {
    const last = days[days.length - 1];
    if (last && last.date === entry.entry_date) last.entries.push(entry);
    else days.push({ date: entry.entry_date, entries: [entry] });
  }

  return (
    <div className="results">
      <header className="results-head">
        <div className="results-id">
          <h1 className="results-title">{title}</h1>
          {summary ? <p className="results-meta">{summary}</p> : null}
          {truncated && <p className="muted results-note">Showing the newest {count.toLocaleString('en-US')} only. Narrow the dates or add filters to see the rest.</p>}
          {notice}
        </div>
        <div className="results-actions no-print">{actions}</div>
      </header>

      {count === 0 && <p className="muted results-empty">{emptyText}</p>}
      {count > PAGE_SIZES[0] && (
        <Pager count={count} pageSize={pageSize} onPageSize={setPageSize} page={current} pages={pages} onPage={setPage} />
      )}

      {days.map((day) => (
        <section key={day.date} className="day-group">
          <h2 className="day-head">
            <span className="day-date">{formatUs(day.date)}</span>
            <span className="day-name">{weekdayName(day.date)}</span>
            <span className="day-rule" aria-hidden="true" />
            <span className="day-count">{perDay.get(day.date)} {perDay.get(day.date) === 1 ? 'entry' : 'entries'}</span>
          </h2>
          {day.entries.map((entry) => (
            <EntryCard key={entry.id} entry={entry} canEdit={false} highlight={highlight} />
          ))}
        </section>
      ))}

      {pages > 1 && (
        <Pager count={count} pageSize={pageSize} onPageSize={setPageSize} page={current} pages={pages} onPage={setPage} withSize={false} />
      )}
    </div>
  );
}
