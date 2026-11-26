import fc from "fast-check";
import { describe, expect, test } from "vitest";
import type { Transaction } from "../types";
import { DEMO_ALIASES } from "./aliases";
import { buildReadout } from "./readout";

const ctx = { brands: DEMO_ALIASES };
let n = 0;
const tx = (
  date: string,
  description: string,
  amount: number,
  statementId = "s1",
): Transaction => ({
  id: `t${n++}`,
  date,
  description,
  amount,
  source: { statementId, input: "csv", row: n },
});
const ok = new Set(["s1"]);

describe("buildReadout", () => {
  const rows = [
    tx("2025-01-05", "ACME COFFEE #1_V", -450),
    tx("2025-02-05", "ACME COFFEE #2_V", -450),
    tx("2025-02-10", "NORTHWIND GYM* 49.99_V", -4999),
    tx("2025-02-11", "XQZ 12345", -700),
    tx("2025-02-12", "PAY ACME", 100000),
    tx("2025-02-13", "ZERO ROW", 0),
  ];
  const r = buildReadout(rows, ctx, ok, "2025-02");

  test("groups by reading name, unknown is its own group", () => {
    expect(r.groups.map((g) => [g.name, g.moneyOut, g.count])).toEqual([
      ["Northwind Gym", 4999, 1],
      ["Acme Coffee", 900, 2],
      ["Pay Acme", 0, 1],
      ["Zero Row", 0, 1],
    ]);
    expect(r.unknown).toMatchObject({ name: null, moneyOut: 700, count: 1 });
  });

  test("totals are the ledger's money out and money in", () => {
    expect(r.moneyOut).toBe(450 + 450 + 4999 + 700);
    expect(r.moneyIn).toBe(100000);
  });

  test("new names are those first seen in the period", () => {
    expect(r.newNames).toEqual(["Northwind Gym", "Pay Acme", "Zero Row"]);
  });

  test("a status other than verified is carried to the group", () => {
    const mixed = buildReadout(
      [tx("2025-02-01", "ACME COFFEE", -100, "bad")],
      ctx,
      ok,
      "2025-02",
    );
    expect(mixed.groups[0]?.verified).toBe(false);
    expect(r.groups.every((g) => g.verified)).toBe(true);
  });

  test("each group lists its distinct cleaned descriptions, never an empty one", () => {
    expect(r.groups.find((g) => g.name === "Acme Coffee")?.keys).toEqual([
      "ACME COFFEE",
    ]);
    expect(r.unknown.keys).toEqual(["XQZ"]);
    const blank = buildReadout([tx("2025-02-01", "", -5)], ctx, ok, "2025-02");
    expect(blank.unknown.keys).toEqual([]);
  });

  test("a user label wins and merges with a brand of the same name", () => {
    const labelled = buildReadout(
      [tx("2025-02-01", "ACME COFFEE", -100), tx("2025-02-02", "ZZ SHOP", -50)],
      { brands: DEMO_ALIASES, labels: new Map([["ZZ SHOP", "Acme Coffee"]]) },
      ok,
      "2025-02",
    );
    expect(labelled.groups).toHaveLength(1);
    expect(labelled.groups[0]).toMatchObject({
      name: "Acme Coffee",
      moneyOut: 150,
      count: 2,
      sources: ["brand", "user"],
    });
  });
});

describe("unusual", () => {
  const history = [
    tx("2025-01-01", "STREAMLY", -1000),
    tx("2025-02-01", "STREAMLY", -1000),
  ];
  test("outside 7.5% and 1.00 of the median of two earlier lines", () => {
    const hi = tx("2025-03-01", "STREAMLY", -1500);
    const r = buildReadout([...history, hi], ctx, ok, "2025-03");
    expect(r.unusual).toEqual([hi.id]);
  });
  test("inside the tolerance, or with fewer than two earlier lines, is not flagged", () => {
    const near = tx("2025-03-01", "STREAMLY", -1090);
    expect(
      buildReadout([...history, near], ctx, ok, "2025-03").unusual,
    ).toEqual([]);
    const lone = tx("2025-03-01", "STREAMLY", -9000);
    expect(
      buildReadout([history[1] as Transaction, lone], ctx, ok, "2025-03")
        .unusual,
    ).toEqual([]);
  });
  test("earlier means before the line's own date, and only the period is flagged", () => {
    const old = tx("2025-02-15", "STREAMLY", -9000);
    expect(buildReadout([...history, old], ctx, ok, "2025-03").unusual).toEqual(
      [],
    );
  });
});

const amount = fc.integer({ min: -500_000, max: 500_000 });
const desc = fc.constantFrom(
  "ACME COFFEE #1_V",
  "NORTHWIND GYM* 9.99_V",
  "XQZ 12345",
  "STREAMLY",
  "PAY ACME",
  "",
);
const date = fc
  .integer({ min: 1, max: 90 })
  .map((d) => new Date(Date.UTC(2025, 0, d)).toISOString().slice(0, 10));
const txs = fc.array(
  fc
    .tuple(date, desc, amount, fc.constantFrom("s1", "s2"))
    .map(([d, de, a, s]) => tx(d, de, a, s)),
  { maxLength: 30 },
);

describe("properties", () => {
  test("groups and unknown partition the money to the cent", () => {
    fc.assert(
      fc.property(txs, (list) => {
        const r = buildReadout(list, ctx, ok, "2025-02");
        const all = [...r.groups, r.unknown];
        const out = list
          .filter((t) => t.amount < 0)
          .reduce((s, t) => s - t.amount, 0);
        const inn = list
          .filter((t) => t.amount > 0)
          .reduce((s, t) => s + t.amount, 0);
        expect(all.reduce((s, g) => s + g.moneyOut, 0)).toBe(out);
        expect(all.reduce((s, g) => s + g.moneyIn, 0)).toBe(inn);
        expect(r.moneyOut).toBe(out);
        expect(r.moneyIn).toBe(inn);
        expect(all.reduce((s, g) => s + g.count, 0)).toBe(list.length);
      }),
    );
  });
  test("the result does not depend on input order", () => {
    fc.assert(
      fc.property(txs, (list) => {
        const a = buildReadout(list, ctx, ok, "2025-02");
        const b = buildReadout([...list].reverse(), ctx, ok, "2025-02");
        expect(b).toEqual(a);
      }),
    );
  });
  test("an unknown group never carries a name", () => {
    fc.assert(
      fc.property(txs, (list) => {
        const r = buildReadout(list, ctx, ok, "2025-02");
        expect(r.unknown.name).toBeNull();
        expect(r.groups.every((g) => g.name !== null)).toBe(true);
      }),
    );
  });
});
