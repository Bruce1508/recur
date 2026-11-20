import fc from "fast-check";
import { describe, expect, test } from "vitest";
import { chainStatements } from "./chain";
import { reconcile } from "./reconcile";
import type { AccountKind, ParsedStatement, Transaction } from "./types";

// Invented data. Day numbers count from 2025-01-01.
const MONTHS = [31, 28, 31, 30, 31, 30];
const date = (n: number) => {
  let d = n;
  for (const [i, len] of MONTHS.entries()) {
    if (d < len)
      return `2025-${String(i + 1).padStart(2, "0")}-${String(d + 1).padStart(2, "0")}`;
    d -= len;
  }
  throw new Error("day out of range");
};

interface Row {
  day: number;
  amount: number;
}
interface Spec {
  id: string;
  input: "csv" | "pdf";
  kind?: AccountKind;
  bankId?: string;
  opening: number;
  rows: Row[];
  start?: number;
  end?: number;
  newestFirst?: boolean;
}

/** Builds a statement whose balances follow the rows; `opening` is the balance before the first row. */
function make(spec: Spec): ParsedStatement {
  const kind = spec.kind ?? "deposit";
  const step = kind === "credit" ? -1 : 1;
  let bal = spec.opening;
  const txs: Transaction[] = spec.rows.map((r, i) => {
    bal += step * r.amount;
    return {
      id: `${spec.id}-${i}`,
      date: date(r.day),
      description: "INVENTED",
      amount: r.amount,
      ...(spec.input === "csv" ? { balanceAfter: bal } : {}),
      source:
        spec.input === "csv"
          ? { statementId: spec.id, input: "csv", row: i + 1 }
          : { statementId: spec.id, input: "pdf", page: 1, lineIndex: i },
    };
  });
  const first = spec.rows[0]?.day ?? 0;
  const last = spec.rows[spec.rows.length - 1]?.day ?? 0;
  return {
    id: spec.id,
    input: spec.input,
    bankId: spec.bankId ?? "unknown",
    kind,
    period: { start: date(spec.start ?? first), end: date(spec.end ?? last) },
    ...(spec.input === "pdf"
      ? { openingBalance: spec.opening, closingBalance: bal }
      : {}),
    transactions: spec.newestFirst ? txs.reverse() : txs,
    warnings: [],
  };
}

const rows = (...a: [number, number][]): Row[] =>
  a.map(([day, amount]) => ({ day, amount }));
const A = rows([0, -500], [3, 2000], [9, -150]); // net 1350
const B = rows([10, -700], [14, -100], [19, 4000]); // net 3200

const csvA = () => make({ id: "a", input: "csv", opening: 10000, rows: A });
const csvB = () => make({ id: "b", input: "csv", opening: 11350, rows: B });
const outcomes = (c: ReturnType<typeof chainStatements>) =>
  c.boundaries.map((b) => b.outcome.status);
const drop = (s: ParsedStatement, i: number): ParsedStatement => ({
  ...s,
  transactions: s.transactions.filter((_, k) => k !== i),
});
const bump = (s: ParsedStatement, i: number, d: number): ParsedStatement => ({
  ...s,
  transactions: s.transactions.map((t, k) =>
    k === i ? { ...t, amount: t.amount + d } : t,
  ),
});

