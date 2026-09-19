// All dates in the app are plain "YYYY-MM-DD" strings built from the browser's
// local year/month/day. We never parse a bare date string with `new Date(str)`
// (that reads it as UTC and can land on the wrong day west of UTC), and we do
// day arithmetic at local noon so daylight-saving changes can't shift a date.

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const pad = (n) => String(n).padStart(2, '0');

export function toDateStr(y, m, d) {
  return `${String(y).padStart(4, '0')}-${pad(m)}-${pad(d)}`;
}

export function parseDateStr(s) {
  const [y, m, d] = s.split('-').map(Number);
  return { y, m, d };
}

export function isDateStr(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

export function todayStr() {
  const t = new Date();
  return toDateStr(t.getFullYear(), t.getMonth() + 1, t.getDate());
}

export function addDays(s, n) {
  const { y, m, d } = parseDateStr(s);
  const dt = new Date(y, m - 1, d + n, 12);
  return toDateStr(dt.getFullYear(), dt.getMonth() + 1, dt.getDate());
}

// Whole days from a to b (positive when b is later). UTC math, so DST-proof.
export function daysBetween(a, b) {
  const pa = parseDateStr(a);
  const pb = parseDateStr(b);
  return Math.round((Date.UTC(pb.y, pb.m - 1, pb.d) - Date.UTC(pa.y, pa.m - 1, pa.d)) / 86400000);
}

export function weekdayName(s) {
  const { y, m, d } = parseDateStr(s);
  return WEEKDAYS[new Date(y, m - 1, d, 12).getDay()];
}

// "09-18-2026"
export function formatUs(s) {
  const { y, m, d } = parseDateStr(s);
  return `${pad(m)}-${pad(d)}-${String(y).padStart(4, '0')}`;
}

// Same format from a Date object (local time).
export function formatUsFromDate(dt) {
  return formatUs(toDateStr(dt.getFullYear(), dt.getMonth() + 1, dt.getDate()));
}

// "09-18-2026 Friday" or, when the day has entries, "09-18-2026 Friday (3)"
export function formatListLabel(s, count = 0) {
  return `${formatUs(s)} ${weekdayName(s)}${count > 0 ? ` (${count})` : ''}`;
}
