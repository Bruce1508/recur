import { describe, expect, test } from "vitest";
import type { ColumnMapping } from "../types";
import { toStatement } from "./toStatement";

const SIGNED: ColumnMapping = {
  hasHeader: true,
  date: 0,
  dateFormat: "YYYY-MM-DD",
  description: 1,
  amount: { signed: 2 },
  balance: 3,
  confidence: "high",
};

const SPLIT: ColumnMapping = {
  hasHeader: false,
  date: 0,
  dateFormat: "MM/DD/YYYY",
  description: 1,
  amount: { debit: 2, credit: 3 },
  confidence: "high",
};

const OPTS = { kind: "deposit" } as const;

function statement(
  rows: string[][],
  mapping: ColumnMapping,
  opts: Parameters<typeof toStatement>[2] = OPTS,
) {
  const r = toStatement(rows, mapping, opts);
  if (!r.ok) throw new Error(`expected ok, got: ${r.reason}`);
  return r.statement;
}

const SIGNED_ROWS = [
  ["Date", "Description", "Amount", "Balance"],
  ["2026-01-05", "  COFFEE   SHOP ", "-4.50", "995.50"],
  ["2026-01-06", "PAYROLL", "1,200.00", "2,195.50"],
  ["2026-01-07", "RENT", "(900.00)", "1295.50"],
];