describe("chainStatements", () => {
  test("two adjacent CSVs chain; only the outer ends stay unchecked", () => {
    const c = chainStatements([csvA(), csvB()]);
    expect(outcomes(c)).toEqual(["chained"]);
    expect(c.ends).toEqual({
      a: { start: false, end: true },
      b: { start: true, end: false },
    });
  });

  test.each([
    ["the later file's first row removed", () => [csvA(), drop(csvB(), 0)]],
    ["the earlier file's last row removed", () => [drop(csvA(), 2), csvB()]],
    [
      "the later file's first amount altered",
      () => [csvA(), bump(csvB(), 0, 1)],
    ],
  ])("mismatch when %s, though each file still verifies", (_name, mk) => {
    const pair = mk();
    for (const s of pair) expect(reconcile(s).status).toBe("verified");
    expect(outcomes(chainStatements(pair))).toEqual(["mismatch"]);
  });

  test("the earliest file's first row removed is not seen: it still verifies and its start is unchecked", () => {
    const first = drop(csvA(), 0);
    expect(reconcile(first).status).toBe("verified");
    const c = chainStatements([first, csvB()]);
    expect(outcomes(c)).toEqual(["chained"]);
    expect(c.ends.a?.start).toBe(false);
  });

  test("a newest-first CSV uses its time-order ends", () => {
    const a = make({
      id: "a",
      input: "csv",
      opening: 10000,
      rows: A,
      newestFirst: true,
    });
    expect(outcomes(chainStatements([a, csvB()]))).toEqual(["chained"]);
  });

  test("every date the same: unchainable", () => {
    const flat = make({
      id: "a",
      input: "csv",
      opening: 10000,
      rows: rows([1, -5], [1, -5], [1, -5]),
    });
    const [b] = chainStatements([flat, csvB()]).boundaries;
    expect(b?.outcome.status).toBe("unchainable");
  });

  test("two PDFs sharing the boundary day chain; a dropped middle one is a gap", () => {
    const p1 = make({
      id: "p1",
      input: "pdf",
      opening: 1000,
      rows: rows([0, -100], [9, 500]),
      start: 0,
      end: 9,
    });
    const p2 = make({
      id: "p2",
      input: "pdf",
      opening: 1400,
      rows: rows([9, -50], [18, 200]),
      start: 9,
      end: 18,
    });
    const p3 = make({
      id: "p3",
      input: "pdf",
      opening: 1550,
      rows: rows([19, -50], [30, 25]),
      start: 18,
      end: 30,
    });
    expect(outcomes(chainStatements([p1, p2, p3]))).toEqual([
      "chained",
      "chained",
    ]);
    expect(chainStatements([p1, p2, p3]).ends.p2).toEqual({
      start: true,
      end: true,
    });
    const p4 = make({
      id: "p4",
      input: "pdf",
      opening: 1525,
      rows: rows([40, -50], [50, 25]),
      start: 40,
      end: 50,
    });
    expect(outcomes(chainStatements([p1, p2, p4]))).toEqual(["chained", "gap"]);
  });

  test("CSVs that share a day or overlap are unchainable", () => {
    const shared = make({
      id: "b",
      input: "csv",
      opening: 11350,
      rows: rows([9, -1], [12, -1], [15, -1]),
    });
    expect(outcomes(chainStatements([csvA(), shared]))).toEqual([
      "unchainable",
    ]);
  });

  test("an unverified middle statement makes both its boundaries unchainable", () => {
    const mid = { ...csvB(), warnings: ["x"] };
    const c = chainStatements([
      csvA(),
      mid,
      make({
        id: "c",
        input: "csv",
        opening: 14550,
        rows: rows([20, -1], [25, -1], [29, -1]),
      }),
    ]);
    expect(outcomes(c)).toEqual(["unchainable", "unchainable"]);
  });

  test("mixed kinds or two known banks are unchainable; one unknown bank is not", () => {
    const card = make({
      id: "b",
      input: "csv",
      kind: "credit",
      opening: 11350,
      rows: B,
    });
    expect(outcomes(chainStatements([csvA(), card]))).toEqual(["unchainable"]);
    const td = make({
      id: "a",
      input: "csv",
      bankId: "td",
      opening: 10000,
      rows: A,
    });
    const cibc = make({
      id: "b",
      input: "csv",
      bankId: "cibc",
      opening: 11350,
      rows: B,
    });
    expect(outcomes(chainStatements([td, cibc]))).toEqual(["unchainable"]);
    expect(outcomes(chainStatements([td, csvB()]))).toEqual(["chained"]);
  });

  test("the same id twice counts once", () => {
    expect(outcomes(chainStatements([csvA(), csvA(), csvB()]))).toEqual([
      "chained",
    ]);
  });

  test("a credit account chains with the sign reversed", () => {
    const a = make({
      id: "a",
      input: "csv",
      kind: "credit",
      opening: 5000,
      rows: A,
    });
    const b = make({
      id: "b",
      input: "csv",
      kind: "credit",
      opening: 5000 - 1350,
      rows: B,
    });
    expect(outcomes(chainStatements([a, b]))).toEqual(["chained"]);
  });

  test("a contained statement is judged against the one that contains it", () => {
    const outer = make({
      id: "o",
      input: "pdf",
      opening: 1000,
      rows: rows([0, -100], [28, 500]),
      start: 0,
      end: 28,
    });
    const inner = make({
      id: "i",
      input: "pdf",
      opening: 900,
      rows: rows([5, -10], [10, -10]),
      start: 5,
      end: 10,
    });
    const after = make({
      id: "z",
      input: "pdf",
      opening: 1400,
      rows: rows([29, -1], [35, -1]),
      start: 29,
      end: 35,
    });
    expect(outcomes(chainStatements([outer, inner, after]))).toEqual([
      "unchainable",
      "chained",
    ]);
  });
});

