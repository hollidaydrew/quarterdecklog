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
  .printbar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin: 0 0 14px; padding: 10px 12px; background: #f3f5f7; border: 1px solid #ccc; border-radius: 8px; }
  .printbar span { flex: 1 1 180px; color: #444; }
  .printbar button { font: inherit; font-weight: 600; padding: 9px 18px; border-radius: 8px; border: 1px solid #647581; background: #647581; color: #fff; }
  .printbar button.secondary { background: #fff; color: #232838; border-color: #ccc; }
  @media print { .printbar { display: none; } }
`;

// A plain, self-contained HTML page for the print dialog. Entry bodies are
// already sanitized on the server; everything else is escaped here.
// title: the page heading; summary: what the list is narrowed by (may be empty).
// options.toolbar adds a Print / Close bar at the top for the phone version,
// where the page opens in its own tab (the bar itself never prints).
export function buildPrintHtml(entries, title, summary = '', { toolbar = false } = {}) {
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
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)}</title><style>${STYLE}</style></head>` +
    `<body>${toolbar ? '<div class="printbar"><span>Use Print to print this page or save it as a PDF.</span><button type="button" id="qdl-print">Print</button><button type="button" class="secondary" id="qdl-close">Close</button></div>' : ''}<h1>${escapeHtml(title)}</h1><p class="count">${entries.length} ${entries.length === 1 ? 'entry' : 'entries'}${summary ? ` (${escapeHtml(summary)})` : ''}</p>${parts.join('')}</body></html>`
  );
}

// Print the entries (see printEntries below for how, on a computer and on a phone).
export function printRollup(entries, from, to, filterText = '') {
  printEntries(entries, `Rollup: ${formatUs(from)} to ${formatUs(to)}`, filterText);
}

// Phones and tablets can't print from a hidden frame (an iPhone prints the app
// page behind it, which is blank, and Android browsers are unreliable), so there
// the printable page opens in its own tab with a Print button on it.
const isPhoneOrTablet = () =>
  window.matchMedia('(pointer: coarse)').matches ||
  /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

// Prints any list of entries (Rollup or Search).
export function printEntries(entries, title, summary = '') {
  if (isPhoneOrTablet()) {
    // Opened right away, inside the tap that asked for it, so it isn't blocked as a pop-up.
    const win = window.open('', '_blank');
    if (win) {
      win.document.open();
      win.document.write(buildPrintHtml(entries, title, summary, { toolbar: true }));
      win.document.close();
      // The page's own scripts are off (the app's security policy), so the
      // buttons are wired up from here.
      const print = win.document.getElementById('qdl-print');
      const close = win.document.getElementById('qdl-close');
      if (print) print.addEventListener('click', () => win.print());
      if (close) close.addEventListener('click', () => win.close());
      win.focus();
      return;
    }
    // Pop-ups blocked: fall back to the frame below.
  }
  printFromFrame(entries, title, summary);
}

// Print from a hidden iframe, so none of this touches the app's own page (computers).
function printFromFrame(entries, title, summary) {
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
