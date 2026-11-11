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
  ])("%i -> %j", (cents, text) => {
    expect(formatCents(cents)).toBe(text);
  });

  test("round-trips through parseMoney", () => {
    for (const cents of [0, 1, 99, 100, 101, -1, -99999, 123456789]) {
      expect(parseMoney(formatCents(cents))).toBe(cents);
    }
  });
});
