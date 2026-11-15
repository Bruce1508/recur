import { describe, expect, test } from "vitest";
import { reconcile } from "./reconcile";
import type { Cents, ParsedStatement, Transaction } from "./types";

// ADR-020. Invented data only. A PDF statement prints a balance on the last row of each day.
type Day = Cents[];

const OPEN = 100000;
// Four days, eleven rows. Day 2 holds a charge and its reversal, as real statements do.
const DAYS: Day[] = [
  [-450, 120000, -90000],
  [-1299, -2500, 2500],
  [5000, -777],
  [-10000, -3000, 15000, -61],
];

type Build = {
  open?: Cents;
  kind?: ParsedStatement["kind"];
  /** Which rows keep their balance. Default: the last row of each day. */
  balances?: "daily" | "none" | "every" | "daily-but-last";
  anchors?: "both" | "totals" | "closing" | "none";
  required?: ParsedStatement["requiredAnchors"];
};

function pdf(days: Day[] = DAYS, o: Build = {}): ParsedStatement {
  const id = "pdf-test";
  const open = o.open ?? OPEN;
  const step = o.kind === "credit" ? -1 : 1;
  const balancesMode = o.balances ?? "daily";
  const transactions: Transaction[] = [];
  let balance = open;
  let withdrawals = 0;
  let deposits = 0;
  let n = 0;
  days.forEach((day, d) => {
    day.forEach((amount, i) => {
      balance += step * amount;
      if (amount < 0) withdrawals -= amount;
      else deposits += amount;
      const last = i === day.length - 1;
      const keep =
        balancesMode === "every" ||
        (balancesMode === "daily" && last) ||
        (balancesMode === "daily-but-last" && last && d < days.length - 1);
      transactions.push({
        id: `${id}:${n}`,
        date: `2026-01-${String(d + 1).padStart(2, "0")}`,
        description: "X",
        amount,
        ...(keep ? { balanceAfter: balance } : {}),
        source: { statementId: id, input: "pdf", page: 1, lineIndex: n },
      });
      n++;
    });
  });
  const anchors = o.anchors ?? "both";
  return {
    id,
    input: "pdf",
    bankId: "td",
    kind: o.kind ?? "deposit",
    period: { start: "2026-01-01", end: "2026-01-31" },
    openingBalance: open,
    ...(anchors === "both" || anchors === "closing"
      ? { closingBalance: balance }
      : {}),
    ...(anchors === "both" || anchors === "totals"
      ? { printedTotals: { withdrawals, deposits } }
      : {}),
    ...(o.required === undefined ? {} : { requiredAnchors: o.required }),
    transactions,
    warnings: [],
  };
}

const withRows = (
  s: ParsedStatement,
  f: (t: readonly Transaction[]) => Transaction[],
): ParsedStatement => ({ ...s, transactions: f(s.transactions) });

const total = DAYS.flat().length;