describe("toStatement", () => {
  test("signed amounts, balances, header skipped, whitespace collapsed", () => {
    const s = statement(SIGNED_ROWS, SIGNED);
    expect(
      s.transactions.map((t) => [t.date, t.description, t.amount]),
    ).toEqual([
      ["2026-01-05", "COFFEE SHOP", -450],
      ["2026-01-06", "PAYROLL", 120000],
      ["2026-01-07", "RENT", -90000],
    ]);
    expect(s.transactions.map((t) => t.balanceAfter)).toEqual([
      99550, 219550, 129550,
    ]);
    expect(s.warnings).toEqual([]);
    expect(s.input).toBe("csv");
    expect(s.kind).toBe("deposit");
    expect(s.bankId).toBe("unknown");
    expect(s.period).toEqual({ start: "2026-01-05", end: "2026-01-07" });
  });

  test("cross-field invariants: ids, source rows, period order", () => {
    const s = statement(SIGNED_ROWS, SIGNED);
    expect(s.period.start <= s.period.end).toBe(true);
    for (const [i, t] of s.transactions.entries()) {
      expect(t.source).toEqual({
        statementId: s.id,
        input: "csv",
        row: i + 2, // 1-based, header is row 1
      });
      expect(t.id).toBe(`${s.id}:${i + 2}`);
    }
    expect(new Set(s.transactions.map((t) => t.id)).size).toBe(3);
  });

  test("the statement id is stable for the same rows and differs for different rows", () => {
    const a = statement(SIGNED_ROWS, SIGNED).id;
    expect(statement(SIGNED_ROWS, SIGNED).id).toBe(a);
    const changed = SIGNED_ROWS.map((r) => [...r]);
    (changed[1] as string[])[2] = "-4.51";
    expect(statement(changed, SIGNED).id).not.toBe(a);
  });

  test("debit and credit columns: debit out, credit in, no header", () => {
    const s = statement(
      [
        ["01/15/2026", "COFFEE", "4.50", ""],
        ["01/16/2026", "PAYROLL", "", "1200.00"],
      ],
      SPLIT,
    );
    expect(s.transactions.map((t) => t.amount)).toEqual([-450, 120000]);
    expect(s.transactions[0]?.source).toMatchObject({ row: 1 });
    expect(s.transactions[0]?.balanceAfter).toBeUndefined();
  });

  test("never produces negative zero", () => {
    const s = statement(
      [
        ["2026-01-05", "ADJUST", "0.00", "10.00"],
        ["2026-01-06", "ADJUST", "-0.00", "10.00"],
      ],
      { ...SIGNED, hasHeader: false },
      { kind: "deposit", negateSigned: true },
    );
    for (const t of s.transactions) expect(Object.is(t.amount, -0)).toBe(false);
    const split = statement([["01/15/2026", "ADJUST", "0.00", ""]], SPLIT);
    expect(Object.is(split.transactions[0]?.amount, -0)).toBe(false);
  });

  test("negateSigned flips a signed column (card export where purchases are positive)", () => {
    const s = statement(
      [
        ["2026-01-05", "COFFEE", "4.50", "4.50"],
        ["2026-01-06", "PAYMENT", "-4.50", "0.00"],
      ],
      { ...SIGNED, hasHeader: false },
      { kind: "credit", negateSigned: true },
    );
    expect(s.kind).toBe("credit");
    expect(s.transactions.map((t) => t.amount)).toEqual([-450, 450]);
  });

  test("a blank description is kept as an empty string with no warning (pinned)", () => {
    const s = statement(
      [
        ["2026-01-05", "", "-1.00", "5.00"],
        ["2026-01-06", "OK", "-1.00", "4.00"],
      ],
      { ...SIGNED, hasHeader: false },
    );
    expect(s.transactions.map((t) => t.description)).toEqual(["", "OK"]);
    expect(s.warnings).toEqual([]);
  });

  describe("bad rows become warnings, never guessed values", () => {
    test("unreadable date, amount, or both debit and credit filled", () => {
      const s = statement(
        [
          ["Date", "Description", "Amount", "Balance"],
          ["2026-13-45", "BAD DATE", "-1.00", "1.00"],
          ["2026-01-05", "BAD AMOUNT", "abc", "1.00"],
          ["2026-01-06", "GOOD", "-2.00", "3.00"],
        ],
        SIGNED,
      );
      expect(s.transactions).toHaveLength(1);
      expect(s.transactions[0]?.description).toBe("GOOD");
      expect(s.warnings).toHaveLength(2);
      expect(s.warnings[0]).toMatch(/row 2.*date/i);
      expect(s.warnings[1]).toMatch(/row 3.*amount/i);
    });

    test("debit and credit both filled, both empty, or negative", () => {
      const s = statement(
        [
          ["01/15/2026", "BOTH", "1.00", "2.00"],
          ["01/16/2026", "NONE", "", ""],
          ["01/17/2026", "NEG", "-1.00", ""],
          ["01/18/2026", "OK", "1.00", ""],
        ],
        SPLIT,
      );
      expect(s.transactions.map((t) => t.description)).toEqual(["OK"]);
      expect(s.warnings).toHaveLength(3);
    });

    test("an unreadable balance keeps the transaction without balanceAfter and warns", () => {
      const s = statement(
        [
          ["2026-01-05", "A", "-1.00", "oops"],
          ["2026-01-06", "B", "-1.00", "5.00"],
        ],
        { ...SIGNED, hasHeader: false },
      );
      expect(s.transactions).toHaveLength(2);
      expect(s.transactions[0]?.balanceAfter).toBeUndefined();
      expect(s.transactions[1]?.balanceAfter).toBe(500);
      expect(s.warnings).toHaveLength(1);
    });

    test("warnings name the row and field but never echo cell contents", () => {
      const s = statement(
        [
          ["2026-01-05", "SECRETMERCHANT", "SECRETAMOUNT", ""],
          ["2026-01-06", "OK", "-1.00", ""],
        ],
        { ...SIGNED, hasHeader: false },
      );
      expect(s.warnings.join(" ")).not.toMatch(/SECRET/);
    });
  });

  describe("fails closed", () => {
    test("no row converts", () => {
      const r = toStatement(
        [
          ["Date", "Description", "Amount", "Balance"],
          ["nope", "X", "-1.00", ""],
        ],
        SIGNED,
        OPTS,
      );
      expect(r.ok).toBe(false);
    });

    test("header only", () => {
      expect(toStatement([SIGNED_ROWS[0] ?? []], SIGNED, OPTS).ok).toBe(false);
    });

    test("a row too short for the mapping", () => {
      const s = statement(
        [
          ["2026-01-05", "SHORT"],
          ["2026-01-06", "OK", "-1.00", "5.00"],
        ],
        { ...SIGNED, hasHeader: false },
      );
      expect(s.transactions).toHaveLength(1);
      expect(s.warnings).toHaveLength(1);
    });
  });
});
