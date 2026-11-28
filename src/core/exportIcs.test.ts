import fc from "fast-check";
import { describe, expect, test } from "vitest";
import { exportIcs } from "./exportIcs";
import type { RecurringSeries } from "./recurring/types";

const series = (
  displayName: string,
  nextExpected: string,
  over: Partial<RecurringSeries> = {},
): RecurringSeries => ({
  merchantKey: displayName.toUpperCase(),
  displayName,
  cadence: "monthly",
  ambiguous: false,
  typicalAmount: 1699,
  amountKind: "fixed",
  monthlyEquivalent: 1699,
  annualCost: 20388,
  occurrences: [],
  nextExpected,
  confidence: "high",
  ...over,
});

/** A small reader written from RFC 5545 only, to prove the file reads back to what went in. */
function readBack(ics: string) {
  const unfolded = ics.replaceAll("\r\n ", "").split("\r\n");
  const events: Record<string, string>[] = [];
  let cur: Record<string, string> | undefined;
  for (const line of unfolded) {
    if (line === "BEGIN:VEVENT") cur = {};
    else if (line === "END:VEVENT" && cur) {
      events.push(cur);
      cur = undefined;
    } else if (cur) {
      const i = line.indexOf(":");
      cur[line.slice(0, i).split(";")[0] ?? ""] = line.slice(i + 1);
    }
  }
  const unescapeText = (t: string): string => {
    let out = "";
    for (let i = 0; i < t.length; i++) {
      const ch = t.charAt(i);
      if (ch !== "\\") out += ch;
      else {
        const next = t.charAt(++i);
        out += next === "n" || next === "N" ? "\n" : next;
      }
    }
    return out;
  };
  return events.map((e) => ({
    summary: unescapeText(e.SUMMARY ?? ""),
    start: e.DTSTART ?? "",
    end: e.DTEND ?? "",
    uid: e.UID ?? "",
  }));
}

describe("exportIcs", () => {
  test("one all-day event per series, on its next expected date", () => {
    const ics = exportIcs(
      [series("Streamly", "2026-01-05"), series("Gym", "2026-02-28")],
      "2025-12-31",
    );
    expect(ics.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(readBack(ics)).toMatchObject([
      { summary: "Streamly", start: "20260105", end: "20260106" },
      { summary: "Gym", start: "20260228", end: "20260301" },
    ]);
    expect(ics).toContain("DTSTAMP:20251231T000000Z\r\n");
  });
  test("possible yearly charges (one charge so far) are left out", () => {
    const ics = exportIcs(
      [series("Maybe", "2026-03-01", { cadence: "annual-possible" })],
      "2025-12-31",
    );
    expect(readBack(ics)).toEqual([]);
  });
  test("an empty list is still a valid calendar", () => {
    expect(exportIcs([], "2025-12-31")).toBe(
      "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Recur//Recurring charges//EN\r\nCALSCALE:GREGORIAN\r\nEND:VCALENDAR\r\n",
    );
  });
  test("names with separators, backslashes, line breaks and accents read back unchanged", () => {
    const names = [
      "A, B; C",
      "back\\slash",
      "two\nlines",
      "Café Crème 🍩",
      "x".repeat(300),
    ];
    const out = readBack(
      exportIcs(
        names.map((n, i) =>
          series(n, `2026-01-${String(i + 1).padStart(2, "0")}`),
        ),
        "2025-12-31",
      ),
    );
    expect(out.map((e) => e.summary)).toEqual(names);
  });
  test("the file itself carries the RFC escapes", () => {
    const ics = exportIcs([series("a\\b;c,d", "2026-01-05")], "2025-12-31");
    expect(ics).toContain("SUMMARY:a\\\\b\\;c\\,d\r\n");
  });
  test("lines are at most 75 octets and end with CRLF, for any name", () => {
    fc.assert(
      fc.property(
        fc.array(fc.string({ maxLength: 200 }), { maxLength: 5 }),
        (names) => {
          const ics = exportIcs(
            names.map((n) => series(n, "2026-01-05")),
            "2025-12-31",
          );
          expect(ics.replace(/\r\n/g, "").includes("\n")).toBe(false);
          for (const line of ics.split("\r\n").slice(0, -1))
            expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(
              75,
            );
        },
      ),
    );
  });
  test("a name survives the round trip (control characters other than newline are dropped)", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 120 }), (name) => {
        const [e] = readBack(
          exportIcs([series(name, "2026-01-05")], "2025-12-31"),
        );
        const clean = [...name.replace(/\r\n|\r/g, "\n")]
          .filter((ch) => {
            const c = ch.codePointAt(0) ?? 0;
            return !(
              (c < 0x20 && c !== 0x0a) ||
              c === 0x7f ||
              c === 0x85 ||
              c === 0x2028 ||
              c === 0x2029
            );
          })
          .join("");
        expect(e?.summary).toBe(clean);
      }),
    );
  });
  test("U+2028, U+2029 and U+0085 are dropped from text values", () => {
    const [e] = readBack(
      exportIcs([series("a\u2028b\u2029c\u0085d", "2026-01-05")], "2025-12-31"),
    );
    expect(e?.summary).toBe("abcd");
  });
  test("the UID follows the series key, not the next expected date", () => {
    const uid = (name: string, next: string) =>
      readBack(exportIcs([series(name, next)], "2025-12-31"))[0]?.uid;
    expect(uid("Streamly", "2026-01-05")).toBe(uid("Streamly", "2026-02-05"));
    expect(uid("Streamly", "2026-01-05")).not.toBe(uid("Gym", "2026-01-05"));
  });
  test("each event has a stable, distinct UID", () => {
    const list = [
      series("Streamly", "2026-01-05"),
      series("Gym", "2026-02-28"),
    ];
    const a = readBack(exportIcs(list, "2025-12-31"));
    expect(a[0]?.uid).not.toBe(a[1]?.uid);
    expect(readBack(exportIcs(list, "2025-12-31"))).toEqual(a);
  });
});
