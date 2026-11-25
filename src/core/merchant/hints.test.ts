import fc from "fast-check";
import { describe, expect, test } from "vitest";
import type { PlainDate, Transaction } from "../types";
import { amountsStable, cadenceOfGaps } from "./cadence";
import { behaviourHints } from "./hints";

const tx = (
  id: number,
  date: PlainDate,
  amount: number,
  statementId = "s1",
): Transaction => ({
  id: String(id),
  date,
  description: "X",
  amount,
  source: { statementId, input: "csv", row: id },
});
const key = () => "K";

describe("cadenceOfGaps", () => {
  test.each([
    [[7, 7, 8], "weekly"],
    [[14, 14, 13], "biweekly"],
    [[30, 31, 28, 30], "monthly"],
    [[90, 91], "quarterly"],
  ])("%j is %s", (gaps, cadence) => {
    expect(cadenceOfGaps(gaps)).toBe(cadence);
  });
  test("needs two gaps and mostly consistent gaps", () => {
    expect(cadenceOfGaps([30])).toBeUndefined();
    expect(cadenceOfGaps([30, 5, 60])).toBeUndefined();
    expect(cadenceOfGaps([200, 200])).toBeUndefined();
  });
});

describe("amountsStable", () => {
  test("within 7.5% or one dollar of the median", () => {
    expect(amountsStable([-1000, -1050, -990])).toBe(true);
    expect(amountsStable([-500, -590])).toBe(true);
    expect(amountsStable([-1000, -1200])).toBe(false);
    expect(amountsStable([-1000])).toBe(false);
  });
});

describe("behaviourHints", () => {
  const rows = [
    tx(1, "2026-01-05", -1499),
    tx(2, "2026-02-05", -1499),
    tx(3, "2026-03-06", -1499),
  ];

  test("count, cadence, stability and dates", () => {
    expect(behaviourHints(rows, key, new Set(["s1"]))).toEqual([
      {
        merchantKey: "K",
        count: 3,
        cadence: "monthly",
        amountStable: true,
        first: "2026-01-05",
        last: "2026-03-06",
        verified: true,
      },
    ]);
  });

  test("verified needs every occurrence from a verified statement", () => {
    const mixed = [...rows, tx(4, "2026-04-05", -1499, "s2")];
    expect(behaviourHints(mixed, key, new Set(["s1"]))[0]?.verified).toBe(
      false,
    );
  });

  test("two occurrences give no cadence; an empty key is skipped", () => {
    expect(
      behaviourHints(rows.slice(0, 2), key, new Set())[0]?.cadence,
    ).toBeUndefined();
    expect(behaviourHints(rows, () => "", new Set())).toEqual([]);
  });

  test("does not depend on input order", () => {
    fc.assert(
      fc.property(fc.shuffledSubarray(rows, { minLength: 3 }), (shuffled) => {
        expect(behaviourHints(shuffled, key, new Set(["s1"]))).toEqual(
          behaviourHints(rows, key, new Set(["s1"])),
        );
      }),
    );
  });
});
