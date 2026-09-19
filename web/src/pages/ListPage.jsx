import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import DayEntries from '../components/DayEntries.jsx';
import DateRangePicker from '../components/DateRangePicker.jsx';
import ViewToggle from '../components/ViewToggle.jsx';
import { addDays, daysBetween, formatListLabel, isDateStr, todayStr } from '../lib/dates.js';

const ROW_H = 40;
const OVERSCAN = 8;

// Left: every date from today back to the start of the year (or the range you
// pick), newest first. Dates with entries are bold with a count; empty dates
// are grayed. Right: the selected date's entries. The list is windowed (only
// the rows on screen are rendered), so a range of many years stays instant.
export default function ListPage({ user, onViewUsed }) {
  const { date: routeDate } = useParams();
  const navigate = useNavigate();

  const today = todayStr();
  const yearStart = `${today.slice(0, 4)}-01-01`;
  const [range, setRange] = useState(null); // null = start of this year through today
  const from = range ? range.from : yearStart;
  const to = range ? range.to : today;
  const total = daysBetween(from, to) + 1;

  const [counts, setCounts] = useState({});
  const selected = isDateStr(routeDate) ? routeDate : to;

  useEffect(() => {
    if (user.preferred_view !== 'list') onViewUsed('list');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadCounts = useCallback(() => {
    return api.get(`/api/entries/range?from=${from}&to=${to}`).then(setCounts);
  }, [from, to]);

  useEffect(() => {
    let cancelled = false;
    api
      .get(`/api/entries/range?from=${from}&to=${to}`)
      .then((c) => !cancelled && setCounts(c))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [from, to]);

  const select = useCallback(
    (d) => navigate(`/list/${d}`, { replace: true }),
    [navigate]
  );

  const changeRange = (next) => {
    setRange(next);
    // Jump to the newest date in the new range.
    select(next ? next.to : today);
  };

  // --- windowed list ---
  const scrollRef = useRef(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewH, setViewH] = useState(600);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return undefined;
    setViewH(el.clientHeight || 600);
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(() => setViewH(el.clientHeight || 600));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Keep the selected row on screen (keyboard moves, dropdown changes).
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const idx = daysBetween(selected, to);
    if (idx < 0 || idx >= total) return;
    const top = idx * ROW_H;
    if (top < el.scrollTop) el.scrollTop = top;
    else if (top + ROW_H > el.scrollTop + el.clientHeight) el.scrollTop = top + ROW_H - el.clientHeight;
  }, [selected, to, total]);

  // A new range starts at the top.
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [from, to]);

  const first = Math.max(0, Math.floor(scrollTop / ROW_H) - OVERSCAN);
  const last = Math.min(total - 1, Math.ceil((scrollTop + viewH) / ROW_H) + OVERSCAN);
  const rows = [];
  for (let i = first; i <= last; i++) {
    const d = addDays(to, -i);
    const count = counts[d] || 0;
    rows.push(
      <div
        key={d}
        id={`row-${d}`}
        role="option"
        aria-selected={d === selected}
        className={`list-row-date${count > 0 ? ' has-entries' : ' is-empty'}${d === selected ? ' is-selected' : ''}`}
        style={{ top: i * ROW_H, height: ROW_H }}
        onClick={() => select(d)}
      >
        {formatListLabel(d, count)}
      </div>
    );
  }

  const onKeyDown = (e) => {
    const idx = daysBetween(selected, to);
    let nextIdx = null;
    if (e.key === 'ArrowDown') nextIdx = Math.min(total - 1, (idx < 0 ? -1 : idx) + 1);
    else if (e.key === 'ArrowUp') nextIdx = Math.max(0, (idx < 0 ? 1 : idx) - 1);
    else if (e.key === 'Home') nextIdx = 0;
    else if (e.key === 'End') nextIdx = total - 1;
    if (nextIdx === null) return;
    e.preventDefault();
    select(addDays(to, -nextIdx));
  };

  // Phone-sized screens hide the list and use this dropdown instead.
  const options = [];
  for (let i = 0; i < total; i++) {
    const d = addDays(to, -i);
    options.push(<option key={d} value={d}>{formatListLabel(d, counts[d] || 0)}</option>);
  }

  return (
    <div className="list-page">
      <div className="page-toolbar">
        <ViewToggle current="list" />
      </div>
      <div className="list-layout">
        <section className="list-pane card" aria-label="Dates">
          <div className="list-pane-head">
            <DateRangePicker value={range} defaultLabel={`All dates in ${today.slice(0, 4)}`} onChange={changeRange} />
          </div>
          <div
            ref={scrollRef}
            className="list-scroll"
            role="listbox"
            tabIndex={0}
            aria-label="Dates"
            aria-activedescendant={`row-${selected}`}
            onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
            onKeyDown={onKeyDown}
          >
            <div className="list-canvas" style={{ height: total * ROW_H }}>{rows}</div>
          </div>
        </section>

        <section className="detail-pane">
          <div className="mobile-date-select">
            <label htmlFor="mobile-date">Date</label>
            <select id="mobile-date" value={selected} onChange={(e) => select(e.target.value)}>
              {options}
            </select>
          </div>
          <DayEntries date={selected} user={user} onChanged={loadCounts} />
        </section>
      </div>
    </div>
  );
}
