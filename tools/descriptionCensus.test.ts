import { describe, expect, test } from "vitest";
import { census, classify, formatCensus } from "./descriptionCensus";

// Invented descriptions only.
describe("classify", () => {
  test.each([
    ["SQ *FAKE CAFE", "processor-prefix"],
    ["TST* INVENTED BISTRO", "processor-prefix"],
    ["PAYPAL *ACMEGAMES", "processor-prefix"],
    ["FAKE COFFEE _V", "readable"],
    ["XK7 QQ9 12345678", "code-like"],
    ["TFR 4421 ZX", "code-like"],
    ["", "code-like"],
  ])("%s is %s", (d, expected) => {
    expect(classify(d)).toBe(expected);
  });
});

describe("census", () => {
  const rows = [
    "FAKE COFFEE _V",
    "FAKE COFFEE _V",
    "FAKE COFFEE _V",
    "SQ *FAKE CAFE",
    "XK7 QQ9 12345678",
    "ZZ 000111222",
  ];

  test("counts transactions, distinct descriptions, classes and flags", () => {
    const c = census(rows);
    expect(c.transactions).toBe(6);
    expect(c.distinct).toBe(4);
    expect(c.byClass.readable).toEqual({
      transactions: 3,
      distinct: 1,
      repeated: 3,
    });
    expect(c.byClass["processor-prefix"].transactions).toBe(1);
    expect(c.byClass["code-like"].transactions).toBe(2);
    expect(c.withBankCodeSuffix).toBe(3);
    expect(c.withLongDigitRun).toBe(2);
  });

  test("the printed lines hold no description text", () => {
    const out = formatCensus(census(rows)).join("\n");
    for (const word of ["COFFEE", "CAFE", "XK7", "000111222"])
      expect(out).not.toContain(word);
  });
});
