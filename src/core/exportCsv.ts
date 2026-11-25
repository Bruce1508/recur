import Papa from "papaparse";
import type { Cents, Transaction } from "./types";

export interface ExportRow {
  /** The account letter the user put the file under. */
  readonly account: string;
  readonly transaction: Transaction;
}

// Leading quotes are part of the pattern so that restoreText can tell our prefix from a quote the
// bank printed: "'=x" becomes "''=x" and comes back as "'=x".
const NEUTRALISED = /^'+[=+\-@\t\r]/;
const RUNS_AS_FORMULA = /^'*[=+\-@\t\r]/;

/**
 * Text cell -> text a spreadsheet shows as text. A cell starting with `=`, `+`, `-`, `@`, tab or
 * carriage return is prefixed with `'` (OWASP CSV injection). Only for text: numbers stay numbers.
 */
export function neutralise(text: string): string {
  return RUNS_AS_FORMULA.test(text) ? `'${text}` : text;
}

/** Undo `neutralise`, so an exported file re-imports to the same descriptions. */
export function restoreText(text: string): string {
  return NEUTRALISED.test(text) ? text.slice(1) : text;
}

/** Cents -> "-12.50": no currency sign or grouping, so every spreadsheet reads it as a number. */
const decimal = (c: Cents): string => {
  const a = Math.abs(c);
  return `${c < 0 ? "-" : ""}${Math.floor(a / 100)}.${String(a % 100).padStart(2, "0")}`;
};

/**
 * Merged ledger -> CSV text: Date, Description, Amount (signed, negative = money out), Balance
 * (blank when the statement printed none), Account. Text fields are neutralised; PapaParse quotes.
 * Starts with a UTF-8 byte order mark so Excel reads accented descriptions correctly; `readCsv` strips it.
 */
export function exportLedgerCsv(rows: readonly ExportRow[]): string {
  return `\uFEFF${Papa.unparse({
    fields: ["Date", "Description", "Amount", "Balance", "Account"],
    data: rows.map(({ account, transaction: t }) => [
      t.date,
      neutralise(t.description),
      decimal(t.amount),
      t.balanceAfter === undefined ? "" : decimal(t.balanceAfter),
      neutralise(account),
    ]),
  })}`;
}
