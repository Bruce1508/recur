import { parseMoney } from "../money";
import { parseDate } from "../plainDate";
import type { ColumnMapping, DateFormat } from "../types";

export type MapResult =
  | { ok: true; mapping: ColumnMapping }
  | { ok: false; reason: string };

// Month-first is listed before day-first: when both fit every date, month-first is the
// default guess and the mapping is marked low confidence.
const FORMATS: readonly DateFormat[] = [
  "YYYY-MM-DD",
  "MM/DD/YYYY",
  "DD/MM/YYYY",
];
// "12,34", "1.234,56", "(12,34)": a comma followed by one or two digits at the end.
// parseMoney would reject these anyway, but "1,234" would pass it as thousands, so a
// decimal-comma export must be refused here rather than misread by 1000x.
const DECIMAL_COMMA = /^\(?[+-]?\$?\d+(?:\.\d{3})*,\d{1,2}\)?$/;
const DEBIT_LABEL = /debit|withdraw/i;
const CREDIT_LABEL = /credit|deposit/i;

const fail = (reason: string): MapResult => ({ ok: false, reason });

/** Balance moves by `sign * delta` from one row to the next, in file order or reversed. */
function continuitySign(
  balance: readonly number[],
  delta: readonly number[],
): 1 | -1 | null {
  // With repeating deltas, (oldest-first, +1) and (newest-first, -1) can both fit; +1 wins.
  // Only tiny or all-equal-amount files hit this.
  if (balance.length < 2) return null;
  for (const sign of [1, -1] as const) {
    const oldestFirst = balance.every(
      (b, i) => i === 0 || b - (balance[i - 1] ?? 0) === sign * (delta[i] ?? 0),
    );
    const newestFirst = balance.every(
      (b, i) =>
        i === 0 || (balance[i - 1] ?? 0) - b === sign * (delta[i - 1] ?? 0),
    );
    if (oldestFirst || newestFirst) return sign;
  }
  return null;
}

/**
 * Rows -> which column is the date, description, amount (or debit and credit) and balance.
 *
 * Works from cell contents; header labels are used only to tell debit from credit when the
 * contents cannot. Never guesses silently: anything that could be read two ways comes back
 * with confidence "low" so the UI asks the user. Fails closed on ragged rows, decimal commas
 * and files with no usable date, amount or description column.
 *
 * Known limit: a column of plain integers (cheque or reference numbers) looks like money.
 * It can only produce a low-confidence mapping or a failure, never a silent wrong one,
 * because the balance must reconcile row to row and a pair must be debit/credit-shaped.
 */
