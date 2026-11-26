import type { DateFormat, PlainDate } from "./types";

// Pure integer calendar arithmetic. `Date` is avoided on purpose: it carries a
// time zone, and a daylight-saving change can shift a day difference.

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;
const SLASHED = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;

function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

function daysInMonth(y: number, m: number): number {
  if (m === 2) return isLeapYear(y) ? 29 : 28;
  return [4, 6, 9, 11].includes(m) ? 30 : 31;
}

function toPlainDate(y: number, m: number, d: number): PlainDate | null {
  if (y < 1 || m < 1 || m > 12 || d < 1 || d > daysInMonth(y, m)) return null;
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Parse a date in a known format. Returns null for text that is not a real calendar date. */
export function parseDate(text: string, format: DateFormat): PlainDate | null {
  const t = text.trim();
  if (format === "YYYY-MM-DD") {
    const m = ISO.exec(t);
    return m ? toPlainDate(Number(m[1]), Number(m[2]), Number(m[3])) : null;
  }
  const m = SLASHED.exec(t);
  if (!m) return null;
  const [a, b, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  return format === "MM/DD/YYYY" ? toPlainDate(y, a, b) : toPlainDate(y, b, a);
}

// Days since 1970-01-01 (Howard Hinnant's days_from_civil).
function dayNumber(date: PlainDate): number {
  const [yy = 0, m = 0, d = 0] = date.split("-").map(Number);
  const y = m <= 2 ? yy - 1 : yy;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

/** Whole days from `a` to `b`; negative when `b` is earlier. Inputs must come from `parseDate`: other strings give NaN. */
export function daysBetween(a: PlainDate, b: PlainDate): number {
  return dayNumber(b) - dayNumber(a);
}

// Inverse of `dayNumber` (Howard Hinnant's civil_from_days).
function fromDayNumber(z0: number): PlainDate {
  const z = z0 + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor(
    (doe -
      Math.floor(doe / 1460) +
      Math.floor(doe / 36524) -
      Math.floor(doe / 146096)) /
      365,
  );
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp < 10 ? mp + 3 : mp - 9;
  const y = yoe + era * 400 + (m <= 2 ? 1 : 0);
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** The date `n` days after `date` (`n` may be negative). `date` must come from `parseDate`. */
export function addDays(date: PlainDate, n: number): PlainDate {
  return fromDayNumber(dayNumber(date) + n);
}

/**
 * The date `n` calendar months after `date`; a day past the end of the target month clamps to its
 * last day. `anchorDay` replaces the date's own day, so a series billed on the 31st keeps that day
 * after passing through February.
 */
export function addMonths(
  date: PlainDate,
  n: number,
  anchorDay?: number,
): PlainDate {
  const [y = 0, m = 0, own = 0] = date.split("-").map(Number);
  const d = anchorDay ?? own;
  const index = y * 12 + (m - 1) + n;
  const ty = Math.floor(index / 12);
  const tm = (((index % 12) + 12) % 12) + 1;
  return `${String(ty).padStart(4, "0")}-${String(tm).padStart(2, "0")}-${String(Math.min(d, daysInMonth(ty, tm))).padStart(2, "0")}`;
}
