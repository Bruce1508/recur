// Synthetic bank-export generator for tests and the demo. Everything here is invented: the
// merchants are fictional and the amounts come from a seeded generator, so the output is the
// same on every run and contains nothing from a real statement.
//
// Lives in tools/, not src/core/: it is test and demo scaffolding, not part of the pipeline.

import type { Cents, ColumnMapping, DateFormat } from "../src/core/types";

/** One transaction in oldest-first order, with the balance printed after it. */
export interface Entry {
  readonly date: string; // YYYY-MM-DD
  readonly amount: Cents; // signed, negative = money out
  readonly description: string;
  readonly balance: Cents;
}

// mulberry32: a tiny seeded generator, so a seed always gives the same ledger.
function prng(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * About `months` months of a plausible chequing account, oldest first: semi-monthly pay, rent,
 * a streaming subscription, a gym whose price rises after six months, and random groceries,
 * coffee and bookshop purchases. Balances start at `opening` and follow the amounts exactly.
 */
export function generateLedger(
  seed: number,
  months = 12,
  startYear = 2025,
  opening: Cents = 500000,
): Entry[] {
  const rand = prng(seed);
  const between = (lo: number, hi: number) =>
    lo + Math.floor(rand() * (hi - lo + 1));

  const raw: { date: string; amount: Cents; description: string }[] = [];
  for (let i = 0; i < months; i++) {
    const y = startYear + Math.floor(i / 12);
    const m = (i % 12) + 1;
    const on = (d: number) => `${y}-${pad(m)}-${pad(d)}`;
    raw.push({ date: on(1), amount: 240000, description: "ACME PAYROLL" });
    raw.push({ date: on(15), amount: 240000, description: "ACME PAYROLL" });
    raw.push({ date: on(1), amount: -120000, description: "MAPLE RENT" });
    raw.push({ date: on(5), amount: -1699, description: "STREAMFLIX" });
    raw.push({
      date: on(12),
      amount: i < 6 ? -4500 : -4900,
      description: "IRONWORKS GYM",
    });
    for (let k = between(3, 5); k > 0; k--) {
      raw.push({
        date: on(between(1, 28)),
        amount: -between(2000, 12000),
        description: `FRESHMART #${between(1, 3)}`,
      });
    }
    for (let k = between(4, 8); k > 0; k--) {
      raw.push({
        date: on(between(1, 28)),
        amount: -between(350, 900),
        description: "CORNER CAFE",
      });
    }
    // A comma in the description exercises CSV quoting.
    raw.push({
      date: on(between(1, 28)),
      amount: -between(1500, 6000),
      description: "HARBOUR BOOKS, DOWNTOWN",
    });
  }
  // Array.prototype.sort is stable, so same-day rows keep the order they were generated in.
  raw.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  let balance = opening;
  return raw.map((r) => {
    balance += r.amount;
    return { ...r, balance };
  });
}

export interface Layout {
  readonly name: string;
  readonly header: boolean;
  /** One signed amount column, or separate debit and credit columns. */
  readonly amount: "signed" | "split";
  readonly balance: boolean;
  readonly dateFormat: DateFormat;
  readonly newestFirst?: boolean;
  /** "$1,234.56" instead of "1234.56". */
  readonly formattedAmounts?: boolean;
}

// Header x amount shape x balance (AC-3), with the date formats spread across them, plus one
// newest-first file and two files with "$" and thousands separators.
export const LAYOUTS: readonly Layout[] = [
  {
    name: "header-signed-balance",
    header: true,
    amount: "signed",
    balance: true,
    dateFormat: "YYYY-MM-DD",
  },
  {
    name: "header-signed",
    header: true,
    amount: "signed",
    balance: false,
    dateFormat: "MM/DD/YYYY",
  },
  {
    name: "header-split-balance",
    header: true,
    amount: "split",
    balance: true,
    dateFormat: "DD/MM/YYYY",
  },
  {
    name: "header-split",
    header: true,
    amount: "split",
    balance: false,
    dateFormat: "YYYY-MM-DD",
  },
  {
    name: "plain-signed-balance",
    header: false,
    amount: "signed",
    balance: true,
    dateFormat: "MM/DD/YYYY",
  },
  {
    name: "plain-signed",
    header: false,
    amount: "signed",
    balance: false,
    dateFormat: "DD/MM/YYYY",
  },
  {
    name: "plain-split-balance",
    header: false,
    amount: "split",
    balance: true,
    dateFormat: "MM/DD/YYYY",
  },
  {
    name: "plain-split",
    header: false,
    amount: "split",
    balance: false,
    dateFormat: "YYYY-MM-DD",
  },
  {
    name: "newest-first-signed-balance",
    header: true,
    amount: "signed",
    balance: true,
    dateFormat: "YYYY-MM-DD",
    newestFirst: true,
  },
  {
    name: "formatted-split-balance",
    header: true,
    amount: "split",
    balance: true,
    dateFormat: "YYYY-MM-DD",
    formattedAmounts: true,
  },
  {
    name: "formatted-signed",
    header: false,
    amount: "signed",
    balance: false,
    dateFormat: "MM/DD/YYYY",
    formattedAmounts: true,
  },
];

function renderDate(iso: string, format: DateFormat): string {
  const [y = "", m = "", d = ""] = iso.split("-");
  if (format === "YYYY-MM-DD") return iso;
  return format === "MM/DD/YYYY" ? `${m}/${d}/${y}` : `${d}/${m}/${y}`;
}

function renderMoney(cents: Cents, formatted: boolean): string {
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100);
  const frac = pad(abs % 100);
  const digits = formatted
    ? String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ",")
    : String(whole);
  return `${cents < 0 ? "-" : ""}${formatted ? "$" : ""}${digits}.${frac}`;
}

