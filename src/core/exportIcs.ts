import { hash53 } from "./csv/toStatement";
import { decimal } from "./exportCsv";
import { addDays } from "./plainDate";
import { cadenceLabel } from "./recurring/labels";
import type { RecurringSeries } from "./recurring/types";
import type { PlainDate } from "./types";

const encoder = new TextEncoder();

// Controls other than a line break cannot be written in a text value (they would end the line).
const isControl = (ch: string): boolean => {
  const c = ch.codePointAt(0) ?? 0;
  return (c < 0x20 && c !== 0x0a) || c === 0x7f;
};

/** RFC 5545 section 3.3.11: escape backslash, semicolon, comma and line breaks; drop other controls. */
const escapeText = (text: string): string =>
  [...text.replace(/\r\n|\r/g, "\n")]
    .filter((ch) => !isControl(ch))
    .join("")
    .replaceAll("\\", "\\\\")
    .replaceAll(";", "\\;")
    .replaceAll(",", "\\,")
    .replaceAll("\n", "\\n");

/** RFC 5545 section 3.1: lines are at most 75 octets; a longer one continues after CRLF and a space. */
function fold(line: string): string {
  const parts: string[] = [];
  let current = "";
  let size = 0;
  for (const ch of line) {
    const bytes = encoder.encode(ch).length;
    const limit = parts.length === 0 ? 75 : 74;
    if (size + bytes > limit) {
      parts.push(current);
      current = "";
      size = 0;
    }
    current += ch;
    size += bytes;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

const compact = (date: PlainDate): string => date.replaceAll("-", "");

/**
 * A calendar file with one all-day event per series, on its next expected date (FR-12). Possible
 * yearly charges (one charge so far) are left out. `stamp` is a date, not the clock, so the same
 * input always gives the same file. Written by hand against RFC 5545; no dependency.
 */
export function exportIcs(
  series: readonly RecurringSeries[],
  stamp: PlainDate,
): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Recur//Recurring charges//EN",
    "CALSCALE:GREGORIAN",
  ];
  for (const s of series) {
    if (s.cadence === "annual-possible") continue;
    lines.push(
      "BEGIN:VEVENT",
      `UID:${hash53(`${s.merchantKey}|${s.nextExpected}`)}@recur.invalid`,
      `DTSTAMP:${compact(stamp)}T000000Z`,
      `DTSTART;VALUE=DATE:${compact(s.nextExpected)}`,
      `DTEND;VALUE=DATE:${compact(addDays(s.nextExpected, 1))}`,
      `SUMMARY:${escapeText(s.displayName)}`,
      `DESCRIPTION:${escapeText(`${cadenceLabel(s.cadence)}, about ${decimal(s.typicalAmount)} each time. Estimated from your statements.`)}`,
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return `${lines.map(fold).join("\r\n")}\r\n`;
}
