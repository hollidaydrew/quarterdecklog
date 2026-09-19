import { formatDateTimeShort } from './dates.js';

const HEADERS = ['Date/Time', 'Person', 'Action', 'Summary', 'Details'];

const tagsLine = (tags) => (tags && tags.length ? tags.join(', ') : 'none');

// Plain-text version of what an event recorded (the same information the
// "Show changes" panel in the Activity log shows).
export function detailsToText(details) {
  if (!details) return '';
  if (details.changes) {
    return details.changes.map((c) => `${c.field}: ${String(c.from)} -> ${String(c.to)}`).join('\n');
  }
  if (details.before || details.after) {
    const parts = [];
    if (details.before) {
      parts.push(`${details.after ? 'Before' : 'Deleted text'}:\n${details.before.text || '(empty)'}\nTags: ${tagsLine(details.before.tags)}`);
    }
    if (details.after) {
      parts.push(`${details.before ? 'After' : 'Text'}:\n${details.after.text || '(empty)'}\nTags: ${tagsLine(details.after.tags)}`);
    }
    return parts.join('\n\n');
  }
  return Object.entries(details)
    .map(([key, value]) => {
      const label = key.replace(/_/g, ' ');
      const shown = key === 'expires_at' ? formatDateTimeShort(String(value).replace('T', ' ').slice(0, 19)) : String(value);
      return `${label}: ${shown}`;
    })
    .join('\n');
}

// One CSV cell. Every cell is quoted. A cell that starts with = + - @ (or a
// tab or carriage return) gets a leading apostrophe so a spreadsheet shows it
// as text instead of running it as a formula.
function cell(value) {
  let text = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

// rows: the array from GET /api/activity/export (newest first).
// Returns CSV text with CRLF line breaks and a UTF-8 byte-order mark, so Excel
// opens accented characters correctly.
export function activityToCsv(rows) {
  const lines = [HEADERS.map(cell).join(',')];
  for (const row of rows) {
    lines.push(
      [formatDateTimeShort(row.created_at), row.actor_name, row.action, row.summary, detailsToText(row.details)]
        .map(cell)
        .join(',')
    );
  }
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

export function downloadCsv(filename, csv) {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
