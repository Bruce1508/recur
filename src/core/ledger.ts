import type { ParsedStatement, PlainDate, Transaction } from "./types";

export interface Ledger {
  /** Sorted by date; rows on one date keep input order (statement order, then file order). */
  readonly transactions: readonly Transaction[];
  readonly duplicatesRemoved: number;
  /** Calendar months ("YYYY-MM") that fall entirely between two covered stretches. */
  readonly missingMonths: readonly string[];
}

const nextMonth = (ym: string): string => {
  const y = Number(ym.slice(0, 4));
  const m = Number(ym.slice(5, 7));
  return m === 12
    ? `${String(y + 1).padStart(4, "0")}-01`
    : `${String(y).padStart(4, "0")}-${String(m + 1).padStart(2, "0")}`;
};

/**
 * Merge statements into one ledger: sort by date, drop rows that appear in more than one
 * overlapping file, and report whole months with no data between files.
 *
 * Duplicates: rows are the same when date, amount, description and printed balance (if any)
 * all match. For each such row, every statement holding it counts how many copies it has and the
 * statement with the most copies supplies them (the first on a tie). Two coffees on one day in
 * one file are therefore both kept, while the same coffee in two overlapping exports is kept
 * once. The balance is part of the identity so the same charge on two different accounts, whose
 * running balances differ, is not merged.
 *
 * Limits, both visible rather than silent: the same account exported once with and once without
 * a balance column is not de-duplicated (the rows differ), and months are counted over all
 * statements together, so a gap in one account can hide behind another account's coverage.
 * Checking each file's closing balance against the next file's opening balance (which would
 * also cover the first and last rows of a file) is not done here yet.
 */
export function buildLedger(statements: readonly ParsedStatement[]): Ledger {
  // row identity -> statement index -> that statement's copies, in input order
  const groups = new Map<
    string,
    Map<number, { pos: number; t: Transaction }[]>
  >();
  let pos = 0;
  for (const [si, s] of statements.entries()) {
    for (const t of s.transactions) {
      const key = JSON.stringify([
        t.date,
        t.amount,
        t.description,
        t.balanceAfter ?? null,
      ]);
      const perStatement = groups.get(key) ?? new Map();
      const copies = perStatement.get(si) ?? [];
      copies.push({ pos: pos++, t });
      perStatement.set(si, copies);
      groups.set(key, perStatement);
    }
  }

  const kept: { pos: number; t: Transaction }[] = [];
  for (const perStatement of groups.values()) {
    let best: { pos: number; t: Transaction }[] = [];
    for (const copies of perStatement.values()) {
      if (copies.length > best.length) best = copies; // strict: the first statement wins a tie
    }
    kept.push(...best);
  }
  kept.sort((a, b) =>
    a.t.date === b.t.date ? a.pos - b.pos : a.t.date < b.t.date ? -1 : 1,
  );

  return {
    transactions: kept.map((k) => k.t),
    duplicatesRemoved: pos - kept.length,
    missingMonths: missingMonths(statements),
  };
}

function missingMonths(statements: readonly ParsedStatement[]): string[] {
  const spans = statements
    .filter((s) => s.transactions.length > 0)
    .map((s) => s.period)
    .sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));

  const months: string[] = [];
  let end: PlainDate | undefined;
  for (const span of spans) {
    if (end !== undefined) {
      // Months strictly between the month of `end` and the month of `span.start`.
      for (
        let m = nextMonth(end.slice(0, 7));
        m < span.start.slice(0, 7);
        m = nextMonth(m)
      ) {
        months.push(m);
      }
    }
    if (end === undefined || span.end > end) end = span.end;
  }
  return months;
}
