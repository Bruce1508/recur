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

/** Whole days from `a` to `b`; negative when `b` is earlier. */
export function daysBetween(a: PlainDate, b: PlainDate): number {
  return dayNumber(b) - dayNumber(a);
}
