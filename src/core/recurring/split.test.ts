import fc from "fast-check";
import { describe, expect, test } from "vitest";
import { addDays } from "../plainDate";
import type { Transaction } from "../types";
import { detectRecurring } from "./detect";
import { isSingleChargeCandidate, splitSingleCharge } from "./split";

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
const monthlyGym = ["2025-01-05", "2025-02-05", "2025-03-05", "2025-04-05"].map(
  (d) => tx(d, "GYMCLUB", -2000),
);

describe("splitSingleCharge", () => {
  test("a large one-off goes to singles, a monthly series stays in main", () => {
    const series = detectRecurring(
      [...monthlyGym, tx("2025-02-20", "FURNITURE DEPOT", -90000)],
      ctx,
    );
    const { main, singles } = splitSingleCharge(series);
    expect(main.map((s) => s.cadence)).toEqual(["monthly"]);
    expect(singles).toHaveLength(1);
    expect(singles[0]?.cadence).toBe("annual-possible");
    expect(singles[0]?.occurrences).toHaveLength(1);
  });

  test("an annual-possible series with two dated charges stays in main", () => {
    const series = detectRecurring(
      [
        tx("2024-03-01", "ANNUAL CLUB", -12000),
        tx("2025-03-01", "ANNUAL CLUB", -15000),
      ],
      ctx,
    );
    expect(series).toHaveLength(1);
    expect(series[0]?.cadence).toBe("annual-possible");
    expect(isSingleChargeCandidate(series[0] as (typeof series)[number])).toBe(
      false,
    );
    expect(splitSingleCharge(series).main).toEqual(series);
  });

  test("a confirmed yearly series stays in main", () => {
    const series = detectRecurring(
      [
        tx("2023-03-01", "DOMAIN CO", -2000),
        tx("2024-03-01", "DOMAIN CO", -2000),
        tx("2025-03-01", "DOMAIN CO", -2000),
      ],
      ctx,
    );
    expect(series[0]?.cadence).toBe("annual");
    expect(splitSingleCharge(series).singles).toEqual([]);
  });

  test("main and singles are an exact, order-preserving partition of the input", () => {
    const txs = fc.array(
      fc
        .tuple(
          fc.integer({ min: 0, max: 400 }),
          fc.constantFrom("A SHOP", "B GYM", "C CLOUD", "D FUEL", "E CLUB"),
          fc.integer({ min: -20000, max: 5000 }),
        )
        .map(([d, de, a]) => tx(addDays("2025-01-01", d), de, a)),
      { maxLength: 40 },
    );
    fc.assert(
      fc.property(txs, (list) => {
        const series = detectRecurring(list, ctx);
        const { main, singles } = splitSingleCharge(series);
        expect(main).toEqual(series.filter((s) => !isSingleChargeCandidate(s)));
        expect(singles).toEqual(series.filter(isSingleChargeCandidate));
        expect(main.length + singles.length).toBe(series.length);
      }),
    );
  });
});
