import { formatDateTimeShort, formatUs, isLateEntry, weekdayName } from './dates.js';
import { downloadCsv } from './activityCsv.js';

const HEADERS = ['Date', 'Day', 'User', 'Created', 'Edited', 'Late entry', 'Tags', 'Entry'];

// The readable text of an entry's HTML body, one line per block.
export function bodyToText(html) {
  const doc = new DOMParser().parseFromString(String(html || '').replace(/<(br|\/p|\/div|\/li|\/h\d|\/blockquote|\/pre)\b[^>]*>/gi, '$&\n'), 'text/html');
  return (doc.body.textContent || '').replace(/\n{3,}/g, '\n\n').trim();
}

// Same quoting rules as the activity log export: every cell quoted, and a cell
// that starts with = + - @ (or a tab or carriage return) gets a leading
// apostrophe so a spreadsheet shows it as text instead of running it.
function cell(value) {
  let text = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

// entries: the array from GET /api/entries/rollup. CRLF line breaks and a
// UTF-8 byte-order mark, so Excel opens accented characters correctly.
export function rollupToCsv(entries) {
  const lines = [HEADERS.map(cell).join(',')];
  for (const e of entries) {
    lines.push(
      [
        formatUs(e.entry_date),
        weekdayName(e.entry_date),
        e.author_name,
        formatDateTimeShort(e.created_at),
        e.edited_at ? formatDateTimeShort(e.edited_at) : '',
        isLateEntry(e) ? 'Yes' : '',
        e.tags.map((t) => t.name).join(', '),
        bodyToText(e.body),
      ]
        .map(cell)
        .join(',')
    );
  }
  return `﻿${lines.join('\r\n')}\r\n`;
}

// Any list of entries (Rollup or Search) as a spreadsheet file.
export function downloadEntriesCsv(entries, filename) {
  downloadCsv(filename, rollupToCsv(entries));
}

export function downloadRollupCsv(entries, from, to, filtered = false) {
  downloadEntriesCsv(entries, `quarterdecklog-rollup-${from}-to-${to}${filtered ? '-filtered' : ''}.csv`);
}
