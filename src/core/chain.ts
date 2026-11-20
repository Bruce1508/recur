import { daysBetween } from "./plainDate";
import { reconcile } from "./reconcile";
import type { Cents, ParsedStatement } from "./types";

export type BoundaryOutcome =
  | { readonly status: "chained" }
  | {
      readonly status: "gap" | "mismatch";
      readonly expected: Cents;
      readonly actual: Cents;
    }
  | { readonly status: "unchainable"; readonly reason: string };

export interface Boundary {
  /** Statement ids; `before` is the earlier period. */
  readonly before: string;
  readonly after: string;
  readonly outcome: BoundaryOutcome;
}

export interface AccountChain {
  /** In period order. */
  readonly boundaries: readonly Boundary[];
  /** Per statement id: whether its start and end are covered, by its own anchors or a chained neighbour. */
  readonly ends: Readonly<
    Record<string, { readonly start: boolean; readonly end: boolean }>
  >;
}

interface Ends {
  opening: Cents;
  closing: Cents;
}

const stepOf = (s: ParsedStatement) => (s.kind === "credit" ? -1 : 1);

/** ADR-025: a statement's opening and closing balance, only from a verified statement; else the reason there are none. */
function endsOf(s: ParsedStatement): Ends | string {
  if (reconcile(s).status !== "verified") return "it is not verified";
  const step = stepOf(s);
  if (s.input === "pdf") {
    if (s.openingBalance === undefined) return "no opening balance was read";
    const net = s.transactions.reduce((n, t) => n + t.amount, 0);
    return {
      opening: s.openingBalance,
      closing: s.openingBalance + step * net,
    };
  }
  const dates = s.transactions.map((t) => t.date);
  const first = dates[0];
  const last = dates[dates.length - 1];
  if (first === undefined || last === undefined || first === last) {
    return "every row has the same date, so the order of its rows is unknown";
  }
  const rows = first < last ? s.transactions : [...s.transactions].reverse();
  const head = rows[0];
  const tail = rows[rows.length - 1];
  if (head?.balanceAfter === undefined || tail?.balanceAfter === undefined) {
    return "its first or last row has no balance";
  }
  return {
    opening: head.balanceAfter - step * head.amount,
    closing: tail.balanceAfter,
  };
}

const knownBank = (s: ParsedStatement) => s.bankId !== "unknown";

function judge(
  prev: ParsedStatement,
  next: ParsedStatement,
  a: Ends | string,
  b: Ends | string,
): BoundaryOutcome {
  if (
    prev.kind !== next.kind ||
    (knownBank(prev) && knownBank(next) && prev.bankId !== next.bankId)
  ) {
    return {
      status: "unchainable",
      reason: "the statements are of different account kinds or banks",
    };
  }
  if (typeof a === "string") {
    return { status: "unchainable", reason: `${prev.id}: ${a}` };
  }
  if (typeof b === "string") {
    return { status: "unchainable", reason: `${next.id}: ${b}` };
  }
  const shared = next.period.start === prev.period.end;
  if (
    next.period.start < prev.period.end ||
    (shared && (prev.input === "csv" || next.input === "csv"))
  ) {
    return { status: "unchainable", reason: "the periods overlap" };
  }
  if (a.closing === b.opening) return { status: "chained" };
  const gap = daysBetween(prev.period.end, next.period.start) > 1;
  return {
    status: gap ? "gap" : "mismatch",
    expected: a.closing,
    actual: b.opening,
  };
}

/**
 * ADR-025: check each statement's closing balance against the next one's opening balance, for the
 * statements of one account (any order; the caller groups by account). Pure. Statements with the
 * same id count once. A boundary never changes a statement's own reconciliation.
 */
export function chainStatements(
  statements: readonly ParsedStatement[],
): AccountChain {
  const seen = new Set<string>();
  const sorted = statements
    .filter((s) => !seen.has(s.id) && seen.add(s.id))
    .sort(
      (x, y) =>
        x.period.start.localeCompare(y.period.start) ||
        x.period.end.localeCompare(y.period.end) ||
        x.id.localeCompare(y.id),
    );
  const ends = new Map(sorted.map((s) => [s.id, endsOf(s)] as const));
  const covered: Record<string, { start: boolean; end: boolean }> = {};
  for (const s of sorted) {
    const own = s.input === "pdf" && typeof ends.get(s.id) !== "string";
    covered[s.id] = { start: own, end: own };
  }

  const boundaries: Boundary[] = [];
  let prev = sorted[0];
  for (const next of sorted.slice(1)) {
    if (prev === undefined) break;
    const a = ends.get(prev.id) ?? "no ends";
    const b = ends.get(next.id) ?? "no ends";
    const outcome = judge(prev, next, a, b);
    boundaries.push({ before: prev.id, after: next.id, outcome });
    if (outcome.status === "chained") {
      const p = covered[prev.id];
      const n = covered[next.id];
      if (p && prev.input === "csv") p.end = true;
      if (n && next.input === "csv") n.start = true;
    }
    if (next.period.end >= prev.period.end) prev = next;
  }
  return { boundaries, ends: covered };
}
