// Synthetic TD-chequing-style statement, built from the geometry of the first reviewed dump
// (docs/PROGRESS.md, 2026-11-14): amounts right-aligned at fixed right edges, header labels centred
// over their columns (so their left edges are further left), month+day dates with no space, a
// balance only on the last row of each day, a total row drawn twice, a fees block after it.
// All data is invented. Nothing is written to disk (ADR-016).

import type { PdfSpec } from "./makePdf";

// Right edges and left edges in points, from the dump.
const DESC_X = 69.1;
const WITHDRAWALS_RIGHT = 306.4;
const DEPOSITS_RIGHT = 405.5;
const DATE_X = 417.5;
const BALANCE_RIGHT = 534.4;
const LABEL_X = {
  description: DESC_X,
  withdrawals: 262,
  deposits: 366,
  date: DATE_X,
  balance: 492,
};
const PITCH = 9.5;
const FONT_SIZE = 10;

export interface TdRow {
  desc: string;
  /** A separate item a little to the right of the description, like the dump's `_V`. */
  suffix?: string;
  /** A second line in the description column, with no date and no amount. */
  continuation?: string;
  /** Signed cents: negative is a withdrawal. */
  cents: number;
}

export interface TdDay {
  /** Month and day with no space, as printed: "SEP02". */
  date: string;
  rows: TdRow[];
}

export interface TdSpec {
  /** The period as printed, e.g. "SEP 01/25 - OCT 01/25". */
  period: string;
  opening: number;
  days: TdDay[];
  /** Table slots (the starting-balance row, rows and continuation lines) per page. */
  slotsPerPage?: number;
}

// Helvetica advance widths per 1000 em, for the characters amounts use.
const ADVANCE: Record<string, number> = { ",": 278, ".": 278, "-": 333 };
const width = (s: string) =>
  [...s].reduce((w, c) => w + (ADVANCE[c] ?? 556), 0) * (FONT_SIZE / 1000);

export function formatAmount(cents: number): string {
  const abs = Math.abs(cents);
  const whole = String(Math.floor(abs / 100)).replace(
    /\B(?=(\d{3})+(?!\d))/g,
    ",",
  );
  return `${whole}.${String(abs % 100).padStart(2, "0")}`;
}

type Slot =
  | { kind: "open"; date: string; balance: number }
  | { kind: "tx"; date: string; row: TdRow; balance?: number }
  | { kind: "cont"; text: string };

export interface TdStatement {
  pdf: PdfSpec;
  /** Page (0-based) and y of every transaction row, in order. */
  rows: { page: number; y: number }[];
}

export function makeTdStatement(spec: TdSpec): TdStatement {
  const perPage = spec.slotsPerPage ?? 40;
  const slots: Slot[] = [
    {
      kind: "open",
      date: spec.days[0]?.date ?? "JAN01",
      balance: spec.opening,
    },
  ];
  let balance = spec.opening;
  let withdrawals = 0;
  let deposits = 0;
  for (const day of spec.days) {
    day.rows.forEach((row, i) => {
      balance += row.cents;
      if (row.cents < 0) withdrawals -= row.cents;
      else deposits += row.cents;
      const last = i === day.rows.length - 1;
      slots.push({
        kind: "tx",
        date: day.date,
        row,
        ...(last ? { balance } : {}),
      });
      if (row.continuation !== undefined)
        slots.push({ kind: "cont", text: row.continuation });
    });
  }

  const pageCount = Math.ceil(slots.length / perPage);
  const pages: PdfSpec["pages"] = [];
  const rows: TdStatement["rows"] = [];
  for (let p = 0; p < pageCount; p++) {
    const items: PdfSpec["pages"][number]["items"] = [];
    const put = (str: string, x: number, y: number) =>
      items.push({ str, x, y });
    const amount = (cents: number, right: number, y: number) => {
      const s = formatAmount(cents);
      put(s, right - width(s), y);
    };
    put(`Page ${p + 1} of ${pageCount}`, 270, 760);
    let headerY = 60;
    if (p === 0) {
      put("FAKE BANK CHEQUING STATEMENT", 69.1, 80);
      put(spec.period, 300, 100);
      headerY = 200;
    }
    put("Description", LABEL_X.description, headerY);
    put("Withdrawals", LABEL_X.withdrawals, headerY);
    put("Deposits", LABEL_X.deposits, headerY);
    put("Date", LABEL_X.date, headerY);
    put("Balance", LABEL_X.balance, headerY);

    let y = headerY + 14;
    for (const slot of slots.slice(p * perPage, (p + 1) * perPage)) {
      if (slot.kind === "open") {
        put("STARTING BALANCE", DESC_X, y);
        put(slot.date, DATE_X, y);
        amount(slot.balance, BALANCE_RIGHT, y);
      } else if (slot.kind === "cont") {
        put(slot.text, DESC_X, y);
      } else {
        rows.push({ page: p, y });
        put(slot.row.desc, DESC_X, y);
        if (slot.row.suffix !== undefined)
          put(slot.row.suffix, DESC_X + width(slot.row.desc) + 34, y);
        amount(
          slot.row.cents,
          slot.row.cents < 0 ? WITHDRAWALS_RIGHT : DEPOSITS_RIGHT,
          y,
        );
        put(slot.date, DATE_X, y);
        if (slot.balance !== undefined) amount(slot.balance, BALANCE_RIGHT, y);
      }
      y += PITCH;
    }

    if (p === pageCount - 1) {
      // The total row is drawn twice, 0.65 apart vertically and 0.2 horizontally (the dump).
      for (const [dx, dy] of [
        [0, 0],
        [0.2, 0.65],
      ] as const) {
        put("Total", DESC_X + dx, y + dy);
        const w = formatAmount(withdrawals);
        const d = formatAmount(deposits);
        put(w, WITHDRAWALS_RIGHT - width(w) + dx, y + dy);
        put(d, DEPOSITS_RIGHT - width(d) + dx, y + dy);
      }
      // A fees block after the table: an amount in the withdrawals column that is not a row.
      put("Monthly fee summary", DESC_X, y + 40);
      amount(1600, WITHDRAWALS_RIGHT, y + 40);
    }
    pages.push({ width: 612, height: 792, items });
  }
  return { pdf: { pages }, rows };
}
