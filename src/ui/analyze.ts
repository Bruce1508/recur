import { mapColumns } from "../core/csv/mapColumns";
import { readCsv } from "../core/csv/read";
import type { ColumnMapping, DateFormat } from "../core/types";

export type Analysis =
  | { status: "error"; reason: string }
  | {
      status: "ready";
      rows: string[][];
      mapping: ColumnMapping;
    }
  | {
      status: "confirm";
      rows: string[][];
      mapping: ColumnMapping;
      /** First data rows as read, so the user can check dates and the sign of amounts. */
      sample: string[][];
    };

/**
 * CSV text -> what the UI must do next. A mapping goes to the user when it is low confidence, or
 * when the amount is one signed column (ColumnMapping has no
 * sign field, and a balance column proves the sign only for a deposit account, so the user also
 * picks the account type there; toStatement does not check confidence).
 */
export function analyzeCsv(text: string): Analysis {
  const read = readCsv(text);
  if (!read.ok) return { status: "error", reason: read.reason };
  const mapped = mapColumns(read.rows);
  if (!mapped.ok) return { status: "error", reason: mapped.reason };
  const { mapping } = mapped;
  if (mapping.confidence === "low" || "signed" in mapping.amount) {
    const first = mapping.hasHeader ? 1 : 0;
    return {
      status: "confirm",
      rows: read.rows,
      mapping,
      sample: read.rows.slice(first, first + 3),
    };
  }
  return { status: "ready", rows: read.rows, mapping };
}

/** The user's overrides on a mapping: date format, and which of debit/credit is which. */
export function applyChoices(
  mapping: ColumnMapping,
  choices: { dateFormat: DateFormat; swapDebitCredit: boolean },
): ColumnMapping {
  const { amount } = mapping;
  return {
    ...mapping,
    dateFormat: choices.dateFormat,
    amount:
      choices.swapDebitCredit && "debit" in amount
        ? { debit: amount.credit, credit: amount.debit }
        : amount,
  };
}

/** What the app took each column to be, one label per column, so the user can check it. */
export function columnRoles(mapping: ColumnMapping, width: number): string[] {
  const roles = Array.from({ length: width }, () => "(ignored)");
  roles[mapping.date] = "Date";
  roles[mapping.description] = "Description";
  if ("signed" in mapping.amount) roles[mapping.amount.signed] = "Amount";
  else {
    roles[mapping.amount.debit] = "Debit (money out)";
    roles[mapping.amount.credit] = "Credit (money in)";
  }
  if (mapping.balance !== undefined) roles[mapping.balance] = "Balance";
  return roles;
}
