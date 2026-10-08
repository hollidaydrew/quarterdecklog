import { formatDateTimeShort, formatUs, isLateEntry, weekdayName } from './dates.js';

// Most entries Print / PDF will take in one go. Past this, the browser's print
// layout gets slow, so the page asks for a shorter range (Export CSV has no limit).
export const PRINT_LIMIT = 1000;

const escapeHtml = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const STYLE = `
  body { font: 12px/1.45 -apple-system, "Segoe UI", Helvetica, Arial, sans-serif; color: #111; margin: 0; }
  h1 { font-size: 18px; margin: 0 0 4px; }
  .count { color: #555; margin: 0 0 12px; }
  h2 { font-size: 13px; color: #444; margin: 16px 0 6px; padding-bottom: 2px; border-bottom: 1px solid #ccc; break-after: avoid; }
  .entry { margin: 0 0 10px; break-inside: avoid; }
  .meta { color: #555; font-size: 11px; margin-bottom: 2px; }
  .body p, .body ul, .body ol, .body pre, .body blockquote, .body h1 { margin: 0 0 4px; }
  .body pre { white-space: pre-wrap; }
  .tags { color: #555; font-size: 11px; margin-top: 2px; }
`;

// A plain, self-contained HTML page for the print dialog. Entry bodies are
// already sanitized on the server; everything else is escaped here.
export function buildPrintHtml(entries, from, to, filterText = '') {
  const parts = [];
  let day = null;
  for (const e of entries) {
    if (e.entry_date !== day) {
      day = e.entry_date;
      parts.push(`<h2>${escapeHtml(formatUs(day))} ${escapeHtml(weekdayName(day))}</h2>`);
    }
    const tags = e.tags.length ? `<div class="tags">Tags: ${e.tags.map((t) => escapeHtml(t.name)).join(', ')}</div>` : '';
    parts.push(
      `<div class="entry"><div class="meta">${escapeHtml(e.author_name)} · ${escapeHtml(formatDateTimeShort(e.created_at))}` +
        `${e.edited_at ? ` · edited ${escapeHtml(formatDateTimeShort(e.edited_at))}` : ''}${isLateEntry(e) ? ' · Late entry' : ''}</div>` +
        `<div class="body">${e.body}</div>${tags}</div>`
    );
  }
  const title = `Rollup: ${formatUs(from)} to ${formatUs(to)}`;
  return (
    `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>${STYLE}</style></head>` +
    `<body><h1>${escapeHtml(title)}</h1><p class="count">${entries.length} ${entries.length === 1 ? 'entry' : 'entries'}${filterText ? ` (${escapeHtml(filterText)})` : ''}</p>${parts.join('')}</body></html>`
  );
}

// Print the entries from a hidden iframe, so none of this touches the app's own page.
export function printRollup(entries, from, to, filterText = '') {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
  const cleanup = () => setTimeout(() => frame.remove(), 1000);
  frame.onload = () => {
    const win = frame.contentWindow;
    win.addEventListener('afterprint', cleanup);
    win.focus();
    win.print();
  };
  frame.srcdoc = buildPrintHtml(entries, from, to, filterText);
  document.body.appendChild(frame);
}
