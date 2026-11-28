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

  test("drops a trailing standalone number of 4+ digits only", () => {
    expect(clean("SILVERLINE TAXI 4412").merchantKey).toBe("SILVERLINE TAXI");
    expect(clean("TIDEWATER CAR WASH 1180 ON").merchantKey).toBe(
      "TIDEWATER CAR WASH",
    );
    expect(clean("CLUB 2024 GYM").merchantKey).toBe("CLUB 2024 GYM");
    expect(clean("ROUTE 66").merchantKey).toBe("ROUTE 66");
    expect(clean("4412").merchantKey).toBe("4412");
  });

  test("drops a trailing company suffix but never the last word", () => {
    expect(clean("HARBOUR FISH MARKET LTD_V").merchantKey).toBe(
      "HARBOUR FISH MARKET",
    );
    expect(clean("ACME CO").merchantKey).toBe("ACME");
    expect(clean("INC").merchantKey).toBe("INC");
    expect(clean("LTD CAFE").merchantKey).toBe("LTD CAFE");
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

describe("opaque reference suffixes", () => {
  const key = (d: string): string => clean(d).merchantKey;
  const code3 = fc.stringMatching(/^[A-Za-z0-9]{3}$/);

  test("masked e-transfer codes are cut, in and out stay apart", () => {
    expect(key("E-TRANSFER ***Ab3")).toBe("E-TRANSFER");
    expect(key("E-TRANSFER ***Zq7")).toBe("E-TRANSFER");
    expect(key("SEND E-TFR ***xY9")).toBe("SEND E-TFR");
    expect(key("SEND E-TFR ***xY9")).not.toBe(key("E-TRANSFER ***Ab3"));
  });

  test("any 3-character code gives the same e-transfer key", () => {
    fc.assert(
      fc.property(code3, code3, (a, b) => {
        expect(key(`E-TRANSFER ***${a}`)).toBe(key(`E-TRANSFER ***${b}`));
        expect(key(`SEND E-TFR ***${a}`)).toBe("SEND E-TFR");
      }),
    );
  });

  test("an opaque slash code is cut, a readable one stays", () => {
    expect(key("TRANSITCO/SW27V5HP2Z _T")).toBe("TRANSITCO");
    expect(key("TRANSITCO/SWXKQVTR9P _T")).toBe("TRANSITCO");
    expect(key("TRANSITCO/BCDFGHJKLMN")).toBe("TRANSITCO");
    expect(key("TRANSITCO")).toBe("TRANSITCO");
    expect(key("UBER CANADA/UBE")).toBe("UBER CANADA/UBE");
    expect(key("ACME/COFFEEHOUSE")).toBe("ACME/COFFEEHOUSE");
  });
});
