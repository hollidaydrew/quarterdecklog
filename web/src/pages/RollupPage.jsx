import { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import DateRangePicker from '../components/DateRangePicker.jsx';
import EntryCard from '../components/EntryCard.jsx';
import QuickRanges from '../components/QuickRanges.jsx';
import ViewToggle from '../components/ViewToggle.jsx';
import { downloadRollupCsv } from '../lib/rollupCsv.js';
import { PRINT_LIMIT, printRollup } from '../lib/rollupPrint.js';
import { formatUs, weekdayName, todayStr } from '../lib/dates.js';

// Every entry in a date range, newest day first, ready to print to PDF (the
// browser's print dialog) or export to CSV. The screen shows one page at a
// time; Print and Export CSV cover the whole range. Print builds a plain page
// in a hidden frame (see lib/rollupPrint.js) and stops at PRINT_LIMIT entries. Read only: edit
// entries from the List or Calendar.
const PAGE_SIZES = [10, 20, 50, 100, 250, 500, 1000, 5000];
const DEFAULT_PAGE_SIZE = 20;

export default function RollupPage() {
  const today = todayStr();
  const [range, setRange] = useState(null); // null = start of this year through today
  const from = range ? range.from : `${today.slice(0, 4)}-01-01`;
  const to = range ? range.to : today;
  const [data, setData] = useState(null); // { entries, truncated }
  const [error, setError] = useState('');
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [page, setPage] = useState(1);

  useEffect(() => setPage(1), [from, to, pageSize]);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError('');
    api
      .get(`/api/entries/rollup?from=${from}&to=${to}`)
      .then((d) => !cancelled && setData(d))
      .catch((e) => !cancelled && setError(e.message || 'Could not load entries.'));
    return () => {
      cancelled = true;
    };
  }, [from, to]);

  const count = data ? data.entries.length : 0;
  const pages = Math.max(1, Math.ceil(count / pageSize));
  const current = Math.min(page, pages);
  const shown = useMemo(() => {
    if (!data) return [];
    return data.entries.slice((current - 1) * pageSize, current * pageSize);
  }, [data, current, pageSize]);

  // Group the (already sorted) shown entries by day.
  const days = [];
  for (const entry of shown) {
    const last = days[days.length - 1];
    if (last && last.date === entry.entry_date) last.entries.push(entry);
    else days.push({ date: entry.entry_date, entries: [entry] });
  }
  const ready = !!data;
  const first = (current - 1) * pageSize + 1;
  const lastShown = Math.min(count, current * pageSize);

  const pager = (
    <div className="rollup-pager no-print">
      <label>
        Per page
        <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}>
          {PAGE_SIZES.map((n) => <option key={n} value={n}>{n === 5000 ? '5,000 (max)' : n}</option>)}
        </select>
      </label>
      <span className="muted">{first}-{lastShown} of {count}</span>
      <button type="button" className="secondary" disabled={current <= 1} onClick={() => setPage(current - 1)}>Previous</button>
      <span className="muted">Page {current} of {pages}</span>
      <button type="button" className="secondary" disabled={current >= pages} onClick={() => setPage(current + 1)}>Next</button>
    </div>
  );

  return (
    <div className="rollup-page">
      <div className="page-toolbar no-print">
        <ViewToggle current="rollup" />
      </div>
      <div className="rollup-controls no-print">
        <div className="rollup-range">
          <DateRangePicker value={range} defaultLabel={`All dates in ${today.slice(0, 4)}`} onChange={setRange} />
          <QuickRanges value={range} onChange={setRange} />
        </div>
        <div className="rollup-actions">
          <button type="button" className="secondary" disabled={!count || count > PRINT_LIMIT} onClick={() => printRollup(data.entries, from, to)}>Print / PDF</button>
          <button type="button" className="secondary" disabled={!count} onClick={() => downloadRollupCsv(data.entries, from, to)}>Export CSV</button>
        </div>
      </div>

      <h1 className="rollup-title">Rollup: {formatUs(from)} to {formatUs(to)}</h1>
      {error && <p className="error-text" role="alert">{error}</p>}
      {!ready && !error && <p className="muted">Loading…</p>}
      {ready && count === 0 && <p className="muted">No entries in this range.</p>}
      {ready && count > 0 && (
        <p className="muted rollup-count">
          {count} {count === 1 ? 'entry' : 'entries'} on {days.length} {days.length === 1 ? 'day' : 'days'}
          {data.truncated ? '. Showing the newest ones only; pick a shorter range to see the rest.' : ''}
        </p>
      )}
      {ready && count > PRINT_LIMIT && (
        <p className="muted no-print">Print / PDF handles up to {PRINT_LIMIT.toLocaleString()} entries. Pick a shorter range to print, or use Export CSV for all {count.toLocaleString()}.</p>
      )}
      {ready && count > 0 && pager}
      {days.map((day) => (
        <section key={day.date} className="rollup-day">
          <h2>{formatUs(day.date)} {weekdayName(day.date)}</h2>
          {day.entries.map((entry) => (
            <EntryCard key={entry.id} entry={entry} canEdit={false} />
          ))}
        </section>
      ))}
      {ready && count > 0 && pager}
    </div>
  );
}
