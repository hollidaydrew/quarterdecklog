import { useEffect, useMemo, useRef, useState } from 'react';
import { toDateStr, parseDateStr, todayStr, formatUs, weekdayName } from '../lib/dates.js';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DOW = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MIN_YEAR = 1970;

function shiftMonth(year, month, delta) {
  const idx = year * 12 + (month - 1) + delta;
  return { year: Math.floor(idx / 12), month: (idx % 12) + 1 };
}

function MonthGrid({ year, month, today, lo, hi, onPick, onHover, className = '' }) {
  const lead = new Date(year, month - 1, 1).getDay();
  const days = new Date(year, month, 0).getDate();
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let d = 1; d <= days; d++) cells.push(toDateStr(year, month, d));

  return (
    <div className={`dp-month ${className}`.trim()}>
      <div className="dp-month-name">{MONTHS[month - 1]} {year}</div>
      <div className="dp-grid" onMouseLeave={() => onHover(null)}>
        {DOW.map((w) => <div key={w} className="dp-dow">{w}</div>)}
        {cells.map((d, i) => {
          if (!d) return <div key={`b${i}`} />;
          const isLo = d === lo;
          const isHi = d === hi;
          const inBand = lo && hi && d > lo && d < hi;
          const cls = [
            'dp-day',
            d === today ? 'is-today' : '',
            isLo || isHi ? 'is-edge' : '',
            inBand ? 'in-band' : '',
            isLo && hi && hi !== lo ? 'band-start' : '',
            isHi && lo && hi !== lo ? 'band-end' : '',
          ].filter(Boolean).join(' ');
          return (
            <button
              key={d}
              type="button"
              className={cls}
              aria-label={`${formatUs(d)} ${weekdayName(d)}`}
              aria-pressed={isLo || isHi}
              onClick={() => onPick(d)}
              onMouseEnter={() => onHover(d)}
              onFocus={() => onHover(d)}
            >
              {parseDateStr(d).d}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Airline-style date picker: one popover with two months side by side. In
// "Date range" mode the popover stays open between the first and second click;
// "Single day" applies on one click. Days between the start and the pointer are
// highlighted while you choose the end. value is { from, to } or null (no
// filter); onChange receives the same shape.
export default function DateRangePicker({ value, defaultLabel, onChange }) {
  const today = todayStr();
  const wrapRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState('range');
  const [draft, setDraft] = useState({ start: null, end: null });
  const [hover, setHover] = useState(null);
  const [view, setView] = useState(() => {
    const { y, m } = parseDateStr(today);
    return { year: y, month: m };
  });

  const openPicker = () => {
    const anchor = value ? value.from : today;
    const { y, m } = parseDateStr(anchor);
    setView({ year: y, month: m });
    setMode(value && value.from === value.to ? 'single' : 'range');
    setDraft(value ? { start: value.from, end: value.to } : { start: null, end: null });
    setHover(null);
    setOpen(true);
  };

  const close = () => setOpen(false);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const switchMode = (next) => {
    setMode(next);
    setDraft({ start: null, end: null });
    setHover(null);
  };

  const pick = (d) => {
    if (mode === 'single') {
      onChange({ from: d, to: d });
      close();
      return;
    }
    // Range mode: first click sets the start, second click sets the end.
    if (!draft.start || draft.end || d < draft.start) {
      setDraft({ start: d, end: null });
      return;
    }
    onChange({ from: draft.start, to: d });
    close();
  };

  // What to highlight: the chosen start, and either the chosen end or, while
  // choosing, the day under the pointer.
  let lo = null;
  let hi = null;
  if (mode === 'range' && draft.start) {
    lo = draft.start;
    hi = draft.end || (hover && hover >= draft.start ? hover : draft.start);
  } else if (mode === 'single' && value && value.from === value.to) {
    lo = value.from;
    hi = value.from;
  }

  const next = shiftMonth(view.year, view.month, 1);
  const thisYear = parseDateStr(today).y;
  const years = useMemo(() => {
    const out = [];
    const max = Math.max(thisYear + 5, view.year);
    for (let y = Math.min(MIN_YEAR, view.year); y <= max; y++) out.push(y);
    return out;
  }, [thisYear, view.year]);

  let triggerText = defaultLabel;
  if (value) {
    triggerText = value.from === value.to ? formatUs(value.from) : `${formatUs(value.from)} to ${formatUs(value.to)}`;
  }

  return (
    <div className="dp" ref={wrapRef}>
      <div className="dp-trigger-row">
        <button
          type="button"
          className={`dp-trigger secondary${value ? ' is-filtered' : ''}`}
          onClick={() => (open ? close() : openPicker())}
          aria-haspopup="dialog"
          aria-expanded={open}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="3" width="12" height="11" rx="2" />
            <path d="M2 6.5h12M5.5 1.5v3M10.5 1.5v3" />
          </svg>
          <span className="dp-trigger-text">{triggerText}</span>
        </button>
        {value && (
          <button type="button" className="secondary dp-reset" onClick={() => onChange(null)} title="Show all dates this year">
            Reset
          </button>
        )}
      </div>

      {open && (
        <div className="dp-popover" role="dialog" aria-label="Choose dates">
          <div className="dp-modes" role="group" aria-label="Selection type">
            <button type="button" className={mode === 'single' ? 'active' : ''} onClick={() => switchMode('single')}>Single day</button>
            <button type="button" className={mode === 'range' ? 'active' : ''} onClick={() => switchMode('range')}>Date range</button>
          </div>

          {mode === 'range' && (
            <div className="dp-readout" aria-live="polite">
              <div className={!draft.start || draft.end ? 'is-next' : ''}>
                <span className="muted">Start</span>
                <strong>{draft.start ? formatUs(draft.start) : 'Choose a day'}</strong>
              </div>
              <div className={draft.start && !draft.end ? 'is-next' : ''}>
                <span className="muted">End</span>
                <strong>{draft.end ? formatUs(draft.end) : draft.start ? 'Choose a day' : '—'}</strong>
              </div>
            </div>
          )}

          <div className="dp-nav">
            <button type="button" className="secondary" aria-label="Previous month" onClick={() => setView((v) => shiftMonth(v.year, v.month, -1))}>&lsaquo;</button>
            <select aria-label="Month" value={view.month} onChange={(e) => setView((v) => ({ ...v, month: Number(e.target.value) }))}>
              {MONTHS.map((name, i) => <option key={name} value={i + 1}>{name}</option>)}
            </select>
            <select aria-label="Year" value={view.year} onChange={(e) => setView((v) => ({ ...v, year: Number(e.target.value) }))}>
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
            <button type="button" className="secondary" aria-label="Next month" onClick={() => setView((v) => shiftMonth(v.year, v.month, 1))}>&rsaquo;</button>
          </div>

          <div className="dp-months">
            <MonthGrid year={view.year} month={view.month} today={today} lo={lo} hi={hi} onPick={pick} onHover={setHover} />
            <MonthGrid year={next.year} month={next.month} today={today} lo={lo} hi={hi} onPick={pick} onHover={setHover} className="dp-second" />
          </div>
        </div>
      )}
    </div>
  );
}
