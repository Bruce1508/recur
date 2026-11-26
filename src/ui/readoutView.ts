import type { Transaction } from "../core/types";

/** Calendar months ("YYYY-MM") that hold at least one transaction, newest first. */
export function monthsOf(transactions: readonly Transaction[]): string[] {
  return [...new Set(transactions.map((t) => t.date.slice(0, 7)))]
    .sort()
    .reverse();
}

const SOURCE_LABEL = {
  user: "your label",
  brand: "brand list",
  rule: "cleaned text",
} as const;

export const sourceLabel = (s: keyof typeof SOURCE_LABEL): string =>
  SOURCE_LABEL[s];

/**
 * Statement ids that may be shown as Verified: an id counts only when every statement that uses it
 * is verified. Two files can share an id (the same CSV dropped twice) and reconcile differently,
 * so one verified copy must never vouch for the other.
 */
export function verifiedIds(
  statements: readonly { id: string; verified: boolean }[],
): Set<string> {
  const bad = new Set(statements.filter((s) => !s.verified).map((s) => s.id));
  return new Set(statements.filter((s) => !bad.has(s.id)).map((s) => s.id));
}
