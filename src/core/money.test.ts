import { describe, expect, test } from "vitest";
import { formatCents, parseMoney } from "./money";

describe("parseMoney", () => {
  test.each([
    ["0", 0],
    ["12", 1200],
    ["12.5", 1250],
    ["12.34", 1234],
    [".99", 99],
    ["$12.34", 1234],
    ["1,234.56", 123456],
    ["$1,234,567.89", 123456789],
    ["  42.00  ", 4200],
    ["+7.01", 701],
    ["1,234", 123400], // thousands, not a decimal comma: see mapColumns
    ["-.99", -99],
    ["$.50", 50],
    ["90071992547409.91", 9007199254740991],
  ])("positive %j -> %i", (text, cents) => {
    expect(parseMoney(text)).toBe(cents);
  });

  test.each([
    ["-12.34", -1234],
    ["-$12.34", -1234],
    ["$-12.34", -1234],
    ["(12.34)", -1234],
    ["($1,234.56)", -123456],
    ["( 5.00 )", -500],
  ])("negative %j -> %i", (text, cents) => {
    expect(parseMoney(text)).toBe(cents);
  });

  test("negative zero is plain zero", () => {
    expect(Object.is(parseMoney("-0.00"), 0)).toBe(true);
    expect(Object.is(parseMoney("(0)"), 0)).toBe(true);
  });

  test.each([
    "",
    "   ",
    "abc",
    "12.345",
    "1,23.45",
    "12,34",
    "1,2345.00",
    "--1",
    "-(1.00)",
    "(1.00",
    "1.00)",
    "1.2.3",
    "$",
    ".",
    "1e3",
    "0,001",
    "01,234",
    "(-1.00)",
    "(+5)",
    "()",
    "( )",
    "\u22125.00", // Unicode minus
    "12.34-", // trailing minus: add only if a real export uses it
    "12.34 CR",
    "$ 5",
    "1 234.56", // space as thousands separator
    "5.",
    "$(5)",
    "90071992547409.92", // one cent past Number.MAX_SAFE_INTEGER
    "99999999999999999",
  ])("rejects %j", (text) => {
    expect(parseMoney(text)).toBeNull();
  });

  test("never goes through a float: 0.1 + 0.2 style values are exact", () => {
    expect(
      (parseMoney("0.10") ?? Number.NaN) + (parseMoney("0.20") ?? Number.NaN),
    ).toBe(30);
  });
});

describe("formatCents", () => {
  test.each([
    [0, "$0.00"],
    [5, "$0.05"],
    [1234, "$12.34"],
    [123456789, "$1,234,567.89"],
    [-1234, "-$12.34"],
    [-5, "-$0.05"],
    [-0, "$0.00"],
  ])("%i -> %j", (cents, text) => {
    expect(formatCents(cents)).toBe(text);
  });

  test("round-trips through parseMoney for every cent in a wide range", () => {
    for (let c = -200000; c <= 200000; c++) {
      expect(parseMoney(formatCents(c))).toBe(c);
    }
  });

  test("round-trips through parseMoney", () => {
    for (const cents of [0, 1, 99, 100, 101, -1, -99999, 123456789]) {
      expect(parseMoney(formatCents(cents))).toBe(cents);
    }
  });
});
