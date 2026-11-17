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
/**
 * ADR-020: which check applies depends on what the statement carries, and `running-balance` is
 * for CSV only because it reads no anchors. A PDF statement goes to `reconcileAnchored`.
 */
export function reconcile(statement: ParsedStatement): Reconciliation {
  return statement.input === "csv"
    ? reconcileRunningBalance(statement)
    : reconcileAnchored(statement);
}

/**
 * PDF statements (ADR-020). The opening balance is the first checkpoint and each printed balance
 * is another: the rows of a segment, from after the previous checkpoint up to and including the
 * checkpoint row, must sum to the difference. That proves what was read is consistent, not that
 * all of it was read, so `verified` also needs an end anchor that does not come from the rows:
 * the printed totals or the closing balance, and every anchor the profile requires.
 *
 * Fails closed: no opening balance, no anchor, a missing required anchor, rows whose dates go
 * backwards, or any warning give `unverifiable`. A mismatch is reported even when there are
 * warnings. Limit: errors that keep a segment's sum (two amounts swapped within a day, a wrong
 * description pairing, a charge and its reversal both dropped, a wrong date) are not detected.
 */
function reconcileAnchored(statement: ParsedStatement): Reconciliation {
  const open = statement.openingBalance;
  if (open === undefined) {
    return {
      status: "unverifiable",
      reason: "the opening balance was not read",
    };
  }
  const rows = statement.transactions;
  const step = statement.kind === "credit" ? -1 : 1;
  const hasBalances = rows.some((t) => t.balanceAfter !== undefined);

  // Checkpoints: each printed balance against the previous checkpoint plus its segment.
  let checkpoint = open;
  let segment = 0;
  let net = 0;
  let withdrawals = 0;
  let deposits = 0;
  for (const t of rows) {
    segment += t.amount;
    net += t.amount;
    if (t.amount < 0) withdrawals -= t.amount;
    else deposits += t.amount;
    if (t.balanceAfter === undefined) continue;
    const expected = checkpoint + step * segment;
    if (expected !== t.balanceAfter) {
      return {
        status: "mismatch",
        expected,
        actual: t.balanceAfter,
        firstBadSource: t.source,
      };
    }
    checkpoint = t.balanceAfter;
    segment = 0;
  }

  // Anchors: figures the statement prints that are not read from the rows' own balances.
  const totals = statement.printedTotals;
  if (totals !== undefined) {
    if (totals.withdrawals !== withdrawals) {
      return {
        status: "mismatch",
        expected: withdrawals,
        actual: totals.withdrawals,
      };
    }
    if (totals.deposits !== deposits) {
      return {
        status: "mismatch",
        expected: deposits,
        actual: totals.deposits,
      };
    }
  }
  const closing = statement.closingBalance;
  if (closing !== undefined && closing !== open + step * net) {
    return { status: "mismatch", expected: open + step * net, actual: closing };
  }

  const missing = (statement.requiredAnchors ?? []).filter((a) =>
    a === "printedTotals" ? totals === undefined : closing === undefined,
  );
  if (missing.length > 0) {
    return {
      status: "unverifiable",
      reason: `a required figure was not read (${missing.join(", ")})`,
    };
  }
  if (totals === undefined && closing === undefined) {
    return {
      status: "unverifiable",
      reason:
        "the statement's printed totals and closing balance were not read, so a missing last page would go unseen",
    };
  }

  if (hasBalances) {
    const dates = rows.map((t) => t.date);
    if (dates.some((d, k) => k > 0 && (dates[k - 1] ?? d) > d)) {
      return {
        status: "unverifiable",
        reason: "rows are not in date order, so the chain cannot be checked",
      };
    }
  }
  if (statement.warnings.length > 0) {
    return {
      status: "unverifiable",
      reason: `${statement.warnings.length} part(s) of the statement could not be read, so it may be incomplete`,
    };
  }
  return {
    status: "verified",
    method: hasBalances ? "checkpoints" : "totals",
  };
}

function reconcileRunningBalance(statement: ParsedStatement): Reconciliation {
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
