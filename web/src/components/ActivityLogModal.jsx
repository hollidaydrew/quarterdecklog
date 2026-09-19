import { useCallback, useEffect, useState } from 'react';
import Modal from './Modal.jsx';
import { api } from '../api.js';
import { formatDateTimeLog, formatDateTimeShort, todayStr } from '../lib/dates.js';
import { activityToCsv, downloadCsv } from '../lib/activityCsv.js';

function TextBlock({ label, value }) {
  return (
    <div className="activity-block">
      <div className="activity-block-label">{label}</div>
      <pre className="activity-text">{value || '(empty)'}</pre>
    </div>
  );
}

function tagsLine(tags) {
  return tags && tags.length ? tags.join(', ') : 'none';
}

// Shows what an event recorded: entry text and tags for entry events, old and
// new values for edits, and a plain list for everything else.
function Details({ details }) {
  if (!details) return null;
  if (details.changes) {
    return (
      <ul className="activity-changes">
        {details.changes.map((c, i) => (
          <li key={i}><strong>{c.field}:</strong> {String(c.from)} &rarr; {String(c.to)}</li>
        ))}
      </ul>
    );
  }
  if (details.before || details.after) {
    const sameText = details.before && details.after && details.before.text === details.after.text;
    return (
      <>
        {details.before && <TextBlock label={details.after ? 'Before' : 'Deleted text'} value={details.before.text} />}
        {details.before && <p className="activity-tags">Tags: {tagsLine(details.before.tags)}</p>}
        {details.after && <TextBlock label={details.before ? 'After' : 'Text'} value={details.after.text} />}
        {details.after && <p className="activity-tags">Tags: {tagsLine(details.after.tags)}</p>}
        {sameText && <p className="muted">The text is the same; only formatting or tags changed.</p>}
      </>
    );
  }
  return (
    <ul className="activity-changes">
      {Object.entries(details).map(([key, value]) => (
        <li key={key}>
          <strong>{key.replace(/_/g, ' ')}:</strong>{' '}
          {key === 'expires_at' ? formatDateTimeShort(String(value).replace('T', ' ').slice(0, 19)) : String(value)}
        </li>
      ))}
    </ul>
  );
}

function ActivityRow({ row }) {
  const [open, setOpen] = useState(false);
  const [details, setDetails] = useState(null);
  const [error, setError] = useState('');

  const toggle = async () => {
    if (!open && details === null) {
      try {
        const data = await api.get(`/api/activity/${row.id}`);
        setDetails(data.details || {});
      } catch (err) {
        setError(err.message);
      }
    }
    setOpen((o) => !o);
  };

  return (
    <li className="activity-row">
      <div className="activity-line">
        <span className="activity-time">{formatDateTimeLog(row.created_at)}</span>
        <span className="activity-summary">{row.summary}</span>
        {row.has_details ? (
          <button type="button" className="link-button" onClick={toggle} aria-expanded={open}>
            {open ? 'Hide changes' : 'Show changes'}
          </button>
        ) : null}
      </div>
      {error && <p className="error-text">{error}</p>}
      {open && details && <div className="activity-details"><Details details={details} /></div>}
    </li>
  );
}

export default function ActivityLogModal({ onClose }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);

  const load = useCallback(() => {
    setError('');
    return api.get('/api/activity').then(setRows).catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const exportCsv = async () => {
    setExporting(true);
    setError('');
    try {
      const all = await api.get('/api/activity/export');
      downloadCsv(`quarterdecklog-activity-${todayStr()}.csv`, activityToCsv(all));
    } catch (err) {
      setError(err.message);
    } finally {
      setExporting(false);
    }
  };

  return (
    <Modal onClose={onClose} wide closeOnEscape label="Activity log">
      <div className="release-head">
        <h3 style={{ margin: 0 }}>Activity log</h3>
        <span className="row-actions">
          <button type="button" className="secondary" onClick={exportCsv} disabled={exporting}>{exporting ? 'Exporting…' : 'Export CSV'}</button>
          <button type="button" className="secondary" onClick={load}>Refresh</button>
          <button type="button" className="secondary" onClick={onClose}>Close</button>
        </span>
      </div>
      <p className="muted" style={{ margin: '4px 0 12px' }}>
        Newest first. Keeps the last 5,000 events. Times are in your local time.
      </p>
      {error && <p className="error-text">{error}</p>}
      {rows && rows.length === 0 && <p className="muted">Nothing has been recorded yet.</p>}
      {rows && rows.length > 0 && (
        <ul className="activity-list">
          {rows.map((row) => <ActivityRow key={row.id} row={row} />)}
        </ul>
      )}
    </Modal>
  );
}
