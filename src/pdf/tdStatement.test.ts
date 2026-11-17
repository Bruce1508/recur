import { describe, expect, test } from "vitest";
import { makeTextPdf, type PdfSpec } from "../../tools/makePdf";
import {
  formatAmount,
  makeTdStatement,
  type TdSpec,
} from "../../tools/makeTdStatement";
import { detect } from "../core/detect";
import { normalize } from "../core/normalize/normalize";
import { parse } from "../core/parse/parse";
import { reconcile } from "../core/reconcile";
import { extractPdf } from "./extract";

// Invented data. The golden test runs the whole PDF path: generated PDF, extractPdf, normalize,
// detect, parse, reconcile. The mutation tests damage the generated page and expect reconcile to
// notice (AC-2).

const SPEC: TdSpec = {
  period: "SEP 01/25 - OCT 01/25",
  opening: 100000,
  slotsPerPage: 7, // forces a second page, with a repeated header
  days: [
    {
      date: "SEP02",
      rows: [
        { desc: "FAKE COFFEE", suffix: "_V", cents: -450 },
        { desc: "INVENTED BOOKS", cents: -2000 },
      ],
    },
    { date: "SEP03", rows: [{ desc: "ACME PAYROLL", cents: 250000 }] },
    {
      date: "SEP05",
      rows: [
        { desc: "FAKE UTILITY", continuation: "ACCT 000 TEST", cents: -12345 },
        { desc: "SAMPLE RENT", cents: -150000 },
      ],
    },
    {
      date: "OCT01",
      rows: [
        { desc: "ACME PAYROLL", cents: 250000 },
        { desc: "FAKE COFFEE", suffix: "_V", cents: -450 },
      ],
    },
  ],
};

type Row = { page: number; y: number };
const clone = (p: PdfSpec): PdfSpec => structuredClone(p);
const onRow = (p: PdfSpec, r: Row) =>
  p.pages[r.page]?.items.filter((i) => Math.abs(i.y - r.y) < 0.01) ?? [];

async function run(pdf: PdfSpec) {
  const r = await extractPdf(makeTextPdf(pdf));
  if (!r.ok) throw new Error(r.reason);
  const doc = normalize(r.doc);
  const profile = detect(doc);
  if (!profile) return { profile, parsed: null, result: null };
  const parsed = parse(doc, profile);
  return {
    profile,
    parsed,
    result: parsed.ok ? reconcile(parsed.statement) : null,
  };
}

const made = makeTdStatement(SPEC);

