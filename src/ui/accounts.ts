import { buildLedger } from "../core/ledger";
import type { ParsedStatement, Transaction } from "../core/types";

export interface ImportedFile {
  readonly name: string;
  /** A CSV has no account id, so the user says which account a file belongs to. */
  readonly account: string;
  readonly statement: ParsedStatement;
}

export interface Summary {
  readonly accounts: readonly {
    readonly id: string;
    readonly missingMonths: readonly string[];
  }[];
  /** All accounts, sorted by date. */
  readonly transactions: readonly Transaction[];
  readonly duplicatesRemoved: number;
}

/**
 * Group files by account and build one ledger per account: overlapping exports of one account
 * are de-duplicated and gaps are reported, while an identical charge in two accounts is kept
 * twice (buildLedger cannot tell two same-kind accounts apart on its own).
 */
export function summarize(files: readonly ImportedFile[]): Summary {
  const byAccount = new Map<string, ParsedStatement[]>();
  for (const f of files) {
    byAccount.set(f.account, [
      ...(byAccount.get(f.account) ?? []),
      f.statement,
    ]);
  }
  const accounts: { id: string; missingMonths: readonly string[] }[] = [];
  const transactions: Transaction[] = [];
  let duplicatesRemoved = 0;
  for (const [id, statements] of [...byAccount].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    const ledger = buildLedger(statements);
    accounts.push({ id, missingMonths: ledger.missingMonths });
    transactions.push(...ledger.transactions);
    duplicatesRemoved += ledger.duplicatesRemoved;
  }
  // Array.prototype.sort is stable: same-day rows keep account, then ledger order.
  transactions.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return {
    accounts,
    transactions,
    duplicatesRemoved,
  };
}
