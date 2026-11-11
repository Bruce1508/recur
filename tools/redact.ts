// Redact a real bank CSV into a committable fixture (ADR-005). Pure: the CLI in fixture-dump.ts
// does the file reading and writing. Kept: the header labels (digit runs masked), dates, amounts
// and balances. Replaced: each distinct description by a stable placeholder. Blanked: every other
// column (memo, card number, cheque number, ...). It fails closed: a mapping it is unsure of, or
// text in a column it would keep, refuses the file instead of guessing what is safe to print.

import Papa from "papaparse";
import { mapColumns } from "../src/core/csv/mapColumns";
import { readCsv } from "../src/core/csv/read";
import { parseMoney } from "../src/core/money";
import { parseDate } from "../src/core/plainDate";
import type { ColumnMapping } from "../src/core/types";

export type RedactResult =
  | {
      ok: true;
      csv: string;
      /** Normalised description -> placeholder. Keep it between files so placeholders stay stable. */
      map: Record<string, string>;
      /** Counts only: this is printed to the terminal. */
      report: { rows: number; merchants: number; blankedColumns: number };
    }
  | { ok: false; reason: string };

const normalise = (d: string) => d.trim().replace(/\s+/g, " ").toUpperCase();
const maskDigits = (s: string) =>
  s.replace(/\d{4,}/g, (m) => "X".repeat(m.length));

function read(
  text: string,
): { rows: string[][]; mapping: ColumnMapping } | string {
  const r = readCsv(text);
  if (!r.ok) return r.reason;
  const m = mapColumns(r.rows);
  if (!m.ok) return m.reason;
  return { rows: r.rows, mapping: m.mapping };
}

function moneyColumns(m: ColumnMapping): number[] {
  const cols =
    "signed" in m.amount
      ? [m.amount.signed]
      : [m.amount.debit, m.amount.credit];
  return m.balance === undefined ? cols : [...cols, m.balance];
}

export interface RedactOptions {
  /**
   * 0-based column that holds the merchant text. The owner sets it after looking at the file when
   * mapColumns is unsure (an extra text column such as a card number makes it unsure). With it,
   * a low-confidence mapping is accepted, because the owner has vouched for the description.
   */
  readonly descriptionColumn?: number;
}

const same = (a: ColumnMapping, b: ColumnMapping) =>
  JSON.stringify({ ...a, confidence: "" }) ===
  JSON.stringify({ ...b, confidence: "" });

export function redactCsv(
  text: string,
  previous: Readonly<Record<string, string>>,
  options: RedactOptions = {},
): RedactResult {
  const parsed = read(text);
  if (typeof parsed === "string")
    return { ok: false, reason: `cannot read the file: ${parsed}` };
  const { rows } = parsed;
  const width = rows[0]?.length ?? 0;
  if (
    options.descriptionColumn !== undefined &&
    !(options.descriptionColumn >= 0 && options.descriptionColumn < width)
  )
    return {
      ok: false,
      reason: `the file has ${width} columns; no column ${options.descriptionColumn + 1}`,
    };
  const mapping: ColumnMapping =
    options.descriptionColumn === undefined
      ? parsed.mapping
      : { ...parsed.mapping, description: options.descriptionColumn };
  if (options.descriptionColumn === undefined && mapping.confidence === "low")
    return {
      ok: false,
      reason: `the column mapping is not certain, so the merchant text might be in the wrong column (the file has ${width} columns${
        mapping.hasHeader
          ? `: ${(rows[0] ?? []).map(maskDigits).join(" | ")}`
          : ""
      }); check the file and re-run with --description <column number>`,
    };
  if (
    mapping.description === mapping.date ||
    moneyColumns(mapping).includes(mapping.description)
  )
    return {
      ok: false,
      reason: "that column is the date or an amount, not the description",
    };

  const money = moneyColumns(mapping);
  const kept = new Set([mapping.date, ...money]);
  const map = { ...previous };
  let next =
    Math.max(
      0,
      ...Object.values(map).map((p) => Number(p.slice("MERCHANT_".length))),
    ) + 1;

  const out: string[][] = [];
  for (const [i, row] of rows.entries()) {
    if (i === 0 && mapping.hasHeader) {
      out.push(row.map(maskDigits));
      continue;
    }
    const cells: string[] = [];
    for (const [c, raw] of row.entries()) {
      const cell = raw.trim();
      if (c === mapping.description) {
        const key = normalise(cell);
        if (key === "") cells.push("");
        else {
          if (!map[key])
            map[key] = `MERCHANT_${String(next++).padStart(2, "0")}`;
          cells.push(map[key] as string);
        }
      } else if (kept.has(c)) {
        const fine =
          cell === "" ||
          (c === mapping.date
            ? parseDate(cell, mapping.dateFormat) !== null
            : parseMoney(cell) !== null);
        if (!fine)
          return {
            ok: false,
            reason: `row ${i + 1}, column ${c + 1}: unexpected text where a date or amount should be`,
          };
        cells.push(cell);
      } else cells.push("");
    }
    out.push(cells);
  }

  const csv = Papa.unparse(out, { newline: "\n" });
  const again = read(csv);
  if (
    typeof again === "string" ||
    again.mapping.confidence === "low" ||
    !same(again.mapping, mapping)
  )
    return {
      ok: false,
      reason:
        "redacting changed how the file reads, so the fixture would not match the original layout",
    };

  return {
    ok: true,
    csv,
    map,
    report: {
      rows: rows.length - (mapping.hasHeader ? 1 : 0),
      merchants: Object.keys(map).length,
      blankedColumns: width - kept.size - 1,
    },
  };
}