// Random account histories: 2 to 6 contiguous statements, each a CSV or a PDF.
const history = fc
  .record({
    kind: fc.constantFrom<AccountKind>("deposit", "credit"),
    opening: fc.integer({ min: 100000, max: 200000 }),
    parts: fc.array(
      fc.record({
        input: fc.constantFrom<"csv" | "pdf">("csv", "pdf"),
        middle: fc.array(fc.integer({ min: 0, max: 9 }), {
          minLength: 1,
          maxLength: 4,
        }),
        amounts: fc.array(
          fc
            .integer({ min: 1, max: 10000 })
            .chain((n) => fc.boolean().map((neg) => (neg ? -n : n))),
          { minLength: 5, maxLength: 5 },
        ),
      }),
      { minLength: 2, maxLength: 6 },
    ),
  })
  .map(({ kind, opening, parts }) => {
    const step = kind === "credit" ? -1 : 1;
    let bal = opening;
    return parts.map((p, k) => {
      const days = [0, ...[...p.middle].sort((a, b) => a - b), 9].map(
        (d) => d + 10 * k,
      );
      const spec: Spec = {
        id: `s${k}`,
        input: p.input,
        kind,
        opening: bal,
        rows: days.map((day, i) => ({ day, amount: p.amounts[i % 5] ?? 1 })),
        start: 10 * k,
        end: 10 * k + 9,
      };
      for (const r of spec.rows) bal += step * r.amount;
      return spec;
    });
  });

const build = (specs: Spec[]) => specs.map(make);
const clean = (c: ReturnType<typeof chainStatements>) =>
  c.boundaries.every((b) => b.outcome.status === "chained");

describe("chainStatements properties", () => {
  test("an unmutated history chains, with only the outer CSV ends unchecked", () => {
    fc.assert(
      fc.property(history, (specs) => {
        const c = chainStatements(build(specs));
        expect(clean(c)).toBe(true);
        specs.forEach((s, k) => {
          const e = c.ends[s.id];
          expect(e?.start).toBe(!(k === 0 && s.input === "csv"));
          expect(e?.end).toBe(!(k === specs.length - 1 && s.input === "csv"));
        });
      }),
      { numRuns: 100 },
    );
  });

  test("the result does not depend on input order", () => {
    fc.assert(
      fc.property(history, fc.infiniteStream(fc.nat()), (specs, rnd) => {
        const stmts = build(specs);
        const shuffled = [...stmts].sort(() => (rnd.next().value % 3) - 1);
        expect(chainStatements(shuffled)).toEqual(chainStatements(stmts));
      }),
      { numRuns: 100 },
    );
  });

  test("any one-row mutation is caught, except the two outer-end cases, which stay unseen", () => {
    fc.assert(
      fc.property(
        history,
        fc.nat(),
        fc.nat(),
        fc.constantFrom("remove", "amount", "balance"),
        (specs, si, ri, how) => {
          const stmts = build(specs);
          const k = si % stmts.length;
          const target = stmts[k];
          if (!target) return;
          const i = ri % target.transactions.length;
          if (how === "balance" && target.input === "pdf") return;
          const mutated: ParsedStatement = {
            ...target,
            transactions:
              how === "remove"
                ? target.transactions.filter((_, n) => n !== i)
                : target.transactions.map((t, n) =>
                    n !== i
                      ? t
                      : how === "amount"
                        ? { ...t, amount: t.amount + 1 }
                        : { ...t, balanceAfter: (t.balanceAfter ?? 0) + 1 },
                  ),
          };
          const out = stmts.map((s, n) => (n === k ? mutated : s));
          const c = chainStatements(out);
          const detected =
            out.some((s) => reconcile(s).status !== "verified") || !clean(c);
          const last = target.transactions.length - 1;
          const unseen =
            target.input === "csv" &&
            ((k === 0 && i === 0 && how !== "balance") ||
              (k === stmts.length - 1 && i === last && how === "remove"));
          if (unseen) {
            const dates = new Set(mutated.transactions.map((t) => t.date));
            fc.pre(dates.size > 1);
            expect(detected).toBe(false);
          } else {
            expect(detected).toBe(true);
          }
        },
      ),
      { numRuns: 300 },
    );
  });

  test("dropping a middle statement with net movement is never chained over", () => {
    fc.assert(
      fc.property(history, fc.nat(), (specs, m) => {
        fc.pre(specs.length >= 3);
        const stmts = build(specs);
        const k = 1 + (m % (stmts.length - 2));
        const dropped = stmts[k];
        const net = dropped?.transactions.reduce((n, t) => n + t.amount, 0);
        fc.pre(net !== 0);
        const c = chainStatements(stmts.filter((_, n) => n !== k));
        expect(c.boundaries[k - 1]?.outcome.status).toBe("gap");
      }),
      { numRuns: 100 },
    );
  });
});
