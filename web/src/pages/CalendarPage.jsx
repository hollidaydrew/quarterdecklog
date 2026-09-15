import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function pad(n) { return String(n).padStart(2, '0'); }
function toDateStr(y, m, d) { return `${y}-${pad(m)}-${pad(d)}`; }

export default function CalendarPage() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1); // 1-12
  const [counts, setCounts] = useState({});
  const navigate = useNavigate();

  useEffect(() => {
    api.get(`/api/entries/month?year=${year}&month=${month}`).then(setCounts);
  }, [year, month]);

  const changeMonth = (delta) => {
    let m = month + delta;
    let y = year;
    if (m < 1) { m = 12; y -= 1; }
    if (m > 12) { m = 1; y += 1; }
    setMonth(m);
    setYear(y);
  };

  const firstOfMonth = new Date(year, month - 1, 1);
  const daysInMonth = new Date(year, month, 0).getDate();
  const leadingBlanks = firstOfMonth.getDay();

  const cells = [];
  for (let i = 0; i < leadingBlanks; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const todayStr = toDateStr(today.getFullYear(), today.getMonth() + 1, today.getDate());
  const monthLabel = firstOfMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  return (
    <div className="card">
      <div className="calendar-header">
        <button className="secondary" onClick={() => changeMonth(-1)}>&larr; Prev</button>
        <h2 style={{ margin: 0 }}>{monthLabel}</h2>
        <button className="secondary" onClick={() => changeMonth(1)}>Next &rarr;</button>
      </div>
      <div className="calendar-grid">
        {WEEKDAYS.map((w) => <div key={w} className="calendar-weekday">{w}</div>)}
        {cells.map((d, i) => {
          if (d === null) return <div key={`b${i}`} className="calendar-day empty" />;
          const dateStr = toDateStr(year, month, d);
          const count = counts[dateStr] || 0;
          return (
            <button
              key={dateStr}
              type="button"
              className={`calendar-day${dateStr === todayStr ? ' today' : ''}`}
              onClick={() => navigate(`/day/${dateStr}`)}
            >
              <span>{d}</span>
              {count > 0 && <span className="calendar-dot" title={`${count} entr${count === 1 ? 'y' : 'ies'}`} />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