describe("reconcile: checkpoints (PDF)", () => {
  test("a correct statement with a balance on the last row of each day verifies", () => {
    expect(reconcile(pdf())).toEqual({
      status: "verified",
      method: "checkpoints",
    });
  });

  test("a PDF statement with a balance on every row also gets the anchors and the first-row check", () => {
    expect(reconcile(pdf(DAYS, { balances: "every" }))).toEqual({
      status: "verified",
      method: "checkpoints",
    });
  });

  test("a credit account counts a purchase as a rise in the balance", () => {
    const s = pdf(DAYS, { kind: "credit" });
    expect(reconcile(s)).toEqual({ status: "verified", method: "checkpoints" });
    // The same figures read as a deposit account no longer add up.
    expect(reconcile({ ...s, kind: "deposit" }).status).toBe("mismatch");
  });

  describe("mutations: any one row removed, altered or added is a mismatch (AC-2)", () => {
    test.each(Array.from({ length: total }, (_, i) => i))(
      "row %i removed",
      (i) => {
        const s = withRows(pdf(), (t) => t.filter((_, k) => k !== i));
        expect(reconcile(s).status).toBe("mismatch");
      },
    );

    test.each(Array.from({ length: total }, (_, i) => i))(
      "row %i altered by one cent",
      (i) => {
        const s = withRows(pdf(), (t) =>
          t.map((r, k) => (k === i ? { ...r, amount: r.amount + 1 } : r)),
        );
        expect(reconcile(s).status).toBe("mismatch");
      },
    );

    test.each(Array.from({ length: total + 1 }, (_, i) => i))(
      "a row added at position %i",
      (i) => {
        const extra: Transaction = {
          id: "pdf-test:extra",
          date: "2026-01-02",
          description: "X",
          amount: -100,
          source: {
            statementId: "pdf-test",
            input: "pdf",
            page: 1,
            lineIndex: 99,
          },
        };
        const s = withRows(pdf(), (t) => [
          ...t.slice(0, i),
          extra,
          ...t.slice(i),
        ]);
        expect(reconcile(s).status).toBe("mismatch");
      },
    );

    test("the mismatch names the checkpoint row of the broken segment and its balances", () => {
      // Row 4 is in day 2; day 2 ends at row 5 (lineIndex 5), which carries the balance.
      const s = withRows(pdf(), (t) =>
        t.map((r, k) => (k === 4 ? { ...r, amount: r.amount - 700 } : r)),
      );
      const r = reconcile(s);
      expect(r).toMatchObject({
        status: "mismatch",
        firstBadSource: { input: "pdf", lineIndex: 5 },
      });
      if (r.status === "mismatch") expect(r.expected - r.actual).toBe(-700);
    });

    test("removing the first row is caught because the opening balance is a checkpoint", () => {
      const s = withRows(pdf(), (t) => t.slice(1));
      expect(reconcile(s).status).toBe("mismatch");
    });
  });

  describe("a statement cut short is never verified", () => {
    const lastDay = DAYS.length - 1;
    const cut = (s: ParsedStatement) =>
      withRows(s, (t) => t.slice(0, t.length - (DAYS[lastDay]?.length ?? 0)));

    test("the last day lost at a day boundary: printed totals catch it", () => {
      expect(reconcile(cut(pdf())).status).toBe("mismatch");
    });

    test("the last day lost: the closing balance alone catches it", () => {
      expect(reconcile(cut(pdf(DAYS, { anchors: "closing" }))).status).toBe(
        "mismatch",
      );
    });

    test("the last day lost and no anchor at all: unverifiable, never verified", () => {
      expect(reconcile(cut(pdf(DAYS, { anchors: "none" })))).toMatchObject({
        status: "unverifiable",
      });
    });

    test("a correct chain with no end anchor is unverifiable, not verified", () => {
      expect(reconcile(pdf(DAYS, { anchors: "none" })).status).toBe(
        "unverifiable",
      );
    });

    test("a required anchor that is missing is unverifiable even when another anchor is present", () => {
      expect(
        reconcile(
          pdf(DAYS, { anchors: "closing", required: ["printedTotals"] }),
        ),
      ).toMatchObject({ status: "unverifiable" });
      expect(
        reconcile(
          pdf(DAYS, { anchors: "totals", required: ["closingBalance"] }),
        ),
      ).toMatchObject({ status: "unverifiable" });
    });

    test("a required anchor that is present and agrees verifies", () => {
      expect(
        reconcile(
          pdf(DAYS, {
            anchors: "both",
            required: ["printedTotals", "closingBalance"],
          }),
        ),
      ).toEqual({ status: "verified", method: "checkpoints" });
    });
  });

  describe("rows after the last printed balance", () => {
    test("are covered by the anchors: correct verifies, altered is a mismatch", () => {
      const ok = pdf(DAYS, { balances: "daily-but-last" });
      expect(reconcile(ok)).toEqual({
        status: "verified",
        method: "checkpoints",
      });
      const bad = withRows(ok, (t) =>
        t.map((r, k) =>
          k === t.length - 1 ? { ...r, amount: r.amount + 1 } : r,
        ),
      );
      expect(reconcile(bad).status).toBe("mismatch");
    });

    test("with no anchor they leave the statement unverifiable", () => {
      expect(
        reconcile(pdf(DAYS, { balances: "daily-but-last", anchors: "none" })),
      ).toMatchObject({ status: "unverifiable" });
    });
  });

  describe("each anchor is checked on its own", () => {
    test("printed withdrawals that differ by one cent are a mismatch", () => {
      const s = pdf();
      const t = s.printedTotals;
      if (!t) throw new Error("test setup");
      const r = reconcile({
        ...s,
        printedTotals: { ...t, withdrawals: t.withdrawals + 1 },
      });
      expect(r).toMatchObject({ status: "mismatch" });
      if (r.status === "mismatch") expect(r.actual - r.expected).toBe(1);
    });

    test("printed deposits that differ by one cent are a mismatch", () => {
      const s = pdf();
      const t = s.printedTotals;
      if (!t) throw new Error("test setup");
      expect(
        reconcile({
          ...s,
          printedTotals: { ...t, deposits: t.deposits - 1 },
        }).status,
      ).toBe("mismatch");
    });

    test("a closing balance that differs by one cent is a mismatch", () => {
      const s = pdf();
      expect(
        reconcile({ ...s, closingBalance: (s.closingBalance ?? 0) + 1 }).status,
      ).toBe("mismatch");
    });
  });

  describe("fails closed", () => {
    test("a PDF statement with no parsed opening balance is unverifiable, even with a balance on every row", () => {
      const { openingBalance: _drop, ...rest } = pdf(DAYS, {
        balances: "every",
      });
      expect(reconcile(rest)).toMatchObject({ status: "unverifiable" });
    });

    test("any warning makes a statement that otherwise checks out unverifiable", () => {
      expect(
        reconcile({ ...pdf(), warnings: ["a page was not read"] }),
      ).toMatchObject({ status: "unverifiable" });
    });

    test("a mismatch is reported even when there are warnings", () => {
      const s = withRows(pdf(), (t) => t.slice(1));
      expect(
        reconcile({ ...s, warnings: ["a page was not read"] }).status,
      ).toBe("mismatch");
    });

    test("dates that go backwards are unverifiable", () => {
      const s = pdf();
      const first = s.transactions[0];
      const last = s.transactions[s.transactions.length - 1];
      if (!first || !last) throw new Error("test setup");
      const swapped = withRows(s, (t) =>
        t.map((r, k) =>
          k === 0
            ? { ...r, date: last.date }
            : k === t.length - 1
              ? { ...r, date: first.date }
              : r,
        ),
      );
      expect(reconcile(swapped)).toMatchObject({ status: "unverifiable" });
    });
  });

  describe("totals method: an opening balance and no balance on any row", () => {
    const bare = (o: Build = {}) => pdf(DAYS, { balances: "none", ...o });

    test("verifies when the printed totals and the closing balance agree", () => {
      expect(reconcile(bare())).toEqual({
        status: "verified",
        method: "totals",
      });
    });

    test("any one row removed or altered is a mismatch", () => {
      for (let i = 0; i < total; i++) {
        expect(
          reconcile(withRows(bare(), (t) => t.filter((_, k) => k !== i)))
            .status,
        ).toBe("mismatch");
        expect(
          reconcile(
            withRows(bare(), (t) =>
              t.map((r, k) => (k === i ? { ...r, amount: r.amount + 1 } : r)),
            ),
          ).status,
        ).toBe("mismatch");
      }
    });

    test("without an anchor it is unverifiable", () => {
      expect(reconcile(bare({ anchors: "none" }))).toMatchObject({
        status: "unverifiable",
      });
    });

    test("an empty statement with matching opening and closing balances and zero totals verifies", () => {
      const s = pdf([]);
      expect(reconcile(s)).toEqual({ status: "verified", method: "totals" });
    });
  });

  describe("stated limits (pinned so they cannot change silently)", () => {
    test("two amounts swapped between rows of the same day keep every sum and are not detected", () => {
      const swapped = withRows(pdf(), (t) =>
        t.map((r, k) =>
          k === 0
            ? { ...r, amount: t[1]?.amount ?? 0 }
            : k === 1
              ? { ...r, amount: t[0]?.amount ?? 0 }
              : r,
        ),
      );
      // Rows 0 and 1 are in day 1, whose balance sits on row 2.
      expect(reconcile(swapped)).toEqual({
        status: "verified",
        method: "checkpoints",
      });
    });
  });

  test("the CSV path is unchanged: it ignores the opening balance and the anchors", () => {
    const csv: ParsedStatement = {
      ...pdf(DAYS, { balances: "daily" }),
      input: "csv",
      transactions: pdf(DAYS, { balances: "daily" }).transactions.map(
        (t, i) => ({
          ...t,
          source: {
            statementId: "csv-test",
            input: "csv" as const,
            row: i + 2,
          },
        }),
      ),
    };
    // Not every CSV row has a balance, so the chain cannot be checked.
    expect(reconcile(csv)).toMatchObject({ status: "unverifiable" });
  });
});
