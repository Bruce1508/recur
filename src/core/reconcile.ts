import type { Cents, ParsedStatement, Reconciliation } from "./types";

type Point = { amount: Cents; balance: Cents; row: number | undefined };
type Failure = { index: number; expected: Cents; actual: Cents };

/**
 * Check every printed balance against the one before it (running-balance method).
 *
 * The file may list rows oldest-first or newest-first, and several rows can share a date. The
 * direction comes from the dates (rising: oldest-first, falling: newest-first). If every date is
 * the same the order is unknowable, so both are tried and the reading with fewer broken steps is
 * used; an altered last-in-time row can then go unseen. Dates in no order give `unverifiable`.
 * The balance of a credit account is the amount
 * owed, so a purchase (negative amount) raises it.
 *
 * Fails closed: no balances, one row, or rows that were skipped while converting give
 * `unverifiable`, never `verified`.
 *
 * Limit, by construction: a single file has no opening balance, so the first row's own amount
 * and a row removed from either end of the file are not covered by any step. Chaining files in
 * `ledger` (the closing balance of one against the next) is what covers the ends.
 */
export function reconcile(statement: ParsedStatement): Reconciliation {
  const points: Point[] = [];
  for (const t of statement.transactions) {
    if (t.balanceAfter !== undefined) {
      points.push({
        amount: t.amount,
        balance: t.balanceAfter,
        row: t.source.input === "csv" ? t.source.row : undefined,
      });
    }
  }
  if (points.length === 0) {
    return { status: "unverifiable", reason: "this file has no balances" };
  }
  if (points.length < statement.transactions.length) {
    return {
      status: "unverifiable",
      reason: "some rows have no balance, so the chain cannot be checked",
    };
  }
  if (points.length < 2) {
    return {
      status: "unverifiable",
      reason: "at least two rows with balances are needed",
    };
  }

  const dates = statement.transactions.map((t) => t.date);
  const ascending = dates.every((d, k) => k === 0 || (dates[k - 1] ?? d) <= d);
  const descending = dates.every((d, k) => k === 0 || (dates[k - 1] ?? d) >= d);
  if (!ascending && !descending) {
    return {
      status: "unverifiable",
      reason: "rows are not in date order, so the chain cannot be checked",
    };
  }

  const step = statement.kind === "credit" ? -1 : 1;
  // Steps where the printed balance does not follow from its neighbour. `index` is the
  // later-in-time transaction of the pair; `expected` and `actual` are that row's balance.
  const oldestFirst: Failure[] = [];
  const newestFirst: Failure[] = [];
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const cur = points[i];
    if (prev === undefined || cur === undefined) continue;
    const expectedOld = prev.balance + step * cur.amount;
    if (expectedOld !== cur.balance) {
      oldestFirst.push({
        index: i,
        expected: expectedOld,
        actual: cur.balance,
      });
    }
    const expectedNew = cur.balance + step * prev.amount;
    if (expectedNew !== prev.balance) {
      newestFirst.push({
        index: i - 1,
        expected: expectedNew,
        actual: prev.balance,
      });
    }
  }

  // Dates decide the direction. Only when every date is the same is the order unknowable, and
  // then the reading with fewer broken steps is used (oldest-first on a tie).
  let failures: Failure[];
  if (ascending && descending) {
    failures =
      oldestFirst.length <= newestFirst.length ? oldestFirst : newestFirst;
  } else {
    failures = ascending ? oldestFirst : newestFirst;
  }
  const first = failures[0];
  if (first !== undefined) {
    const row = points[first.index]?.row;
    return {
      status: "mismatch",
      expected: first.expected,
      actual: first.actual,
      ...(row === undefined ? {} : { firstBadRow: row }),
    };
  }

  if (statement.warnings.length > 0) {
    return {
      status: "unverifiable",
      reason: `${statement.warnings.length} row(s) could not be read, so the file may be incomplete`,
    };
  }
  return { status: "verified", method: "running-balance" };
}
