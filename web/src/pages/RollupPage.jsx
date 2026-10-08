import { useEffect, useState } from 'react';
import { api } from '../api.js';
import DateRangePicker from '../components/DateRangePicker.jsx';
import QuickRanges from '../components/QuickRanges.jsx';
import ViewToggle from '../components/ViewToggle.jsx';
import ResultsList from '../components/ResultsList.jsx';
import { FilterPanel, FilterRow, PersonSelect, TagPicker } from '../components/ResultsFilters.jsx';
import { downloadRollupCsv } from '../lib/rollupCsv.js';
import { PRINT_LIMIT, printRollup } from '../lib/rollupPrint.js';
import { formatUs, todayStr } from '../lib/dates.js';

// Every entry in a date range, newest day first, ready to print to PDF (the
// browser's print dialog) or export to CSV. The screen shows one page at a
// time; Print and Export cover the whole range and the filters in use.
// Print builds a plain page in a hidden frame (see lib/rollupPrint.js) and
// stops at PRINT_LIMIT entries. Read only: edit entries from the List or
// Calendar. The filters and the results layout are shared with Search.
export default function RollupPage() {
  const today = todayStr();
  const [range, setRange] = useState(null); // null = start of this year through today
  const from = range ? range.from : `${today.slice(0, 4)}-01-01`;
  const to = range ? range.to : today;
  const [data, setData] = useState(null); // { entries, truncated }
  const [error, setError] = useState('');
  const [allTags, setAllTags] = useState([]);
  const [authors, setAuthors] = useState([]);
  const [tagIds, setTagIds] = useState([]); // an entry with ANY of these stays, like the day view
  const [authorId, setAuthorId] = useState('');

  useEffect(() => {
    api.get('/api/tags').then(setAllTags).catch(() => {});
    api.get('/api/entries/authors').then(setAuthors).catch(() => {});
  }, []);

  const tagKey = tagIds.join(',');
  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError('');
    api
      .get(`/api/entries/rollup?from=${from}&to=${to}${tagKey ? `&tag_ids=${tagKey}` : ''}${authorId !== '' ? `&author_id=${authorId}` : ''}`)
      .then((d) => !cancelled && setData(d))
      .catch((e) => !cancelled && setError(e.message || 'Could not load entries.'));
    return () => {
      cancelled = true;
    };
  }, [from, to, tagKey, authorId]);

  const toggleTag = (id) => setTagIds((ids) => (ids.includes(id) ? ids.filter((t) => t !== id) : [...ids, id]));
  const clearFilters = () => {
    setRange(null);
    setTagIds([]);
    setAuthorId('');
  };

  const tagsText = tagIds.length ? `Tag: ${allTags.filter((t) => tagIds.includes(t.id)).map((t) => t.name).join(', ')}` : '';
  const personText = authorId !== '' ? `User: ${(authors.find((a) => String(a.id) === authorId) || {}).name || ''}` : '';
  const filterText = [tagsText, personText].filter(Boolean).join(' / ');
  const filtered = filterText !== '';
  const activeCount = (range ? 1 : 0) + (tagIds.length ? 1 : 0) + (authorId !== '' ? 1 : 0);

  const entries = data ? data.entries : [];
  const count = entries.length;

  const actions = (
    <>
      <button type="button" className="secondary" disabled={!count || count > PRINT_LIMIT} onClick={() => printRollup(entries, from, to, filterText)} title="Print, or save as a PDF from the print window">Print</button>
      <button type="button" className="secondary" disabled={!count} onClick={() => downloadRollupCsv(entries, from, to, filtered)} title="Download as a spreadsheet (CSV)">Export</button>
    </>
  );
  const notice = count > PRINT_LIMIT ? (
    <p className="muted results-note no-print">
      Print handles up to {PRINT_LIMIT.toLocaleString('en-US')} entries. Pick a shorter range to print, or use Export for all {count.toLocaleString('en-US')}.
    </p>
  ) : null;

  return (
    <div className="results-page rollup-page">
      <div className="page-toolbar no-print">
        <ViewToggle current="rollup" />
      </div>

      <div className="no-print">
        <FilterPanel activeCount={activeCount} onClear={clearFilters}>
          <FilterRow label="Dates">
            <div className="filter-dates">
              <DateRangePicker value={range} defaultLabel={`All dates in ${today.slice(0, 4)}`} onChange={setRange} />
              <QuickRanges value={range} onChange={setRange} />
            </div>
          </FilterRow>
          <FilterRow label="Tags">
            <TagPicker tags={allTags} selected={tagIds} onToggle={toggleTag} />
          </FilterRow>
          {authors.length > 1 && (
            <FilterRow label="User">
              <PersonSelect authors={authors} value={authorId} onChange={setAuthorId} />
            </FilterRow>
          )}
        </FilterPanel>
      </div>

      {error && <p className="error-text" role="alert">{error}</p>}
      {!data && !error && <p className="muted">Loading…</p>}
      {data && (
        <ResultsList
          title={`${formatUs(from)} to ${formatUs(to)}`}
          summary={filterText}
          actions={actions}
          notice={notice}
          entries={entries}
          truncated={data.truncated}
          resetKey={`${from}|${to}|${tagKey}|${authorId}`}
          emptyText={filtered ? 'No entries match these filters in this range.' : 'No entries in this range.'}
        />
      )}
    </div>
  );
}
