import { describe, expect, test } from "vitest";
import { daysBetween, parseDate } from "./plainDate";

describe("parseDate", () => {
  test.each([
    ["2026-01-05", "YYYY-MM-DD", "2026-01-05"],
    ["01/05/2026", "MM/DD/YYYY", "2026-01-05"],
    ["1/5/2026", "MM/DD/YYYY", "2026-01-05"],
    ["05/01/2026", "DD/MM/YYYY", "2026-01-05"],
    ["5/1/2026", "DD/MM/YYYY", "2026-01-05"],
    [" 2026-12-31 ", "YYYY-MM-DD", "2026-12-31"],
    ["2024-02-29", "YYYY-MM-DD", "2024-02-29"],
    ["2000-02-29", "YYYY-MM-DD", "2000-02-29"],
  ] as const)("%j as %s -> %s", (text, format, expected) => {
    expect(parseDate(text, format)).toBe(expected);
  });

  test("the same text reads differently by format", () => {
    expect(parseDate("03/04/2026", "MM/DD/YYYY")).toBe("2026-03-04");
    expect(parseDate("03/04/2026", "DD/MM/YYYY")).toBe("2026-04-03");
  });

  test.each([
    ["", "YYYY-MM-DD"],
    ["2026-1-05", "YYYY-MM-DD"],
    ["2026/01/05", "YYYY-MM-DD"],
    ["2026-13-01", "YYYY-MM-DD"],
    ["2026-00-10", "YYYY-MM-DD"],
    ["2026-04-31", "YYYY-MM-DD"],
    ["2026-02-29", "YYYY-MM-DD"],
    ["1900-02-29", "YYYY-MM-DD"],
    ["13/01/2026", "MM/DD/YYYY"],
    ["01/32/2026", "MM/DD/YYYY"],
    ["01/13/2026", "DD/MM/YYYY"],
    ["01/05/26", "MM/DD/YYYY"],
    ["2026-01-05", "MM/DD/YYYY"],
    ["2026-01-05T00:00", "YYYY-MM-DD"],
  ] as const)("rejects %j as %s", (text, format) => {
    expect(parseDate(text, format)).toBeNull();
  });
});

describe("daysBetween", () => {
  test.each([
    ["2026-01-01", "2026-01-01", 0],
    ["2026-01-01", "2026-01-31", 30],
    ["2026-01-31", "2026-01-01", -30],
    ["2026-02-28", "2026-03-01", 1],
    ["2024-02-28", "2024-03-01", 2],
    ["2025-12-31", "2026-01-01", 1],
    ["2025-01-01", "2026-01-01", 365],
    ["2024-01-01", "2025-01-01", 366],
    ["1999-12-31", "2000-03-01", 61],
  ] as const)("%s -> %s = %i", (a, b, days) => {
    expect(daysBetween(a, b)).toBe(days);
  });

  test("ignores daylight-saving changes", () => {
    // Ottawa moves clocks on 2026-03-08 and 2026-11-01; a Date-based diff can be off by an hour.
    expect(daysBetween("2026-03-07", "2026-03-09")).toBe(2);
    expect(daysBetween("2026-10-31", "2026-11-02")).toBe(2);
  });
});
