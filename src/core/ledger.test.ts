import { describe, expect, test } from "vitest";
import { buildLedger } from "./ledger";
import type { Cents, ParsedStatement, Transaction } from "./types";

type Row = {
  date: string;
  amount: Cents;
  description?: string;
  balance?: Cents;
};

function statement(id: string, rows: Row[]): ParsedStatement {
  const transactions: Transaction[] = rows.map((r, i) => ({
    id: `${id}:${i + 1}`,
    date: r.date,
    description: r.description ?? "X",
    amount: r.amount,
    ...(r.balance === undefined ? {} : { balanceAfter: r.balance }),
    source: { statementId: id, input: "csv", row: i + 1 },
  }));
  const dates = rows.map((r) => r.date).sort();
  return {
    id,
    input: "csv",
    bankId: "unknown",
    kind: "deposit",
    period: { start: dates[0] ?? "", end: dates[dates.length - 1] ?? "" },
    transactions,
    warnings: [],
  };
}

const summary = (txs: readonly Transaction[]) =>
  txs.map((t) => [t.date, t.amount, t.description]);

describe("buildLedger: merge and sort", () => {
  test("empty input", () => {
    expect(buildLedger([])).toEqual({
      transactions: [],
      duplicatesRemoved: 0,
      missingMonths: [],
    });
  });

  test("two disjoint statements merge into one date-sorted list", () => {
    const a = statement("a", [
      { date: "2026-02-10", amount: -200 },
      { date: "2026-01-05", amount: -100 },
    ]);
    const b = statement("b", [{ date: "2026-03-01", amount: -300 }]);
    const l = buildLedger([b, a]);
    expect(l.transactions.map((t) => t.date)).toEqual([
      "2026-01-05",
      "2026-02-10",
      "2026-03-01",
    ]);
    expect(l.duplicatesRemoved).toBe(0);
  });

  test("same-day rows keep their input order (statement order, then file order)", () => {
    const a = statement("a", [
      { date: "2026-01-05", amount: -1, description: "FIRST" },
      { date: "2026-01-05", amount: -2, description: "SECOND" },
    ]);
    const b = statement("b", [
      { date: "2026-01-05", amount: -3, description: "THIRD" },
    ]);
    expect(buildLedger([a, b]).transactions.map((t) => t.description)).toEqual([
      "FIRST",
      "SECOND",
      "THIRD",
    ]);
  });
});

