import fc from "fast-check";
import { describe, expect, test } from "vitest";
import { clean, normalise } from "./rules";

describe("normalise", () => {
  test.each([
    ["  acme   coffee ", "ACME COFFEE"],
    ["Joe's Pizza", "JOES PIZZA"],
    ["acme.com", "ACME COM"],
    ["pay 12.99 now", "PAY 12.99 NOW"],
  ])("%j -> %j", (input, out) => {
    expect(normalise(input)).toBe(out);
  });
});

describe("clean", () => {
  test("cuts the bank-code tail into bankCode", () => {
    const c = clean("ACME COFFEE_V");
    expect(c).toMatchObject({ merchantKey: "ACME COFFEE", bankCode: "V" });
    expect(c.removed).toEqual(["bank code: _V"]);
  });

  test("keeps the processor prefix", () => {
    expect(clean("SQ *ACME COFFEE")).toMatchObject({
      merchantKey: "ACME COFFEE",
      processor: "SQ",
    });
    expect(clean("TST* NORTHWIND GYM").processor).toBe("TST");
    expect(clean("SP BLUEJAY STUDIO").processor).toBe("SP");
    expect(clean("SPRUCE CAFE").processor).toBeUndefined();
  });

  test("drops a leading asterisk", () => {
    expect(clean("*OAKRIDGE PARKING").merchantKey).toBe("OAKRIDGE PARKING");
  });

  test("drops an amount glued after an asterisk", () => {
    const c = clean("NORTHWIND GYM* 49.99_V");
    expect(c.merchantKey).toBe("NORTHWIND GYM");
    expect(c.removed).toContain("amount: * 49.99");
  });

  test("drops store numbers", () => {
    expect(clean("ACME COFFEE #0042").merchantKey).toBe("ACME COFFEE");
    expect(clean("ACME COFFEE STORE 12").merchantKey).toBe("ACME COFFEE");
  });

  test("drops digit runs and reference codes but keeps short numbers in names", () => {
    expect(clean("XY000 TFR-FR 0000000").merchantKey).toBe("TFR-FR");
    expect(clean("WILLOW BOOKS 0000451").merchantKey).toBe("WILLOW BOOKS");
    expect(clean("7ELEVEN").merchantKey).toBe("7ELEVEN");
    expect(clean("ROUTE 66 DINER").merchantKey).toBe("ROUTE 66 DINER");
  });

  test("drops a trailing province then city, but never the last word", () => {
    expect(clean("ACME COFFEE TORONTO ON").merchantKey).toBe("ACME COFFEE");
    expect(clean("TORONTO").merchantKey).toBe("TORONTO");
  });

  test("applies the rules in the fixed order", () => {
    const c = clean("sq *Acme Coffee #0042 Toronto ON_V");
    expect(c.removed).toEqual([
      "bank code: _V",
      "processor: SQ *",
      "store number: #0042",
      "place: ON",
      "place: TORONTO",
    ]);
  });

  test("an empty or all-noise description gives an empty key", () => {
    expect(clean("").merchantKey).toBe("");
    expect(clean("0000000_V")).toMatchObject({
      merchantKey: "",
      bankCode: "V",
    });
  });

  test("never throws and returns an upper-case, trimmed key", () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        const key = clean(s).merchantKey;
        expect(key).toBe(key.toUpperCase());
        expect(key).toBe(key.trim());
      }),
    );
  });
});
