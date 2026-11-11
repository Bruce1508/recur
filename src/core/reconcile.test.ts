import { describe, expect, test } from "vitest";
import { reconcile } from "./reconcile";
import type { Cents, ParsedStatement, Transaction } from "./types";

type Row = { amount: Cents; balance?: Cents };

/** File order = array order. Row numbers start at 2 (row 1 is a header). */
function statement(
  rows: Row[],
  extra: Partial<Pick<ParsedStatement, "kind" | "warnings">> = {},
  dates?: string[],
): ParsedStatement {
  const id = "csv-test";
  const transactions: Transaction[] = rows.map((r, i) => ({
    id: `${id}:${i + 2}`,
    date: dates?.[i] ?? "2026-01-05",
    description: "X",
    amount: r.amount,
    ...(r.balance === undefined ? {} : { balanceAfter: r.balance }),
    source: { statementId: id, input: "csv", row: i + 2 },
  }));
  return {
    id,
    input: "csv",
    bankId: "unknown",
    kind: "deposit",
    period: { start: "2026-01-05", end: "2026-01-05" },
    transactions,
    warnings: [],
    ...extra,
  };
}

/** Oldest-first deposit rows with a correct running balance starting from `open`. */
function chain(amounts: Cents[], open = 100000, sign = 1): Row[] {
  let b = open;
  return amounts.map((amount) => {
    b += sign * amount;
    return { amount, balance: b };
  });
}

const AMOUNTS = [-450, 120000, -90000, -1299, -2500, 5000, -777, -10000];

