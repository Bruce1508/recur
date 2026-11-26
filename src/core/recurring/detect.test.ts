import fc from "fast-check";
import { describe, expect, test } from "vitest";
import { addDays, addMonths } from "../plainDate";
import type { Transaction } from "../types";
import { annualHistoryNote, detectRecurring } from "./detect";

let n = 0;
const tx = (
  date: string,
  description: string,
  amount: number,
): Transaction => ({
  id: `t${n++}`,
  date,
  description,
  amount,
  source: { statementId: "s", input: "csv", row: n },
});
const ctx = { brands: [] };
const monthly = (desc: string, amounts: number[], start = "2025-01-10") =>
  amounts.map((a, i) => tx(addMonths(start, i), desc, a));
const every = (
  days: number,
  desc: string,
  count: number,
  amount: number,
  start = "2025-01-03",
) =>
  Array.from({ length: count }, (_, i) =>
    tx(addDays(start, i * days), desc, amount),
  );
const only = (list: Transaction[]) => {
  const r = detectRecurring(list, ctx);
  expect(r).toHaveLength(1);
  return r[0] as (typeof r)[number];
};

describe("cadence", () => {
  test("monthly fixed charge: high confidence, next date a month on", () => {
    const s = only(monthly("STREAMLY", [-1699, -1699, -1699, -1699]));
    expect(s).toMatchObject({
      cadence: "monthly",
      amountKind: "fixed",
      typicalAmount: 1699,
      monthlyEquivalent: 1699,
      confidence: "high",
      nextExpected: "2025-05-10",
      ambiguous: false,
    });
    expect(s.occurrences).toHaveLength(4);
  });
  test.each([
    [7, "weekly", 5, 1083],
    [14, "biweekly", 4, 1083],
    [91, "quarterly", 3, 333],
  ] as const)("every %i days is %s", (days, cadence, count, monthlyEq) => {
    const s = only(
      every(days, "CLASS PASS", count, cadence === "quarterly" ? -1000 : -250),
    );
    expect(s.cadence).toBe(cadence);
    if (cadence === "weekly") expect(s.monthlyEquivalent).toBe(1083);
    if (cadence === "biweekly") expect(s.monthlyEquivalent).toBe(542);
    if (cadence === "quarterly") expect(s.monthlyEquivalent).toBe(333);
    expect(monthlyEq).toBeGreaterThan(0);
  });
  test("a missed month does not hide a monthly series", () => {
    const list = [
      tx("2025-01-10", "GYM", -4500),
      tx("2025-02-10", "GYM", -4500),
      tx("2025-04-10", "GYM", -4500),
      tx("2025-05-10", "GYM", -4500),
      tx("2025-06-10", "GYM", -4500),
    ];
    expect(only(list).cadence).toBe("monthly");
  });
  test("irregular visits are not a series", () => {
    const days = [
      "2025-01-02",
      "2025-01-09",
      "2025-01-11",
      "2025-01-30",
      "2025-02-14",
      "2025-02-15",
    ];
    expect(
      detectRecurring(
        days.map((d) => tx(d, "CORNER CAFE", -450)),
        ctx,
      ),
    ).toEqual([]);
  });
});

describe("occurrence counts", () => {
  test("two steady charges a month apart are a low-confidence possible series", () => {
    const s = only(monthly("GYM", [-4500, -4500]));
    expect(s.confidence).toBe("low");
  });
  test("two charges with different amounts, or one charge, give nothing", () => {
    expect(detectRecurring(monthly("SHOP", [-4500, -9000]), ctx)).toEqual([]);
    expect(detectRecurring(monthly("SHOP", [-4500]), ctx)).toEqual([]);
  });
  test("money in, transfers and payments are not charges", () => {
    expect(
      detectRecurring(monthly("PAYROLL", [100000, 100000, 100000]), ctx),
    ).toEqual([]);
    expect(
      detectRecurring(monthly("E-TRANSFER SENT", [-5000, -5000, -5000]), ctx),
    ).toEqual([]);
    expect(
      detectRecurring(
        monthly("CREDIT CARD PAYMENT", [-5000, -5000, -5000]),
        ctx,
      ),
    ).toEqual([]);
  });
  test("two charges on one day count once", () => {
    const list = [
      tx("2025-01-10", "GYM", -2000),
      tx("2025-01-10", "GYM", -2500),
      ...monthly("GYM", [-4500, -4500], "2025-02-10"),
    ];
    const s = only(list);
    expect(s.occurrences).toHaveLength(4);
    expect(s.cadence).toBe("monthly");
  });
});

