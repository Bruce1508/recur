import { expect, test } from "vitest";
import type { ParsedStatement, Transaction } from "../core/types";
import { summarize } from "./accounts";

function tx(
  statementId: string,
  row: number,
  date: string,
  amount: number,
): Transaction {
  return {
    id: `${statementId}:${row}`,
    date,
    description: "COFFEE",
    amount,
    source: { statementId, input: "csv", row },
  };
}

function stmt(id: string, rows: Transaction[]): ParsedStatement {
  return {
    id,
    input: "csv",
    bankId: "unknown",
    kind: "deposit",
    period: { start: rows[0]?.date ?? "", end: rows.at(-1)?.date ?? "" },
    transactions: rows,
    warnings: [],
  };
}

test("two accounts with an identical same-day charge keep both rows", () => {
  const a = stmt("a", [tx("a", 1, "2025-01-05", -450)]);
  const b = stmt("b", [tx("b", 1, "2025-01-05", -450)]);
  const s = summarize([
    { name: "a.csv", account: "A", statement: a },
    { name: "b.csv", account: "B", statement: b },
  ]);
  expect(s.transactions).toHaveLength(2);
  expect(s.duplicatesRemoved).toBe(0);
});

test("overlapping files in the same account are de-duplicated", () => {
  const a = stmt("a", [
    tx("a", 1, "2025-01-05", -450),
    tx("a", 2, "2025-01-06", -100),
  ]);
  const b = stmt("b", [
    tx("b", 1, "2025-01-06", -100),
    tx("b", 2, "2025-01-07", -200),
  ]);
  const s = summarize([
    { name: "a.csv", account: "A", statement: a },
    { name: "b.csv", account: "A", statement: b },
  ]);
  expect(s.transactions).toHaveLength(3);
  expect(s.duplicatesRemoved).toBe(1);
});

test("missing months are reported per account", () => {
  const a = stmt("a", [tx("a", 1, "2025-01-05", -450)]);
  const b = stmt("b", [tx("b", 1, "2025-04-05", -450)]);
  const c = stmt("c", [tx("c", 1, "2025-02-05", -450)]);
  const s = summarize([
    { name: "a.csv", account: "A", statement: a },
    { name: "b.csv", account: "A", statement: b },
    { name: "c.csv", account: "B", statement: c },
  ]);
  const accA = s.accounts.find((x) => x.id === "A");
  expect(accA?.missingMonths).toEqual(["2025-02", "2025-03"]);
  expect(s.accounts.find((x) => x.id === "B")?.missingMonths).toEqual([]);
});

test("merged transactions are sorted by date across accounts", () => {
  const a = stmt("a", [tx("a", 1, "2025-03-05", -1)]);
  const b = stmt("b", [tx("b", 1, "2025-01-05", -2)]);
  const s = summarize([
    { name: "a.csv", account: "A", statement: a },
    { name: "b.csv", account: "B", statement: b },
  ]);
  expect(s.transactions.map((t) => t.date)).toEqual([
    "2025-01-05",
    "2025-03-05",
  ]);
});
