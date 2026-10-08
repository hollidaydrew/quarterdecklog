import { formatDateTimeShort, formatUs, isLateEntry, weekdayName } from './dates.js';

// Most entries Print will take in one go. Past this, the browser's print
// layout gets slow, so the page asks for a shorter range (Export has no limit).
export const PRINT_LIMIT = 1000;

const escapeHtml = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const HEX = /^#[0-9a-fA-F]{6}$/;
const FALLBACK_TAG_COLOR = '#647581';

const STYLE = `
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font: 12px/1.45 -apple-system, "Segoe UI", Helvetica, Arial, sans-serif; color: #111; margin: 0; }
  h1 { font-size: 18px; margin: 0 0 4px; }
  .count { color: #555; margin: 0 0 12px; }
  h2 { font-size: 13px; color: #444; margin: 16px 0 6px; padding-bottom: 2px; border-bottom: 2px solid #ccc; break-after: avoid; }
  .entry { margin: 0; padding: 8px 0; border-bottom: 1px solid #ccc; break-inside: avoid; }
  .meta { display: flex; align-items: center; justify-content: space-between; gap: 12px; color: #555; font-size: 11px; margin-bottom: 3px; }
  .tags { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 5px; }
  .pill { display: inline-block; padding: 2px 9px; border-radius: 999px; font-size: 10.5px; font-weight: 600; line-height: 1.4; color: #fff; white-space: nowrap; }
  .body p, .body ul, .body ol, .body pre, .body blockquote, .body h1 { margin: 0 0 4px; }
  .body pre { white-space: pre-wrap; }
`;

// A plain, self-contained HTML page for the print dialog. Entry bodies are
// already sanitized on the server; everything else is escaped here.
// title: the page heading; summary: what the list is narrowed by (may be empty).
export function buildPrintHtml(entries, title, summary = '') {
  const parts = [];
  let day = null;
  for (const e of entries) {
    if (e.entry_date !== day) {
      day = e.entry_date;
      parts.push(`<h2>${escapeHtml(formatUs(day))} ${escapeHtml(weekdayName(day))}</h2>`);
    }
    // Tags print as the same colored pills the site shows, right-aligned on the
    // same line as the author and time. Tag colors are checked before use.
    const pills = e.tags
      .map((t) => `<span class="pill" style="background:${HEX.test(t.color) ? t.color : FALLBACK_TAG_COLOR}">${escapeHtml(t.name)}</span>`)
      .join('');
    parts.push(
      `<div class="entry"><div class="meta"><span>${escapeHtml(e.author_name)} · ${escapeHtml(formatDateTimeShort(e.created_at))}` +
        `${e.edited_at ? ` · edited ${escapeHtml(formatDateTimeShort(e.edited_at))}` : ''}${isLateEntry(e) ? ' · Late entry' : ''}</span>` +
        `${pills ? `<span class="tags">${pills}</span>` : ''}</div>` +
        `<div class="body">${e.body}</div></div>`
    );
  }
  return (
    `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>${STYLE}</style></head>` +
    `<body><h1>${escapeHtml(title)}</h1><p class="count">${entries.length} ${entries.length === 1 ? 'entry' : 'entries'}${summary ? ` (${escapeHtml(summary)})` : ''}</p>${parts.join('')}</body></html>`
  );
}

// Print the entries from a hidden iframe, so none of this touches the app's own page.
export function printRollup(entries, from, to, filterText = '') {
  printEntries(entries, `Rollup: ${formatUs(from)} to ${formatUs(to)}`, filterText);
}

// Prints any list of entries (Rollup or Search).
export function printEntries(entries, title, summary = '') {
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
  frame.srcdoc = buildPrintHtml(entries, title, summary);
  document.body.appendChild(frame);
}