describe("buildLedger: duplicates from overlapping files", () => {
  const jan = [
    { date: "2026-01-05", amount: -100, description: "A", balance: 900 },
    { date: "2026-01-20", amount: -200, description: "B", balance: 700 },
  ];
  const feb = [
    { date: "2026-01-20", amount: -200, description: "B", balance: 700 }, // overlap
    { date: "2026-02-03", amount: -50, description: "C", balance: 650 },
  ];

  test("an overlapping row is kept once, from the first statement", () => {
    const l = buildLedger([statement("jan", jan), statement("feb", feb)]);
    expect(summary(l.transactions)).toEqual([
      ["2026-01-05", -100, "A"],
      ["2026-01-20", -200, "B"],
      ["2026-02-03", -50, "C"],
    ]);
    expect(l.duplicatesRemoved).toBe(1);
    expect(l.transactions[1]?.id).toBe("jan:2");
  });

  test("the result does not depend on the order the files are given", () => {
    const x = buildLedger([statement("jan", jan), statement("feb", feb)]);
    const y = buildLedger([statement("feb", feb), statement("jan", jan)]);
    expect(summary(y.transactions)).toEqual(summary(x.transactions));
    expect(y.duplicatesRemoved).toBe(x.duplicatesRemoved);
  });

  test("importing the same file twice adds nothing", () => {
    const l = buildLedger([statement("jan", jan), statement("jan", jan)]);
    expect(l.transactions).toHaveLength(2);
    expect(l.duplicatesRemoved).toBe(2);
  });

  test("identical rows inside one file are real and are kept (no balances)", () => {
    const two = [
      { date: "2026-01-05", amount: -450, description: "COFFEE" },
      { date: "2026-01-05", amount: -450, description: "COFFEE" },
    ];
    expect(buildLedger([statement("a", two)]).transactions).toHaveLength(2);
  });

  test("a second file that repeats only part of a same-day group does not add or lose rows", () => {
    const both = [
      { date: "2026-01-05", amount: -450, description: "COFFEE" },
      { date: "2026-01-05", amount: -450, description: "COFFEE" },
    ];
    const one = [{ date: "2026-01-05", amount: -450, description: "COFFEE" }];
    const l = buildLedger([statement("short", one), statement("full", both)]);
    expect(l.transactions).toHaveLength(2);
    expect(l.duplicatesRemoved).toBe(1);
    // The group with the most rows wins, so no real row is lost.
    expect(l.transactions.every((t) => t.id.startsWith("full:"))).toBe(true);
  });

  test("rows that differ in date, amount or description are not duplicates", () => {
    const a = statement("a", [{ date: "2026-01-05", amount: -100 }]);
    for (const other of [
      { date: "2026-01-06", amount: -100 },
      { date: "2026-01-05", amount: -101 },
      { date: "2026-01-05", amount: -100, description: "Y" },
    ]) {
      expect(
        buildLedger([a, statement("b", [other])]).transactions,
      ).toHaveLength(2);
    }
  });

  test("the same row from two accounts is kept when their running balances differ", () => {
    const chequing = statement("chq", [
      {
        date: "2026-01-05",
        amount: -1699,
        description: "NETFLIX",
        balance: 50000,
      },
    ]);
    const card = statement("card", [
      {
        date: "2026-01-05",
        amount: -1699,
        description: "NETFLIX",
        balance: 1699,
      },
    ]);
    expect(buildLedger([chequing, card]).transactions).toHaveLength(2);
  });

  test("known limit: the same account exported with and without a balance column is not de-duplicated", () => {
    const withBalance = statement("a", [
      { date: "2026-01-05", amount: -100, balance: 900 },
    ]);
    const without = statement("b", [{ date: "2026-01-05", amount: -100 }]);
    expect(buildLedger([withBalance, without]).transactions).toHaveLength(2);
  });
});

describe("buildLedger: missing months", () => {
  const at = (id: string, ...dates: string[]) =>
    statement(
      id,
      dates.map((date) => ({ date, amount: -1 })),
    );

  test("adjacent and overlapping coverage has no gap", () => {
    const l = buildLedger([
      at("a", "2026-01-05", "2026-01-31"),
      at("b", "2026-02-01", "2026-02-20"),
      at("c", "2026-02-15", "2026-03-10"),
    ]);
    expect(l.missingMonths).toEqual([]);
  });

  test("a whole calendar month between two files is reported", () => {
    const l = buildLedger([
      at("a", "2026-01-05", "2026-01-31"),
      at("b", "2026-03-01", "2026-03-20"),
    ]);
    expect(l.missingMonths).toEqual(["2026-02"]);
  });

  test("several months, in order, across a year boundary, whatever the input order", () => {
    const l = buildLedger([
      at("b", "2026-03-02"),
      at("a", "2025-11-10", "2025-11-30"),
    ]);
    expect(l.missingMonths).toEqual(["2025-12", "2026-01", "2026-02"]);
  });

  test("a long file does not hide a gap between two others", () => {
    const l = buildLedger([
      at("long", "2026-01-01", "2026-06-30"),
      at("early", "2025-10-01", "2025-10-31"),
      at("late", "2026-08-05"),
    ]);
    expect(l.missingMonths).toEqual(["2025-11", "2025-12", "2026-07"]);
  });

  test("a statement with no rows has no coverage and is ignored", () => {
    const empty = { ...at("e", "2026-01-01"), transactions: [] };
    expect(buildLedger([empty]).missingMonths).toEqual([]);
  });
});
