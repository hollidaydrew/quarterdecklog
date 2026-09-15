// Entry dates are always plain "YYYY-MM-DD" strings supplied by the client,
// computed from the browser's local y/m/d. We never construct a Date object
// from a bare date string on the server, since `new Date("2026-09-14")` is
// parsed as UTC midnight and can roll back a day once displayed in a
// timezone west of UTC. We only validate the shape here.

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidDateString(value) {
  if (typeof value !== 'string' || !DATE_RE.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  if (m < 1 || m > 12) return false;
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return d >= 1 && d <= daysInMonth;
}

export function isValidYearMonth(year, month) {
  const y = Number(year);
  const m = Number(month);
  return Number.isInteger(y) && Number.isInteger(m) && m >= 1 && m <= 12 && y >= 1970 && y <= 9999;
}