describe("TD chequing, synthetic PDF through the whole path", () => {
  test("golden: exact transactions, anchors, and Verified by checkpoints", async () => {
    const { profile, parsed, result } = await run(made.pdf);
    expect(profile?.id).toBe("td-chequing");
    if (!parsed?.ok) throw new Error("parse failed");
    const s = parsed.statement;
    expect(s.period).toEqual({ start: "2025-09-01", end: "2025-10-01" });
    expect(s.openingBalance).toBe(100000);
    expect(s.printedTotals).toEqual({ withdrawals: 165245, deposits: 500000 });
    expect(s.requiredAnchors).toEqual(["printedTotals"]);
    expect(s.warnings).toEqual([]);
    expect(
      s.transactions.map((t) => [
        t.date,
        t.description,
        t.amount,
        t.balanceAfter,
      ]),
    ).toEqual([
      ["2025-09-02", "FAKE COFFEE _V", -450, undefined],
      ["2025-09-02", "INVENTED BOOKS", -2000, 97550],
      ["2025-09-03", "ACME PAYROLL", 250000, 347550],
      ["2025-09-05", "FAKE UTILITY ACCT 000 TEST", -12345, undefined],
      ["2025-09-05", "SAMPLE RENT", -150000, 185205],
      ["2025-10-01", "ACME PAYROLL", 250000, undefined],
      ["2025-10-01", "FAKE COFFEE _V", -450, 434755],
    ]);
    expect(s.transactions.map((t) => t.source)).toMatchObject([
      { input: "pdf", page: 1 },
      { input: "pdf", page: 1 },
      { input: "pdf", page: 1 },
      { input: "pdf", page: 1 },
      { input: "pdf", page: 1 },
      { input: "pdf", page: 2 },
      { input: "pdf", page: 2 },
    ]);
    expect(result).toEqual({ status: "verified", method: "checkpoints" });
  });

  test("the fees block after the total row is not read as a transaction", async () => {
    const { parsed } = await run(made.pdf);
    if (!parsed?.ok) throw new Error("parse failed");
    expect(parsed.statement.transactions).toHaveLength(7);
    expect(made.rows).toHaveLength(7);
  });

  test("the year follows the period across December and January", async () => {
    const { pdf } = makeTdStatement({
      period: "DEC 05/24 - JAN 04/25",
      opening: 5000,
      days: [
        { date: "DEC31", rows: [{ desc: "FAKE SHOP", cents: -1000 }] },
        { date: "JAN02", rows: [{ desc: "ACME PAYROLL", cents: 20000 }] },
      ],
    });
    const { parsed, result } = await run(pdf);
    if (!parsed?.ok) throw new Error("parse failed");
    expect(parsed.statement.transactions.map((t) => t.date)).toEqual([
      "2024-12-31",
      "2025-01-02",
    ]);
    expect(result?.status).toBe("verified");
  });

  test("every transaction row removed gives a mismatch", async () => {
    for (const [k, row] of made.rows.entries()) {
      const pdf = clone(made.pdf);
      const gone = new Set(onRow(pdf, row));
      const page = pdf.pages[row.page];
      if (!page) throw new Error("no page");
      page.items = page.items.filter((i) => !gone.has(i));
      const { result } = await run(pdf);
      expect(result?.status, `row ${k}`).toBe("mismatch");
    }
  });

  test("every transaction amount altered by one cent gives a mismatch", async () => {
    for (const [k, row] of made.rows.entries()) {
      const pdf = clone(made.pdf);
      // The withdrawal or deposit item: amount-shaped and left of the balance column.
      const item = onRow(pdf, row).find(
        (i) => /^\d[\d,]*\.\d\d$/.test(i.str) && i.x < 450,
      );
      if (!item) throw new Error("no amount item");
      const cents = Math.round(Number(item.str.replaceAll(",", "")) * 100) + 1;
      item.str = formatAmount(cents);
      const { result } = await run(pdf);
      expect(result?.status, `row ${k}`).toBe("mismatch");
    }
  });

  test("a printed total that disagrees with the rows gives a mismatch", async () => {
    const pdf = clone(made.pdf);
    const last = pdf.pages[pdf.pages.length - 1];
    // Both drawn copies of the total, or normalize would drop the altered one as a duplicate.
    const copies = last?.items.filter((i) => i.str === formatAmount(165245));
    if (!copies?.length) throw new Error("no total");
    for (const c of copies) c.str = formatAmount(165246);
    const { result } = await run(pdf);
    expect(result?.status).toBe("mismatch");
  });

  test("a last page that is missing gives unverifiable, never verified", async () => {
    const pdf = clone(made.pdf);
    pdf.pages.pop();
    const { result } = await run(pdf);
    expect(result?.status).toBe("unverifiable");
  });

  test("a lost total row gives unverifiable", async () => {
    const pdf = clone(made.pdf);
    const last = pdf.pages[pdf.pages.length - 1];
    if (!last) throw new Error("no page");
    last.items = last.items.filter((i) => i.str !== "Total");
    const { result } = await run(pdf);
    expect(result?.status).toBe("unverifiable");
  });

  test("a second total row adds a warning and gives unverifiable", async () => {
    const pdf = clone(made.pdf);
    const last = pdf.pages[pdf.pages.length - 1];
    if (!last) throw new Error("no page");
    last.items.push({ str: "Total", x: 69.1, y: 700 });
    const { parsed, result } = await run(pdf);
    if (!parsed?.ok) throw new Error("parse failed");
    expect(parsed.statement.warnings.length).toBeGreaterThan(0);
    expect(result?.status).toBe("unverifiable");
  });

  test("a column that is not right-aligned fails the page closed, with a warning", async () => {
    const pdf = clone(made.pdf);
    const row = made.rows[5] as Row; // the second payroll row, on page 2
    const item = onRow(pdf, row).find(
      (i) => /^\d[\d,]*\.\d\d$/.test(i.str) && i.x < 450,
    );
    if (!item) throw new Error("no amount item");
    item.x -= 5;
    const { parsed, result } = await run(pdf);
    if (!parsed?.ok) throw new Error("parse failed");
    expect(parsed.statement.warnings.length).toBeGreaterThan(0);
    expect(result?.status).toBe("unverifiable");
  });

  test("an unknown PDF is not detected, and does not throw", async () => {
    const { profile } = await run({
      pages: [
        {
          width: 612,
          height: 792,
          items: [
            { str: "Some other document", x: 72, y: 100 },
            { str: "Nothing like a statement", x: 72, y: 120 },
          ],
        },
      ],
    });
    expect(profile).toBeNull();
  });

  test("a page after the table with a date but no header adds a warning", async () => {
    const pdf = clone(made.pdf);
    pdf.pages.push({
      width: 612,
      height: 792,
      items: [
        { str: "FAKE STRAY ROW", x: 69.1, y: 100 },
        { str: "SEP09", x: 417.5, y: 100 },
      ],
    });
    const { parsed, result } = await run(pdf);
    if (!parsed?.ok) throw new Error("parse failed");
    expect(parsed.statement.warnings.length).toBeGreaterThan(0);
    expect(result?.status).toBe("unverifiable");
  });
});
