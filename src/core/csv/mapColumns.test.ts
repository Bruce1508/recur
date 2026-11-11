import { describe, expect, test } from "vitest";
import { mapColumns } from "./mapColumns";

function mapping(rows: string[][]) {
  const r = mapColumns(rows);
  if (!r.ok) throw new Error(`expected ok, got: ${r.reason}`);
  return r.mapping;
}

function reason(rows: string[][]): string {
  const r = mapColumns(rows);
  if (r.ok) throw new Error("expected a failure");
  return r.reason;
}

describe("mapColumns", () => {
  test("header, one signed amount, and a balance that continues row to row", () => {
    expect(
      mapping([
        ["Date", "Description", "Amount", "Balance"],
        ["2026-01-05", "COFFEE", "-4.50", "995.50"],
        ["2026-01-06", "PAYROLL", "1200.00", "2195.50"],
        ["2026-01-07", "RENT", "-900.00", "1295.50"],
      ]),
    ).toEqual({
      hasHeader: true,
      date: 0,
      dateFormat: "YYYY-MM-DD",
      description: 1,
      amount: { signed: 2 },
      balance: 3,
      confidence: "high",
    });
  });

  test("no header, debit and credit columns with empty cells, balance verified", () => {
    expect(
      mapping([
        ["01/15/2026", "COFFEE", "4.50", "", "995.50"],
        ["01/16/2026", "PAYROLL", "", "1200.00", "2195.50"],
        ["01/27/2026", "RENT", "900.00", "", "1295.50"],
      ]),
    ).toEqual({
      hasHeader: false,
      date: 0,
      dateFormat: "MM/DD/YYYY",
      description: 1,
      amount: { debit: 2, credit: 3 },
      balance: 4,
      confidence: "high",
    });
  });

  test("newest-first order still finds the balance", () => {
    const m = mapping([
      ["Date", "Description", "Amount", "Balance"],
      ["2026-01-07", "RENT", "-900.00", "1295.50"],
      ["2026-01-06", "PAYROLL", "1200.00", "2195.50"],
      ["2026-01-05", "COFFEE", "-4.50", "995.50"],
    ]);
    expect(m.balance).toBe(3);
    expect(m.confidence).toBe("high");
  });

  test("an unambiguous day-first file is read as DD/MM/YYYY", () => {
    const m = mapping([
      ["15/01/2026", "COFFEE", "-4.50"],
      ["16/01/2026", "PAYROLL", "1200.00"],
    ]);
    expect(m.dateFormat).toBe("DD/MM/YYYY");
    expect(m.confidence).toBe("high");
  });

  test("dates that fit both day-first and month-first are low confidence", () => {
    const m = mapping([
      ["01/02/2026", "COFFEE", "-4.50"],
      ["03/04/2026", "PAYROLL", "1200.00"],
    ]);
    expect(m.confidence).toBe("low");
  });

  test("debit and credit with a header but no balance: labels decide the order", () => {
    const m = mapping([
      ["Date", "Description", "Credit", "Debit"],
      ["2026-01-05", "COFFEE", "", "4.50"],
      ["2026-01-06", "PAYROLL", "1200.00", ""],
    ]);
    expect(m.amount).toEqual({ debit: 3, credit: 2 });
    expect(m.confidence).toBe("high");
    expect(m.balance).toBeUndefined();
  });

  test("debit and credit with no header and no balance cannot tell which is which", () => {
    const m = mapping([
      ["2026-01-05", "COFFEE", "", "4.50"],
      ["2026-01-06", "PAYROLL", "1200.00", ""],
    ]);
    expect(m.confidence).toBe("low");
  });

  test("a signed amount whose balance moves the other way is low confidence", () => {
    // Positive amounts lower the balance (available credit). The mapping has no sign field,
    // so toStatement cannot know the convention unless the user confirms.
    const m = mapping([
      ["Date", "Description", "Amount", "Balance"],
      ["2026-01-05", "COFFEE", "4.50", "995.50"],
      ["2026-01-06", "BOOKS", "20.00", "975.50"],
      ["2026-01-07", "PAYMENT", "-24.50", "1000.00"],
    ]);
    expect(m.balance).toBe(3);
    expect(m.confidence).toBe("low");
  });

  test("debit and credit with a liability balance keep the header order, not the balance sign", () => {
    // Card export: a debit raises the amount owed, so the balance moves with the debit column.
    const m = mapping([
      ["Date", "Description", "Debit", "Credit", "Balance"],
      ["2026-01-05", "COFFEE", "4.50", "", "4.50"],
      ["2026-01-06", "BOOKS", "20.00", "", "24.50"],
      ["2026-01-07", "PAYMENT", "", "24.50", "0.00"],
    ]);
    expect(m.amount).toEqual({ debit: 2, credit: 3 });
    expect(m.balance).toBe(4);
    expect(m.confidence).toBe("high");
  });

  test("debit and credit with a reversed balance sign and no labels is low confidence", () => {
    const m = mapping([
      ["2026-01-05", "COFFEE", "4.50", "", "4.50"],
      ["2026-01-06", "BOOKS", "20.00", "", "24.50"],
      ["2026-01-07", "PAYMENT", "", "24.50", "0.00"],
    ]);
    expect(m.balance).toBe(4);
    expect(m.confidence).toBe("low");
  });

  test("a Debit or Credit column whose partner is empty in every row is low confidence", () => {
    const rows = [
      ["Date", "Description", "Debit", "Credit"],
      ["2026-01-02", "COFFEE", "4.50", ""],
      ["2026-01-03", "BOOKS", "12.00", ""],
    ];
    expect(mapping(rows).confidence).toBe("low");
  });

  test("the same with a balance column", () => {
    const m = mapping([
      ["Date", "Description", "Debit", "Credit", "Balance"],
      ["2026-01-02", "COFFEE", "4.50", "", "95.50"],
      ["2026-01-03", "BOOKS", "12.00", "", "83.50"],
    ]);
    expect(m.confidence).toBe("low");
  });

  test("two numeric columns that are not debit and credit and do not reconcile are low confidence", () => {
    const m = mapping([
      ["2026-01-05", "COFFEE", "10.00", "99.00"],
      ["2026-01-06", "PAYROLL", "20.00", "7.00"],
    ]);
    expect(m.confidence).toBe("low");
  });

  test("two text columns: the longer one is the description, and the guess is low confidence", () => {
    const m = mapping([
      ["2026-01-05", "COFFEE SHOP #14", "Purchase", "-4.50"],
      ["2026-01-06", "PAYROLL ACME INC", "Deposit", "1200.00"],
    ]);
    expect(m.description).toBe(1);
    expect(m.confidence).toBe("low");
  });

  test("a trailing empty column is ignored", () => {
    const m = mapping([
      ["2026-01-05", "COFFEE", "-4.50", ""],
      ["2026-01-06", "PAYROLL", "1200.00", ""],
    ]);
    expect(m.amount).toEqual({ signed: 2 });
    expect(m.confidence).toBe("high");
  });

  describe("fails closed", () => {
    test("rows of different widths", () => {
      expect(
        reason([
          ["2026-01-05", "COFFEE", "-4.50"],
          ["2026-01-06", "PAYROLL"],
        ]),
      ).toMatch(/row 2/i);
    });

    test("decimal-comma amounts are refused, not read as thousands", () => {
      expect(
        reason([
          ["05/01/2026", "CAFE", "-4,50"],
          ["06/01/2026", "PAIE", "1200,00"],
        ]),
      ).toMatch(/decimal comma/i);
    });

    test("no rows", () => {
      expect(reason([])).toMatch(/no rows/i);
    });

    test("a header and nothing else", () => {
      expect(reason([["Date", "Description", "Amount"]])).toMatch(
        /no transactions/i,
      );
    });

    test("no date column", () => {
      expect(
        reason([
          ["COFFEE", "-4.50"],
          ["PAYROLL", "1200.00"],
        ]),
      ).toMatch(/date/i);
    });

    test("a date column with a gap is not accepted", () => {
      expect(
        reason([
          ["2026-01-05", "COFFEE", "-4.50"],
          ["", "PAYROLL", "1200.00"],
        ]),
      ).toMatch(/date/i);
    });

    test("no amount column", () => {
      expect(
        reason([
          ["2026-01-05", "COFFEE"],
          ["2026-01-06", "PAYROLL"],
        ]),
      ).toMatch(/amount/i);
    });

    test("three numeric columns that do not reconcile", () => {
      expect(
        reason([
          ["2026-01-05", "COFFEE", "1.00", "2.00", "3.00"],
          ["2026-01-06", "PAYROLL", "4.00", "5.00", "6.00"],
        ]),
      ).toMatch(/numeric columns/i);
    });

    test("no description column", () => {
      expect(
        reason([
          ["2026-01-05", "-4.50"],
          ["2026-01-06", "1200.00"],
        ]),
      ).toMatch(/description/i);
    });
  });
});