describe("amounts", () => {
  test("a sustained step is a price change", () => {
    const s = only(
      monthly("IRON GYM", [-4500, -4500, -4500, -4900, -4900, -4900]),
    );
    expect(s.priceChange).toEqual({
      from: 4500,
      to: 4900,
      since: "2025-04-10",
    });
    expect(s.typicalAmount).toBe(4900);
    expect(s.amountKind).toBe("fixed");
  });
  test("one odd amount is not a price change", () => {
    const s = only(monthly("IRON GYM", [-4500, -4500, -6000, -4500, -4500]));
    expect(s.priceChange).toBeUndefined();
  });
  test("a steady date with swinging amounts is a variable bill", () => {
    const s = only(
      monthly("CITY HYDRO", [-6000, -9500, -14000, -7000, -12000]),
    );
    expect(s.amountKind).toBe("variable");
    expect(s.confidence).not.toBe("high");
  });
});

describe("annual", () => {
  test("two charges about a year apart with the same amount", () => {
    const s = only([
      tx("2024-03-05", "DOMAINS INC", -2500),
      tx("2025-03-06", "DOMAINS INC", -2500),
    ]);
    expect(s).toMatchObject({
      cadence: "annual",
      monthlyEquivalent: 208,
      nextExpected: "2026-03-06",
    });
  });
  test("one large charge is only possible; a small one is nothing", () => {
    expect(only([tx("2025-03-05", "BIG PLAN", -12000)]).cadence).toBe(
      "annual-possible",
    );
    expect(detectRecurring([tx("2025-03-05", "SNACK", -450)], ctx)).toEqual([]);
  });
  test("the note says when history is too short to see a yearly charge", () => {
    expect(
      annualHistoryNote([tx("2025-01-01", "A", -1), tx("2025-06-01", "A", -1)]),
    ).toMatch(/13 months/);
    expect(
      annualHistoryNote([tx("2024-01-01", "A", -1), tx("2025-03-01", "A", -1)]),
    ).toBeUndefined();
  });
});

describe("naming", () => {
  test("a brand or label gives the display name; app stores are ambiguous", () => {
    const brands = [{ name: "Streamly", match: ["STREAMLY"] }];
    const r = detectRecurring(monthly("STREAMLY #12", [-1699, -1699, -1699]), {
      brands,
    });
    expect(r[0]?.displayName).toBe("Streamly");
    expect(
      only(monthly("APPLE COM BILL", [-1299, -1299, -1299])).ambiguous,
    ).toBe(true);
  });
});

describe("properties", () => {
  const descs = ["A SHOP", "B GYM", "C CLOUD", "D FUEL"];
  const txs = fc.array(
    fc
      .tuple(
        fc.integer({ min: 0, max: 400 }),
        fc.constantFrom(...descs),
        fc.integer({ min: -20000, max: 5000 }),
      )
      .map(([d, de, a]) => tx(addDays("2025-01-01", d), de, a)),
    { maxLength: 40 },
  );
  test("independent of input order", () => {
    fc.assert(
      fc.property(txs, (list) => {
        expect(detectRecurring([...list].reverse(), ctx)).toEqual(
          detectRecurring(list, ctx),
        );
      }),
    );
  });
  test("every series has at least one occurrence of money out and fewer than two gives only annual-possible", () => {
    fc.assert(
      fc.property(txs, (list) => {
        for (const s of detectRecurring(list, ctx)) {
          expect(s.occurrences.every((t) => t.amount < 0)).toBe(true);
          const days = new Set(s.occurrences.map((t) => t.date)).size;
          if (days < 2) expect(s.cadence).toBe("annual-possible");
        }
      }),
    );
  });
});