describe("reconcile: running balance", () => {
  test("oldest-first file verifies", () => {
    expect(reconcile(statement(chain(AMOUNTS)))).toEqual({
      status: "verified",
      method: "running-balance",
    });
  });

  test("newest-first file verifies", () => {
    expect(reconcile(statement(chain(AMOUNTS).reverse()))).toEqual({
      status: "verified",
      method: "running-balance",
    });
  });

  test("credit card: the balance is the amount owed, so purchases raise it", () => {
    const rows = chain([-450, -2000, 2450], 0, -1); // two purchases, then a payment
    expect(rows.map((r) => r.balance)).toEqual([450, 2450, 0]);
    expect(reconcile(statement(rows, { kind: "credit" })).status).toBe(
      "verified",
    );
    // The same rows read as a deposit account do not reconcile.
    expect(reconcile(statement(rows)).status).toBe("mismatch");
  });

  test("a wrong sign on every amount is a mismatch, not a silent verify", () => {
    const flipped = chain(AMOUNTS).map((r) => ({ ...r, amount: -r.amount }));
    expect(reconcile(statement(flipped)).status).toBe("mismatch");
  });

  describe("mutations (AC-2) flip to mismatch and name the row", () => {
    // The first row's own amount and the two ends of the file are not covered by any
    // transition, see the "known limits" tests below.
    for (let i = 1; i < AMOUNTS.length; i++) {
      test(`altering the amount of row ${i + 1} by one cent`, () => {
        const rows = chain(AMOUNTS);
        rows[i] = { ...rows[i], amount: (rows[i]?.amount ?? 0) + 1 };
        const r = reconcile(statement(rows));
        expect(r.status).toBe("mismatch");
        if (r.status === "mismatch") {
          expect(r.firstBadRow).toBe(i + 2);
          expect(r.actual - r.expected).toBe(-1);
        }
      });
    }

    for (let i = 1; i < AMOUNTS.length - 1; i++) {
      test(`removing row ${i + 2} from the middle`, () => {
        const rows = chain(AMOUNTS);
        rows.splice(i, 1);
        expect(reconcile(statement(rows)).status).toBe("mismatch");
      });
    }

    test("the same alteration in a newest-first file", () => {
      const rows = chain(AMOUNTS).reverse();
      const i = 3;
      rows[i] = { ...rows[i], amount: (rows[i]?.amount ?? 0) + 1 };
      const r = reconcile(statement(rows));
      expect(r.status).toBe("mismatch");
      if (r.status === "mismatch") expect(r.firstBadRow).toBe(i + 2);
    });
  });

  describe("known limits of one file without an opening balance", () => {
    test("removing the first or last row is not detectable", () => {
      expect(reconcile(statement(chain(AMOUNTS).slice(1))).status).toBe(
        "verified",
      );
      expect(reconcile(statement(chain(AMOUNTS).slice(0, -1))).status).toBe(
        "verified",
      );
    });

    test("the first row's own amount is not checked against anything", () => {
      const rows = chain(AMOUNTS);
      rows[0] = { ...rows[0], amount: 999 };
      expect(reconcile(statement(rows)).status).toBe("verified");
    });
  });

  describe("the dates decide the direction", () => {
    const risingDates = (n: number) =>
      Array.from(
        { length: n },
        (_, i) => `2026-01-${String(i + 1).padStart(2, "0")}`,
      );

    test("an altered last row is caught when the dates rise (a purchase and its refund)", () => {
      // Refund of 500 altered to 501. Read newest-first this would pass; the dates forbid that.
      const rows: Row[] = [
        { amount: -500, balance: 9500 },
        { amount: 501, balance: 10000 },
      ];
      const r = reconcile(statement(rows, {}, risingDates(2)));
      expect(r).toEqual({
        status: "mismatch",
        expected: 10001,
        actual: 10000,
        firstBadRow: 3,
      });
    });

    test("alternating amounts with rising dates and an altered last row", () => {
      const rows: Row[] = [
        { amount: -500, balance: 9500 },
        { amount: 500, balance: 10000 },
        { amount: -500, balance: 9500 },
        { amount: 777, balance: 10000 },
      ];
      expect(reconcile(statement(rows, {}, risingDates(4))).status).toBe(
        "mismatch",
      );
    });

    test("falling dates read the file newest-first, and expected/actual belong to the named row", () => {
      // Newest-first rows; row 3's amount is -301 where it should be -300.
      const rows: Row[] = [
        { amount: 200, balance: 8900 },
        { amount: -301, balance: 8700 },
        { amount: -1000, balance: 9000 },
      ];
      const r = reconcile(statement(rows, {}, risingDates(3).reverse()));
      expect(r).toEqual({
        status: "mismatch",
        expected: 8699,
        actual: 8700,
        firstBadRow: 3,
      });
    });

    test("the same rows oldest-first report the same row and the same difference", () => {
      const rows: Row[] = [
        { amount: -1000, balance: 9000 },
        { amount: -301, balance: 8700 },
        { amount: 200, balance: 8900 },
      ];
      const r = reconcile(statement(rows, {}, risingDates(3)));
      expect(r).toEqual({
        status: "mismatch",
        expected: 8699,
        actual: 8700,
        firstBadRow: 3,
      });
    });

    test("a correct file with rising dates and with falling dates verifies", () => {
      expect(
        reconcile(statement(chain(AMOUNTS), {}, risingDates(8))).status,
      ).toBe("verified");
      expect(
        reconcile(
          statement(chain(AMOUNTS).reverse(), {}, risingDates(8).reverse()),
        ).status,
      ).toBe("verified");
    });

    test("a correct oldest-first file whose dates fall is not accepted (order contradicts dates)", () => {
      expect(
        reconcile(statement(chain(AMOUNTS), {}, risingDates(8).reverse()))
          .status,
      ).toBe("mismatch");
    });

    test("dates in no order are unverifiable", () => {
      const dates = [
        "2026-01-03",
        "2026-01-01",
        "2026-01-02",
        "2026-01-04",
        "2026-01-05",
        "2026-01-06",
        "2026-01-07",
        "2026-01-08",
      ];
      const r = reconcile(statement(chain(AMOUNTS), {}, dates));
      expect(r.status).toBe("unverifiable");
      if (r.status === "unverifiable") expect(r.reason).toMatch(/date order/i);
    });
  });

  test("all-zero amounts fit both directions and verify", () => {
    const rows = [0, 0, 0].map(() => ({ amount: 0, balance: 500 }));
    expect(reconcile(statement(rows)).status).toBe("verified");
  });

  test("a pdf-sourced mismatch has no firstBadRow", () => {
    const s = statement(chain(AMOUNTS));
    const txs = s.transactions.map((t, i) => ({
      ...t,
      amount: i === 3 ? t.amount + 1 : t.amount,
      source: {
        statementId: s.id,
        input: "pdf" as const,
        page: 1,
        lineIndex: i,
      },
    }));
    const r = reconcile({ ...s, transactions: txs });
    expect(r.status).toBe("mismatch");
    if (r.status === "mismatch") expect(r.firstBadRow).toBeUndefined();
  });
});

describe("reconcile: unverifiable, never verified", () => {
  test("no balance column", () => {
    const r = reconcile(statement(AMOUNTS.map((amount) => ({ amount }))));
    expect(r).toMatchObject({ status: "unverifiable" });
    if (r.status === "unverifiable") expect(r.reason).toMatch(/no balances/i);
  });

  test("some rows have no balance", () => {
    const rows = chain(AMOUNTS);
    rows[2] = { amount: rows[2]?.amount ?? 0 };
    const r = reconcile(statement(rows));
    expect(r.status).toBe("unverifiable");
  });

  test("fewer than two rows", () => {
    expect(reconcile(statement([])).status).toBe("unverifiable");
    expect(reconcile(statement(chain([-450]))).status).toBe("unverifiable");
  });

  test("balances agree but rows were skipped while converting", () => {
    const r = reconcile(
      statement(chain(AMOUNTS), {
        warnings: ["Row 9: unreadable date; row skipped"],
      }),
    );
    expect(r.status).toBe("unverifiable");
    if (r.status === "unverifiable") expect(r.reason).toMatch(/1 row/i);
  });

  test("a mismatch is reported even when there are also warnings", () => {
    const rows = chain(AMOUNTS);
    rows[3] = { ...rows[3], amount: (rows[3]?.amount ?? 0) + 1 };
    expect(reconcile(statement(rows, { warnings: ["w"] })).status).toBe(
      "mismatch",
    );
  });
});
