import { parseDateStr, todayStr } from '../lib/dates.js';

const QUARTER_STARTS = [1, 4, 7, 10];
const pad = (n) => String(n).padStart(2, '0');

// The range for "Year" (q = 0) or a quarter (q = 1-4) of a year. A range that
// reaches past today stops at today, and one that starts after today is null.
export function quickRange(year, q, today = todayStr()) {
  const y = String(year).padStart(4, '0');
  const from = q === 0 ? `${y}-01-01` : `${y}-${pad(QUARTER_STARTS[q - 1])}-01`;
  if (from > today) return null;
  let to;
  if (q === 0) to = `${y}-12-31`;
  else {
    const endMonth = QUARTER_STARTS[q - 1] + 2;
    to = `${y}-${pad(endMonth)}-${pad(new Date(Date.UTC(year, endMonth, 0)).getUTCDate())}`;
  }
  return { from, to: to > today ? today : to };
}

// One-click Year / Q1-Q4 buttons. They apply to the year of the current range
// (or this year when there is none). value and onChange match DateRangePicker.
export default function QuickRanges({ value, onChange }) {
  const today = todayStr();
  const year = parseDateStr(value ? value.from : today).y;
  const items = [{ label: 'Year', q: 0 }, ...[1, 2, 3, 4].map((q) => ({ label: `Q${q}`, q }))];
  return (
    <div className="quick-ranges" role="group" aria-label={`Quick date ranges for ${year}`}>
      {items.map(({ label, q }) => {
        const range = quickRange(year, q, today);
        const active = !!range && !!value && value.from === range.from && value.to === range.to;
        return (
          <button
            key={label}
            type="button"
            className={`secondary${active ? ' active' : ''}`}
            disabled={!range}
            aria-pressed={active}
            title={range ? `${label} ${year}` : `${label} ${year} has not started`}
            onClick={() => onChange(range)}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
