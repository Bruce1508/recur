import { daysBetween } from "../plainDate";
import type { Transaction } from "../types";
import { amountsStable, cadenceOfGaps } from "./cadence";
import type { BehaviourHint } from "./types";

/**
 * Behaviour per `merchantKey` from ledger transactions (ADR-021). A hint is shown beside a reading
 * and never becomes a name. `verifiedStatementIds` names the statements that reconciled as
 * verified; a hint is `verified` only when every occurrence came from one. Callers pass the rows
 * they want counted (money out, usually). Output is sorted by key and does not depend on input order.
 */
export function behaviourHints(
  transactions: readonly Transaction[],
  keyOf: (t: Transaction) => string,
  verifiedStatementIds: ReadonlySet<string>,
): BehaviourHint[] {
  const groups = new Map<string, Transaction[]>();
  for (const t of transactions) {
    const key = keyOf(t);
    if (key === "") continue;
    const rows = groups.get(key);
    if (rows) rows.push(t);
    else groups.set(key, [t]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([merchantKey, rows]) => {
      const dates = rows.map((t) => t.date).sort();
      const gaps = dates.slice(1).map((d, i) => daysBetween(dates[i] ?? d, d));
      const cadence = cadenceOfGaps(gaps);
      return {
        merchantKey,
        count: rows.length,
        ...(cadence === undefined ? {} : { cadence }),
        amountStable: amountsStable(rows.map((t) => t.amount)),
        first: dates[0] ?? "",
        last: dates[dates.length - 1] ?? "",
        verified: rows.every((t) =>
          verifiedStatementIds.has(t.source.statementId),
        ),
      };
    });
}
