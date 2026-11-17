import type { AccountKind, ParsedStatement } from "../types";

/**
 * One PDF statement format, as data (ADR-020). Adding a bank means adding a profile and fixtures,
 * not changing `parse` or `reconcile`. Every pattern is matched against text, never coordinates.
 */
export interface BankProfile {
  readonly id: string;
  readonly kind: AccountKind;
  /** Every pattern must match some line of the document for `detect` to choose this profile. */
  readonly markers: readonly RegExp[];
  /** Header labels, matched against whole items, case-insensitively. */
  readonly labels: {
    readonly description: string;
    readonly withdrawals: string;
    readonly deposits: string;
    readonly date: string;
    readonly balance: string;
  };
  /** Matches the statement period on a line: start month, day, year, end month, day, year (2-digit years). */
  readonly period: RegExp;
  /** Matches a row date as one item: month name and day, no year. */
  readonly rowDate: RegExp;
  /** Matches the first item of the total row. */
  readonly totalLabel: RegExp;
  readonly requiredAnchors: NonNullable<ParsedStatement["requiredAnchors"]>;
}
