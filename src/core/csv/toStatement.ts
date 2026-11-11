import { parseMoney } from "../money";
import { parseDate } from "../plainDate";
import type {
  AccountKind,
  Cents,
  ColumnMapping,
  ParsedStatement,
  Transaction,
} from "../types";

export type ToStatementOptions = {
  readonly kind: AccountKind;
  /**
   * Flip a signed amount column. The mapping cannot know the sign convention of a lone amount
   * column (a card export often prints purchases as positive), so the UI shows a sample and the
   * user sets this. Ignored for separate debit and credit columns, whose meaning is the column.
   */
  readonly negateSigned?: boolean;
};

export type ToStatementResult =
  | { ok: true; statement: ParsedStatement }
  | { ok: false; reason: string };

// cyrb53: a small, fast 53-bit string hash. Not cryptographic; it only has to tell a handful
// of imported files apart and be the same on every run (Math.random and crypto are not).
function hash53(text: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 =
    Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^
    Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 =
    Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^
    Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0))
    .toString(16)
    .padStart(14, "0");
}

const negate = (c: Cents): Cents => (c === 0 ? 0 : -c); // never -0

/**
 * Rows + a confirmed mapping -> ParsedStatement (stage 1, last CSV step).
 *
 * A row that cannot be converted becomes a warning that names the row and the field, never the
 * cell text (warnings are shown in the UI and may end up in screenshots). Nothing is guessed:
 * the row is left out. Fails only when no row converts at all.
 *
 * Row numbers are positions in the rows from `readCsv`, which drops blank lines, so they match
 * a spreadsheet line only when the file has none.
 */
export function toStatement(
  rows: readonly (readonly string[])[],
  mapping: ColumnMapping,
  options: ToStatementOptions,
): ToStatementResult {
  const id = `csv-${hash53(JSON.stringify(rows))}`;
  const cell = (row: readonly string[], c: number) => (row[c] ?? "").trim();
  const transactions: Transaction[] = [];
  const warnings: string[] = [];
  const { amount: cols, balance } = mapping;

  for (const [i, row] of rows.entries()) {
    if (i === 0 && mapping.hasHeader) continue;
    const n = i + 1;
    const skip = (field: string) => {
      warnings.push(`Row ${n}: ${field}; row skipped`);
    };

    const date = parseDate(cell(row, mapping.date), mapping.dateFormat);
    if (date === null) {
      skip("unreadable date");
      continue;
    }

    let cents: Cents | null;
    if ("signed" in cols) {
      const v = parseMoney(cell(row, cols.signed));
      cents = v === null ? null : options.negateSigned ? negate(v) : v;
    } else {
      const d = cell(row, cols.debit);
      const c = cell(row, cols.credit);
      const debit = d === "" ? null : parseMoney(d);
      const credit = c === "" ? null : parseMoney(c);
      const bad =
        (d !== "" && debit === null) ||
        (c !== "" && credit === null) ||
        (debit ?? 0) < 0 ||
        (credit ?? 0) < 0 ||
        (d === "") === (c === ""); // both filled or both empty: ambiguous
      cents = bad ? null : credit === null ? negate(debit ?? 0) : credit;
    }
    if (cents === null) {
      skip("unreadable amount");
      continue;
    }

    let balanceAfter: Cents | undefined;
    if (balance !== undefined) {
      const v = parseMoney(cell(row, balance));
      if (v === null)
        warnings.push(`Row ${n}: unreadable balance; balance left out`);
      else balanceAfter = v;
    }

    transactions.push({
      id: `${id}:${n}`,
      date,
      description: cell(row, mapping.description).replace(/\s+/g, " "),
      amount: cents,
      ...(balanceAfter === undefined ? {} : { balanceAfter }),
      source: { statementId: id, input: "csv", row: n },
    });
  }

  const dates = transactions.map((t) => t.date).sort(); // ISO dates sort as text
  const start = dates[0];
  const end = dates[dates.length - 1];
  if (start === undefined || end === undefined) {
    return { ok: false, reason: "No row could be read as a transaction" };
  }

  return {
    ok: true,
    statement: {
      id,
      input: "csv",
      bankId: "unknown",
      kind: options.kind,
      period: { start, end },
      transactions,
      warnings,
    },
  };
}