const csvCell = (text: string) =>
  /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;

/** The entries in the order they appear in the file. */
export function fileOrder(entries: readonly Entry[], layout: Layout): Entry[] {
  return layout.newestFirst ? [...entries].reverse() : [...entries];
}

/** Render oldest-first entries as the CSV text of `layout`. */
export function renderCsv(entries: readonly Entry[], layout: Layout): string {
  const money = (c: Cents) => renderMoney(c, layout.formattedAmounts === true);
  const lines: string[][] = [];
  if (layout.header) {
    lines.push([
      "Date",
      "Description",
      ...(layout.amount === "signed" ? ["Amount"] : ["Debit", "Credit"]),
      ...(layout.balance ? ["Balance"] : []),
    ]);
  }
  for (const e of fileOrder(entries, layout)) {
    const amountCells =
      layout.amount === "signed"
        ? [money(e.amount)]
        : e.amount < 0
          ? [money(-e.amount), ""]
          : ["", money(e.amount)];
    lines.push([
      renderDate(e.date, layout.dateFormat),
      e.description,
      ...amountCells,
      ...(layout.balance ? [money(e.balance)] : []),
    ]);
  }
  return `${lines.map((l) => l.map(csvCell).join(",")).join("\n")}\n`;
}

/**
 * The mapping `mapColumns` should return for a file of this layout. A file with no header, a
 * debit/credit pair and no balance really cannot be read with certainty (which column is
 * which?), so that one is expected to be low confidence.
 */
export function expectedMapping(layout: Layout): ColumnMapping {
  const split = layout.amount === "split";
  return {
    hasHeader: layout.header,
    date: 0,
    dateFormat: layout.dateFormat,
    description: 1,
    amount: split ? { debit: 2, credit: 3 } : { signed: 2 },
    ...(layout.balance ? { balance: split ? 4 : 3 } : {}),
    confidence: !layout.header && split && !layout.balance ? "low" : "high",
  };
}

export interface SyntheticFile {
  readonly layout: Layout;
  readonly csv: string;
  /** The transactions in the order they appear in the file. */
  readonly entries: readonly Entry[];
  readonly mapping: ColumnMapping;
}

/** One file per layout, all from the same ledger. */
export function makeSyntheticSet(seed = 1): SyntheticFile[] {
  const entries = generateLedger(seed);
  return LAYOUTS.map((layout) => ({
    layout,
    csv: renderCsv(entries, layout),
    entries: fileOrder(entries, layout),
    mapping: expectedMapping(layout),
  }));
}