export function mapColumns(rows: readonly (readonly string[])[]): MapResult {
  const first = rows[0];
  if (!first) return fail("The file has no rows");
  const width = first.length;
  for (const [i, row] of rows.entries()) {
    if (row.length !== width) {
      return fail(`Row ${i + 1} has ${row.length} columns, expected ${width}`);
    }
  }

  const cell = (row: readonly string[], c: number) => (row[c] ?? "").trim();
  const isDateOrMoney = (t: string) =>
    FORMATS.some((f) => parseDate(t, f) !== null) || parseMoney(t) !== null;
  const hasHeader = first.every((c) => !isDateOrMoney(c.trim()));
  const body = hasHeader ? rows.slice(1) : rows;
  if (body.length === 0) return fail("The file has no transactions");

  if (body.some((r) => r.some((c) => DECIMAL_COMMA.test(c.trim())))) {
    return fail(
      "Amounts use a decimal comma, which is not supported yet; export with a decimal point",
    );
  }

  const columns = Array.from({ length: width }, (_, c) =>
    body.map((r) => cell(r, c)),
  );
  const live = columns.flatMap((cells, c) =>
    cells.some((x) => x !== "") ? [c] : [],
  );

  // Date: the first column where every row has a date in some format.
  let date = -1;
  let fitting: DateFormat[] = [];
  for (const c of live) {
    const cells = columns[c] ?? [];
    const fits = FORMATS.filter((f) =>
      cells.every((x) => parseDate(x, f) !== null),
    );
    if (fits.length > 0) {
      date = c;
      fitting = fits;
      break;
    }
  }
  const dateFormat = fitting[0];
  if (date < 0 || dateFormat === undefined) {
    return fail("No column holds a date in every row");
  }
  let low = fitting.length > 1;

  // Money columns: every non-empty cell parses as an amount.
  const money = live.filter(
    (c) =>
      c !== date &&
      (columns[c] ?? []).every((x) => x === "" || parseMoney(x) !== null),
  );
  const cents = (c: number) =>
    (columns[c] ?? []).map((x) => (x === "" ? null : parseMoney(x)));
  const filled = (c: number) => (columns[c] ?? []).every((x) => x !== "");

  const labelOrder = (r0: number, r1: number) => {
    const label = (c: number) => (hasHeader ? cell(first, c) : "");
    const creditFirst =
      CREDIT_LABEL.test(label(r0)) || DEBIT_LABEL.test(label(r1));
    const debitFirst =
      DEBIT_LABEL.test(label(r0)) || CREDIT_LABEL.test(label(r1));
    if (creditFirst === debitFirst) return null; // absent or contradictory
    return creditFirst ? "credit-first" : "debit-first";
  };

  // A lone numeric column whose header says Debit or Credit is half of a split pair whose other
  // half is empty in every row: its sign convention is unknown, so the user must confirm.
  const splitHalf = (c: number) =>
    hasHeader &&
    (DEBIT_LABEL.test(cell(first, c)) || CREDIT_LABEL.test(cell(first, c)));

  let amount: ColumnMapping["amount"] | undefined;
  let balance: number | undefined;

  // Balance: a fully filled column that continues from row to row by the amounts.
  for (const b of money.filter(filled)) {
    const rest = money.filter((c) => c !== b);
    const [r0, r1] = rest;
    if (r0 === undefined || rest.length > 2) continue;
    const a = cents(r0);
    const delta =
      r1 === undefined
        ? a.map((x) => x ?? 0)
        : cents(r1).map((x, i) => (x ?? 0) - (a[i] ?? 0));
    const sign = continuitySign(
      cents(b).map((x) => x ?? 0),
      delta,
    );
    if (sign === null) continue;
    balance = b;
    if (r1 === undefined) {
      amount = { signed: r0 };
      // The mapping has no sign field, so a reversed sign must be confirmed.
      if (sign === -1 || splitHalf(r0)) low = true;
    } else {
      // Header labels decide the order. Without them the order is only assumed (debit
      // first), and a reversed balance sign (liability balance, or credit first) is a coin flip.
      const order = labelOrder(r0, r1);
      amount =
        order === "credit-first"
          ? { debit: r1, credit: r0 }
          : { debit: r0, credit: r1 };
      if (order === null && sign === -1) low = true;
    }
    break;
  }

  if (amount === undefined) {
    const [r0, r1] = money;
    if (r0 === undefined) return fail("No amount column found");
    if (money.length === 1) {
      amount = { signed: r0 };
      if (splitHalf(r0)) low = true;
    } else if (money.length === 2 && r1 !== undefined) {
      const complementary = body.every(
        (r) => (cell(r, r0) === "") !== (cell(r, r1) === ""),
      );
      if (complementary) {
        const order = labelOrder(r0, r1);
        amount =
          order === "credit-first"
            ? { debit: r1, credit: r0 }
            : { debit: r0, credit: r1 };
        if (order === null) low = true; // labels absent or contradictory
      } else {
        // Probably amount + a balance that does not reconcile; the user decides.
        amount = { signed: r0 };
        balance = r1;
        low = true;
      }
    } else {
      return fail("Cannot tell which numeric columns are amounts");
    }
  }

  // Description: the text column with the longest cells.
  const used = new Set<number>([date, ...money]);
  const text = live.filter((c) => !used.has(c));
  const avg = (c: number) =>
    (columns[c] ?? []).reduce((n, x) => n + x.length, 0) / body.length;
  const description = [...text].sort((x, y) => avg(y) - avg(x))[0];
  if (description === undefined) return fail("No description column found");
  if (text.length > 1) low = true;

  return {
    ok: true,
    mapping: {
      hasHeader,
      date,
      dateFormat,
      description,
      amount,
      ...(balance === undefined ? {} : { balance }),
      confidence: low ? "low" : "high",
    },
  };
}
