import { describe, expect, test } from "vitest";
import { readCsv } from "./read";

const BOM = String.fromCodePoint(0xfeff);

function rows(text: string): string[][] {
  const r = readCsv(text);
  if (!r.ok) throw new Error(`expected ok, got: ${r.reason}`);
  return r.rows;
}

describe("readCsv", () => {
  test("plain rows", () => {
    expect(rows("a,b,c\n1,2,3\n")).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
  });

  test("a file with no header row is returned as data, not guessed", () => {
    expect(
      rows("2026-01-05,COFFEE,-4.50\n2026-01-06,PAYROLL,1200.00\n"),
    ).toEqual([
      ["2026-01-05", "COFFEE", "-4.50"],
      ["2026-01-06", "PAYROLL", "1200.00"],
    ]);
  });

  test("strips a byte-order mark", () => {
    expect(rows(`${BOM}Date,Amount\n2026-01-05,1.00\n`)[0]).toEqual([
      "Date",
      "Amount",
    ]);
  });

  test("handles CRLF and a missing final newline", () => {
    expect(rows("a,b\r\n1,2\r\n3,4")).toEqual([
      ["a", "b"],
      ["1", "2"],
      ["3", "4"],
    ]);
  });

  test("drops trailing and interior blank lines", () => {
    expect(rows("a,b\n\n1,2\n\n\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  test("quoted fields keep commas, doubled quotes and newlines", () => {
    expect(rows('d,"SHOP, THE ""BEST""","line1\nline2"\n')).toEqual([
      ["d", 'SHOP, THE "BEST"', "line1\nline2"],
    ]);
  });

  test("keeps a quoted thousands amount as one cell", () => {
    expect(rows('2026-01-05,RENT,"-1,234.56"\n')).toEqual([
      ["2026-01-05", "RENT", "-1,234.56"],
    ]);
  });

  test("keeps empty cells so column positions do not shift", () => {
    expect(rows("2026-01-05,PAYROLL,,1200.00\n")).toEqual([
      ["2026-01-05", "PAYROLL", "", "1200.00"],
    ]);
  });

  test("does not convert types: numbers and dates stay strings", () => {
    expect(rows("007,1e3,2026-01-05\n")).toEqual([
      ["007", "1e3", "2026-01-05"],
    ]);
  });

  test("empty and whitespace-only input yield zero rows", () => {
    expect(rows("")).toEqual([]);
    expect(rows(" \n\n")).toEqual([]);
  });

  test("an unterminated quote is a failure, not silently swallowed rows", () => {
    const r = readCsv('a,b\n1,"oops\n2,3\n');
    expect(r.ok).toBe(false);
  });

  test("detects a tab or semicolon delimiter", () => {
    expect(rows("a\tb\n1\t2\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
    expect(rows("a;b\n1;2\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });
});
