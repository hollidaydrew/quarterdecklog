import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import DateRangePicker from '../components/DateRangePicker.jsx';
import QuickRanges from '../components/QuickRanges.jsx';
import ViewToggle from '../components/ViewToggle.jsx';
import ResultsList from '../components/ResultsList.jsx';
import { FilterPair, FilterPanel, FilterRow, PersonSelect, TagPicker } from '../components/ResultsFilters.jsx';
import { downloadEntriesCsv } from '../lib/rollupCsv.js';
import { PRINT_LIMIT, printEntries } from '../lib/rollupPrint.js';
import { isDateStr, formatUs } from '../lib/dates.js';

// Search the whole log. Everything that defines a search (the words, dates,
// tags, user and sort) lives in the web address, so Back, refresh and a copied
// link all return to the same results. A search runs when the person presses
// Enter or clicks Search; changing a filter afterwards runs the same words again.
// The results layout, Print and Export are shared with Rollup.

const ID_LIST = /^\d{1,9}(,\d{1,9})*$/;
const INDEXING_POLL_MS = 3000;

// A short, safe piece of the words for a file name.
const slug = (text) => text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 30) || 'search';

export default function SearchPage() {
  const [params, setParams] = useSearchParams();
  const q = (params.get('q') || '').trim();
  const rawFrom = params.get('from');
  const rawTo = params.get('to');
  const from = isDateStr(rawFrom) ? rawFrom : null;
  const to = isDateStr(rawTo) ? rawTo : null;
  const range = from && to && from <= to ? { from, to } : null;
  const tagParam = params.get('tags') || '';
  const tagIds = ID_LIST.test(tagParam) ? tagParam.split(',').map(Number) : [];
  const tagKey = tagIds.join(',');
  const authorParam = params.get('author') || '';
  const authorId = /^\d{1,9}$/.test(authorParam) ? authorParam : '';
  const sort = params.get('sort') === 'oldest' ? 'oldest' : 'newest';

  const [draft, setDraft] = useState(q);
  const [allTags, setAllTags] = useState([]);
  const [authors, setAuthors] = useState([]);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    api.get('/api/tags').then(setAllTags).catch(() => {});
    api.get('/api/entries/authors').then(setAuthors).catch(() => {});
    if (inputRef.current && !q) inputRef.current.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The box follows the address (Back, a copied link).
  useEffect(() => setDraft(q), [q]);

  // Change the address. Search itself adds a history entry; filter changes
  // replace it, so Back goes to the previous search, not through every click.
  const update = useCallback(
    (changes, { push = false } = {}) => {
      const next = new URLSearchParams(params);
      for (const [key, value] of Object.entries(changes)) {
        if (value === null || value === undefined || value === '' || (Array.isArray(value) && value.length === 0)) next.delete(key);
        else next.set(key, Array.isArray(value) ? value.join(',') : value);
      }
      setParams(next, { replace: !push });
    },
    [params, setParams]
  );

  const submit = (e) => {
    e.preventDefault();
    update({ q: draft.trim() }, { push: true });
  };

  // Run the search whenever the address says what to look for.
  const queryString = useMemo(() => {
    const p = new URLSearchParams({ q });
    if (range) {
      p.set('from', range.from);
      p.set('to', range.to);
    }
    if (tagKey) p.set('tag_ids', tagKey);
    if (authorId) p.set('author_id', authorId);
    if (sort === 'oldest') p.set('sort', 'oldest');
    return p.toString();
  }, [q, range ? range.from : '', range ? range.to : '', tagKey, authorId, sort]);

  const [reload, setReload] = useState(0);
  useEffect(() => {
    if (q.length === 0) {
      setData(null);
      setError('');
      return undefined;
    }
    if (q.length < 2) {
      setData(null);
      setError('Type at least 2 characters.');
      return undefined;
    }
    let cancelled = false;
    let timer = null;
    setBusy(true);
    setError('');
    api
      .get(`/api/entries/search?${queryString}`)
      .then((d) => {
        if (cancelled) return;
        setData(d);
        // While the server is still indexing an upgraded log, check again soon.
        if (d.indexing) timer = setTimeout(() => setReload((n) => n + 1), INDEXING_POLL_MS);
      })
      .catch((err) => {
        if (cancelled) return;
        setData(null);
        setError(err.message || 'Search failed. Try again.');
      })
      .finally(() => !cancelled && setBusy(false));
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [queryString, q, reload]);

  const toggleTag = (id) => update({ tags: tagIds.includes(id) ? tagIds.filter((t) => t !== id) : [...tagIds, id] });
  const clearFilters = () => update({ from: null, to: null, tags: null, author: null, sort: null });
  const activeCount = (range ? 1 : 0) + (tagIds.length ? 1 : 0) + (authorId ? 1 : 0);

  const datesText = range ? `${formatUs(range.from)} to ${formatUs(range.to)}` : '';
  const tagsText = tagIds.length ? `Tag: ${allTags.filter((t) => tagIds.includes(t.id)).map((t) => t.name).join(', ')}` : '';
  const personText = authorId ? `User: ${(authors.find((a) => String(a.id) === authorId) || {}).name || ''}` : '';
  const filterText = [datesText, tagsText, personText].filter(Boolean).join(' / ');

  const entries = data ? data.entries : [];
  const count = entries.length;
  const printTitle = `Search: “${q}”`;
  const fileName = `quarterdecklog-search-${slug(q)}-${range ? `${range.from}-to-${range.to}` : 'all-dates'}${tagIds.length || authorId ? '-filtered' : ''}.csv`;

  const actions = (
    <>
      <button type="button" className="secondary" disabled={!count || count > PRINT_LIMIT} onClick={() => printEntries(entries, printTitle, filterText)} title="Print, or save as a PDF from the print window">Print</button>
      <button type="button" className="secondary" disabled={!count} onClick={() => downloadEntriesCsv(entries, fileName)} title="Download as a spreadsheet (CSV)">Export</button>
    </>
  );
  const notice = (
    <>
      {data && data.indexing && (
        <p className="muted results-note" role="status">
          Search is still getting ready after an update ({data.indexing.done.toLocaleString('en-US')} of {data.indexing.total.toLocaleString('en-US')} entries). Results may be missing some entries for a moment.
        </p>
      )}
      {count > PRINT_LIMIT && (
        <p className="muted results-note no-print">
          Print handles up to {PRINT_LIMIT.toLocaleString('en-US')} entries. Narrow the search to print, or use Export for all {count.toLocaleString('en-US')}.
        </p>
      )}
    </>
  );

  return (
    <div className="results-page search-page">
      <div className="page-toolbar no-print">
        <ViewToggle current="search" />
      </div>

      <form className="search-bar no-print" role="search" onSubmit={submit}>
        <div className="search-field">
          <svg className="search-icon" width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <circle cx="8.5" cy="8.5" r="5.5" />
            <path d="M12.8 12.8L17 17" />
          </svg>
          <input
            ref={inputRef}
            type="search"
            value={draft}
            maxLength={100}
            placeholder="Search every entry and tag"
            aria-label="Search entries"
            aria-describedby="search-hint"
            autoComplete="off"
            onChange={(e) => setDraft(e.target.value)}
          />
        </div>
        <button type="submit" disabled={busy}>{busy ? 'Searching…' : 'Search'}</button>
      </form>
      <p id="search-hint" className="search-hint no-print">
        Every word must match, from the start of a word. Use <code>"quotes"</code> for an exact phrase and <code>-word</code> to leave one out.
      </p>

      <div className="no-print">
        <FilterPanel activeCount={activeCount} onClear={clearFilters}>
          <FilterRow label="Dates">
            <div className="filter-dates">
              <DateRangePicker value={range} defaultLabel="All dates" onChange={(r) => update({ from: r ? r.from : null, to: r ? r.to : null })} />
              <QuickRanges value={range} onChange={(r) => update({ from: r ? r.from : null, to: r ? r.to : null })} />
            </div>
          </FilterRow>
          <FilterRow label="Tags">
            <TagPicker tags={allTags} selected={tagIds} onToggle={toggleTag} />
          </FilterRow>
          <FilterPair>
            {authors.length > 1 && (
              <FilterRow label="User">
                <PersonSelect authors={authors} value={authorId} onChange={(v) => update({ author: v })} />
              </FilterRow>
            )}
            <FilterRow label="Sort">
              <select value={sort} onChange={(e) => update({ sort: e.target.value === 'oldest' ? 'oldest' : null })} aria-label="Sort order">
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
              </select>
            </FilterRow>
          </FilterPair>
        </FilterPanel>
      </div>

      {error && <p className="error-text" role="alert">{error}</p>}
      {q.length === 0 && !error && (
        <p className="muted search-start">
          Type words from an entry or a tag and press Enter. Narrow the results with the filters above, then print them or export them to a spreadsheet.
        </p>
      )}
      {data && q.length >= 2 && (
        <ResultsList
          title={`“${q}”`}
          summary={filterText}
          actions={actions}
          notice={notice}
          entries={entries}
          truncated={data.truncated}
          highlight={data.terms}
          resetKey={queryString}
          emptyText="Nothing matches. Try fewer words, check the spelling, or clear the filters."
        />
      )}
    </div>
  );
}
