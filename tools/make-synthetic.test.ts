import { describe, expect, test } from "vitest";
import { mapColumns } from "../src/core/csv/mapColumns";
import { readCsv } from "../src/core/csv/read";
import { toStatement } from "../src/core/csv/toStatement";
import { buildLedger } from "../src/core/ledger";
import { reconcile } from "../src/core/reconcile";
import type { ParsedStatement } from "../src/core/types";
import {
  type Entry,
  generateLedger,
  LAYOUTS,
  type Layout,
  makeSyntheticSet,
  renderCsv,
} from "./make-synthetic";

function importCsv(csv: string, layout: Layout): ParsedStatement {
  const read = readCsv(csv);
  if (!read.ok) throw new Error(`readCsv: ${read.reason}`);
  const mapped = mapColumns(read.rows);
  if (!mapped.ok) throw new Error(`mapColumns: ${mapped.reason}`);
  const r = toStatement(read.rows, mapped.mapping, { kind: "deposit" });
  if (!r.ok) throw new Error(`toStatement (${layout.name}): ${r.reason}`);
  return r.statement;
}

describe("generateLedger", () => {
  const entries = generateLedger(1);

  test("is deterministic per seed and differs between seeds", () => {
    expect(generateLedger(1)).toEqual(entries);
    expect(generateLedger(2)).not.toEqual(entries);
  });

  test("spans twelve months, oldest first, with balances that follow the amounts", () => {
    expect(entries[0]?.date.slice(0, 7)).toBe("2025-01");
    expect(entries[entries.length - 1]?.date.slice(0, 7)).toBe("2025-12");
    let prev = 500000;
    let prevDate = "";
    for (const e of entries) {
      expect(e.date >= prevDate).toBe(true);
      expect(e.amount).not.toBe(0);
      expect(e.balance).toBe(prev + e.amount);
      prev = e.balance;
      prevDate = e.date;
    }
  });

  test("contains the recurring charges the detector will need to find", () => {
    const count = (d: string) =>
      entries.filter((e) => e.description === d).length;
    expect(count("STREAMFLIX")).toBe(12);
    expect(count("IRONWORKS GYM")).toBe(12);
    expect(count("MAPLE RENT")).toBe(12);
    expect(count("ACME PAYROLL")).toBe(24);
  });

  test("days above 12 exist in every month, so slashed dates are never ambiguous", () => {
    expect(entries.some((e) => Number(e.date.slice(8)) > 12)).toBe(true);
  });
});

describe("every layout round-trips through the whole CSV pipeline (AC-1, AC-3)", () => {
  for (const file of makeSyntheticSet()) {
    const { layout } = file;
    describe(layout.name, () => {
      const read = readCsv(file.csv);
      const rows = read.ok ? read.rows : [];

      test("mapColumns returns the expected mapping", () => {
        const mapped = mapColumns(rows);
        expect(mapped).toEqual({ ok: true, mapping: file.mapping });
      });

      test("toStatement gives exactly the generated transactions, no warnings", () => {
        const s = importCsv(file.csv, layout);
        expect(
          s.transactions.map((t) => [t.date, t.description, t.amount]),
        ).toEqual(file.entries.map((e) => [e.date, e.description, e.amount]));
        if (layout.balance) {
          expect(s.transactions.map((t) => t.balanceAfter)).toEqual(
            file.entries.map((e) => e.balance),
          );
        }
        expect(s.warnings).toEqual([]);
      });

      test(
        layout.balance
          ? "reconciles as verified"
          : "is unverifiable, never verified",
        () => {
          const r = reconcile(importCsv(file.csv, layout));
          if (layout.balance) {
            expect(r).toEqual({
              status: "verified",
              method: "running-balance",
            });
          } else {
            expect(r.status).toBe("unverifiable");
          }
        },
      );

      if (layout.balance) {
        test("altering one middle amount flips to mismatch and names that row (AC-2)", () => {
          const k = Math.floor(file.entries.length / 2);
          // Alter the amount only; the printed balances stay those of the original ledger.
          const base = generateLedger(1);
          const index = layout.newestFirst ? base.length - 1 - k : k;
          const tampered: Entry[] = base.map((e, i) =>
            i === index ? { ...e, amount: e.amount - 1 } : e,
          );
          const r = reconcile(importCsv(renderCsv(tampered, layout), layout));
          expect(r.status).toBe("mismatch");
          if (r.status === "mismatch") {
            expect(r.firstBadRow).toBe(k + 1 + (layout.header ? 1 : 0));
          }
        });
      }
    });
  }

  test("the set covers header, no header, one and two amount columns, with and without balances", () => {
    const has = (f: (l: Layout) => boolean) => LAYOUTS.some(f);
    expect(has((l) => l.header)).toBe(true);
    expect(has((l) => !l.header)).toBe(true);
    expect(has((l) => l.amount === "signed")).toBe(true);
    expect(has((l) => l.amount === "split")).toBe(true);
    expect(has((l) => l.balance)).toBe(true);
    expect(has((l) => !l.balance)).toBe(true);
    expect(new Set(LAYOUTS.map((l) => l.dateFormat)).size).toBe(3);
  });
});

describe("two overlapping exports merge into the original ledger", () => {
  test("de-duplicated, in order, nothing missing, nothing doubled", () => {
    const all = generateLedger(7);
    const layout = LAYOUTS[0] as Layout; // header, signed, balance, ISO dates
    const first = all.slice(0, 120);
    const second = all.slice(90);
    const overlap = 120 - 90;
    const a = importCsv(renderCsv(first, layout), layout);
    const b = importCsv(renderCsv(second, layout), layout);
    expect(reconcile(a).status).toBe("verified");
    expect(reconcile(b).status).toBe("verified");

    const merged = buildLedger([a, b]);
    expect(merged.duplicatesRemoved).toBe(overlap);
    expect(merged.missingMonths).toEqual([]);
    expect(
      merged.transactions.map((t) => [
        t.date,
        t.description,
        t.amount,
        t.balanceAfter,
      ]),
    ).toEqual(all.map((e) => [e.date, e.description, e.amount, e.balance]));
  });

  test("a file that skips months leaves them reported", () => {
    const all = generateLedger(7);
    const layout = LAYOUTS[0] as Layout;
    const q1 = all.filter((e) => e.date < "2025-04");
    const q4 = all.filter((e) => e.date >= "2025-10");
    const merged = buildLedger([
      importCsv(renderCsv(q1, layout), layout),
      importCsv(renderCsv(q4, layout), layout),
    ]);
    expect(merged.missingMonths).toEqual([
      "2025-04",
      "2025-05",
      "2025-06",
      "2025-07",
      "2025-08",
      "2025-09",
    ]);
  });
});
