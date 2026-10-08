import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { formatDateTimeShort, formatUs } from '../lib/dates.js';

const MAX_DAYS_SHOWN = 5;

// After signing in: what other people (and the API) logged since the person's
// previous sign-in, with a link to each day. Closing it keeps it closed for
// this sign-in (remembered per sign-in time in this browser tab).
export default function SinceBanner({ previousLoginAt }) {
  const key = `qdl-since-closed-${previousLoginAt}`;
  const [data, setData] = useState(null);
  const [closed, setClosed] = useState(() => {
    try {
      return sessionStorage.getItem(key) === '1';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    if (!previousLoginAt || closed) return undefined;
    let cancelled = false;
    api.get('/api/entries/since').then((d) => !cancelled && setData(d)).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [previousLoginAt, closed]);

  if (!previousLoginAt || closed || !data || data.total === 0) return null;

  const close = () => {
    setClosed(true);
    try {
      sessionStorage.setItem(key, '1');
    } catch {
      // private mode: it just comes back on reload
    }
  };
  const extraDays = data.days.length - MAX_DAYS_SHOWN;

  return (
    <div className="since-banner" role="status">
      <div>
        <p>
          <strong>{data.total} new {data.total === 1 ? 'entry' : 'entries'}</strong> since you last signed in ({formatDateTimeShort(previousLoginAt)}).
        </p>
        <div className="since-days">
          {data.days.slice(0, MAX_DAYS_SHOWN).map((d) => (
            <Link key={d.entry_date} to={`/list/${d.entry_date}`}>{formatUs(d.entry_date)} ({d.count})</Link>
          ))}
          {extraDays > 0 && <span className="muted">and {extraDays} more {extraDays === 1 ? 'day' : 'days'}</span>}
        </div>
      </div>
      <button type="button" className="secondary" style={{ padding: '2px 10px' }} onClick={close}>Close</button>
    </div>
  );
}
