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
