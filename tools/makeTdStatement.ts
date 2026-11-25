// Synthetic TD-chequing-style statement, built from the geometry of the first reviewed dump
// (docs/PROGRESS.md, 2026-11-14): amounts right-aligned at fixed right edges, header labels centred
// over their columns (so their left edges are further left), month+day dates with no space, a
// balance only on the last row of each day, and (ADR-026) the header at the same height on every
// page, a balance-forward row at the top of pages 2 and later, a page total at a fixed height drawn
// twice, a second total line right after the last row of the last page, a summary block with
// amounts below each total, and a negative balance printed as an amount followed by OD.
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
const HEADER_Y = 200;
const TOTAL_GAP = 10;

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
  /** Cents; negative prints as an amount followed by OD. */
  opening: number;
  days: TdDay[];
  /** Table slots (the starting-balance or balance-forward row, rows and continuation lines) per page; at least 2. */
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

type Slot = { date: string; run: number } & (
  | { kind: "open" }
  | { kind: "fwd" }
  | { kind: "tx"; row: TdRow; balance?: number }
  | { kind: "cont"; text: string }
);

export interface TdStatement {
  pdf: PdfSpec;
  /** Page (0-based) and y of every transaction row, in order. */
  rows: { page: number; y: number }[];
  /** Per page: the y of every Total line drawn (ascending) and the page's figures in cents. */
  totals: {
    page: number;
    ys: number[];
    withdrawals: number;
    deposits: number;
  }[];
}

export function makeTdStatement(spec: TdSpec): TdStatement {
  const perPage = Math.max(2, spec.slotsPerPage ?? 40);
  const slots: Slot[] = [
    {
      kind: "open",
      date: spec.days[0]?.date ?? "JAN01",
      run: spec.opening,
    },
  ];
  let balance = spec.opening;
  for (const day of spec.days) {
    day.rows.forEach((row, i) => {
      balance += row.cents;
      const last = i === day.rows.length - 1;
      slots.push({
        kind: "tx",
        date: day.date,
        run: balance,
        row,
        ...(last ? { balance } : {}),
      });
      if (row.continuation !== undefined)
        slots.push({
          kind: "cont",
          date: day.date,
          run: balance,
          text: row.continuation,
        });
    });
  }

  const chunks: Slot[][] = [];
  let prev: Slot | undefined;
  for (const slot of slots) {
    let chunk = chunks[chunks.length - 1];
    if (!chunk || chunk.length >= perPage) {
      chunk = prev ? [{ kind: "fwd", date: prev.date, run: prev.run }] : [];
      chunks.push(chunk);
    }
    chunk.push(slot);
    prev = slot;
  }

  const pageCount = chunks.length;
  const totalY = HEADER_Y + 14 + perPage * PITCH + TOTAL_GAP;
  const pages: PdfSpec["pages"] = [];
  const rows: TdStatement["rows"] = [];
  const totals: TdStatement["totals"] = [];
  chunks.forEach((chunk, p) => {
    const items: PdfSpec["pages"][number]["items"] = [];
    const put = (str: string, x: number, y: number) =>
      items.push({ str, x, y });
    const amount = (cents: number, right: number, y: number, suffix = "") => {
      const s = formatAmount(cents);
      put(s + suffix, right - width(s), y);
    };
    const printBalance = (cents: number, y: number) =>
      amount(cents, BALANCE_RIGHT, y, cents < 0 ? "OD" : "");
    put(`Page ${p + 1} of ${pageCount}`, 270, 760);
    if (p === 0) {
      put("FAKE BANK CHEQUING STATEMENT", 69.1, 80);
      put(spec.period, 300, 100);
    }
    put("Description", LABEL_X.description, HEADER_Y);
    put("Withdrawals", LABEL_X.withdrawals, HEADER_Y);
    put("Deposits", LABEL_X.deposits, HEADER_Y);
    put("Date", LABEL_X.date, HEADER_Y);
    put("Balance", LABEL_X.balance, HEADER_Y);

    let withdrawals = 0;
    let deposits = 0;
    let y = HEADER_Y + 14;
    for (const slot of chunk) {
      if (slot.kind === "open" || slot.kind === "fwd") {
        put(
          slot.kind === "open" ? "STARTING BALANCE" : "BALANCE FORWARD",
          DESC_X,
          y,
        );
        put(slot.date, DATE_X, y);
        printBalance(slot.run, y);
      } else if (slot.kind === "cont") {
        put(slot.text, DESC_X, y);
      } else {
        rows.push({ page: p, y });
        if (slot.row.cents < 0) withdrawals -= slot.row.cents;
        else deposits += slot.row.cents;
        put(slot.row.desc, DESC_X, y);
        if (slot.row.suffix !== undefined)
          put(slot.row.suffix, DESC_X + width(slot.row.desc) + 34, y);
        amount(
          slot.row.cents,
          slot.row.cents < 0 ? WITHDRAWALS_RIGHT : DEPOSITS_RIGHT,
          y,
        );
        put(slot.date, DATE_X, y);
        if (slot.balance !== undefined) printBalance(slot.balance, y);
      }
      y += PITCH;
    }

    const drawTotal = (at: number, twice: boolean) => {
      // Drawn twice, 0.65 apart vertically and 0.2 horizontally (the dump); normalize merges them.
      for (const [dx, dy] of twice
        ? ([
            [0, 0],
            [0.2, 0.65],
          ] as const)
        : ([[0, 0]] as const)) {
        put("Total", DESC_X + dx, at + dy);
        const w = formatAmount(withdrawals);
        const d = formatAmount(deposits);
        put(w, WITHDRAWALS_RIGHT - width(w) + dx, at + dy);
        put(d, DEPOSITS_RIGHT - width(d) + dx, at + dy);
      }
    };
    const ys: number[] = [];
    if (p === pageCount - 1) {
      drawTotal(y, false);
      ys.push(y);
    }
    drawTotal(totalY, true);
    ys.push(totalY);
    totals.push({ page: p, ys, withdrawals, deposits });

    // A summary block below the total: amounts in the amount area that are not part of the table.
    put("Account summary", DESC_X, totalY + 24);
    amount(1600, WITHDRAWALS_RIGHT, totalY + 24);
    amount(2500, DEPOSITS_RIGHT, totalY + 24);
    put("Interest rate", DESC_X, totalY + 34);
    amount(3, BALANCE_RIGHT, totalY + 34);
    pages.push({ width: 612, height: 792, items });
  });
  return { pdf: { pages }, rows, totals };
}
