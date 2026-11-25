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
import { tdChequing } from "../core/profiles/tdChequing";
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

const totalItems = (p: PdfSpec, page: number, str: string) => {
  const ys = made.totals[page]?.ys ?? [];
  return (
    p.pages[page]?.items.filter(
      (i) => i.str === str && ys.some((y) => Math.abs(i.y - y) < 1),
    ) ?? []
  );
};

describe("TD chequing, synthetic PDF through the whole path", () => {
  test("golden: exact transactions, anchors, and Verified by checkpoints", async () => {
    const { profile, parsed, result } = await run(made.pdf);
    expect(profile?.id).toBe("td-chequing");
    if (!parsed?.ok) throw new Error("parse failed");
    const s = parsed.statement;
    expect(s.period).toEqual({ start: "2025-09-01", end: "2025-10-01" });
    expect(s.openingBalance).toBe(100000);
    expect(s.printedTotals).toEqual({ withdrawals: 165245, deposits: 500000 });
    expect(made.totals.map((t) => [t.withdrawals, t.deposits])).toEqual([
      [164795, 250000],
      [450, 250000],
    ]);
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

  test.each([0, 1])(
    "page %i's printed total off by one cent gives a mismatch",
    async (p) => {
      const pdf = clone(made.pdf);
      const t = made.totals[p];
      if (!t) throw new Error("no totals");
      // Every drawn copy, or normalize would drop an altered one as a duplicate or the page would disagree.
      const copies = totalItems(pdf, p, formatAmount(t.deposits));
      if (!copies.length) throw new Error("no total");
      for (const c of copies) c.str = formatAmount(t.deposits + 1);
      const { result } = await run(pdf);
      expect(result?.status).toBe("mismatch");
    },
  );

  test("the two total lines of the last page disagreeing gives unverifiable", async () => {
    const pdf = clone(made.pdf);
    const t = made.totals[1];
    const y = t?.ys[0];
    if (!t || y === undefined) throw new Error("no totals");
    const item = pdf.pages[1]?.items.find(
      (i) => Math.abs(i.y - y) < 0.01 && i.str === formatAmount(t.deposits),
    );
    if (!item) throw new Error("no total");
    item.str = formatAmount(t.deposits + 1);
    const { parsed, result } = await run(pdf);
    if (!parsed?.ok) throw new Error("parse failed");
    expect(parsed.statement.warnings).toContain(
      "page 2: the total rows disagree",
    );
    expect(result?.status).toBe("unverifiable");
  });

  test("a page with rows whose total was removed gives unverifiable", async () => {
    const pdf = clone(made.pdf);
    const page = pdf.pages[0];
    const t = made.totals[0];
    if (!page || !t) throw new Error("no page");
    page.items = page.items.filter(
      (i) => !t.ys.some((y) => Math.abs(i.y - y) < 1),
    );
    const { parsed, result } = await run(pdf);
    if (!parsed?.ok) throw new Error("parse failed");
    expect(parsed.statement.warnings).toContain(
      "page 1 has rows but no total row",
    );
    expect(result?.status).toBe("unverifiable");
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

  test("a description wider than the gap to the Withdrawals label is kept whole", async () => {
    const { pdf } = makeTdStatement({
      period: "SEP 01/25 - OCT 01/25",
      opening: 100000,
      days: [
        {
          date: "SEP02",
          rows: [
            {
              desc: "PREAUTHORIZED DEBIT ACME INSURANCE COMPANY",
              cents: -4500,
            },
          ],
        },
      ],
    });
    const { parsed, result } = await run(pdf);
    if (!parsed?.ok) throw new Error("parse failed");
    expect(parsed.statement.transactions[0]?.description).toBe(
      "PREAUTHORIZED DEBIT ACME INSURANCE COMPANY",
    );
    expect(result?.status).toBe("verified");
  });

  test("text in the amount area that is not an amount or a date adds a warning", async () => {
    const pdf = clone(made.pdf);
    const row = made.rows[1] as Row;
    pdf.pages[row.page]?.items.push({ str: "1,234.56-", x: 470, y: row.y });
    const { parsed, result } = await run(pdf);
    if (!parsed?.ok) throw new Error("parse failed");
    expect(parsed.statement.warnings.length).toBeGreaterThan(0);
    expect(result?.status).not.toBe("verified");
  });

  test("a dated row with no amount adds a warning", async () => {
    const pdf = clone(made.pdf);
    const row = made.rows[2] as Row;
    const page = pdf.pages[row.page];
    if (!page) throw new Error("no page");
    page.items = page.items.filter(
      (i) => !(Math.abs(i.y - row.y) < 0.01 && /^\d[\d,]*\.\d\d$/.test(i.str)),
    );
    const { parsed, result } = await run(pdf);
    if (!parsed?.ok) throw new Error("parse failed");
    expect(parsed.statement.warnings.length).toBeGreaterThan(0);
    expect(result?.status).not.toBe("verified");
  });

  test("a dated row that lost its amount but kept its balance gives a mismatch, not verified", async () => {
    const pdf = clone(made.pdf);
    const row = made.rows[2] as Row;
    const page = pdf.pages[row.page];
    if (!page) throw new Error("no page");
    const amounts = onRow(pdf, row).filter((i) =>
      /^\d[\d,]*\.\d\d$/.test(i.str),
    );
    const balance = amounts.reduce((a, b) => (b.x > a.x ? b : a));
    page.items = page.items.filter(
      (i) => !amounts.includes(i) || i === balance,
    );
    const { parsed, result } = await run(pdf);
    if (!parsed?.ok) throw new Error("parse failed");
    expect(result?.status).toBe("mismatch");
  });

  test.each([
    ["a trailing-minus amount in the withdrawals column", "450.00-", 1],
    ["a CR amount glued to its figure", "450.00CR", 1],
    ["a CR marker beside the figure", "CR", 1],
    ["a trailing-minus balance", "975.50-", 1],
  ])(
    "%s fails the row closed with a warning, never a guessed sign",
    async (_name, text, rowIndex) => {
      const pdf = clone(made.pdf);
      const row = made.rows[rowIndex] as Row;
      pdf.pages[row.page]?.items.push({
        str: text,
        x: text === "CR" ? 500 : 460,
        y: row.y,
      });
      const { parsed, result } = await run(pdf);
      if (!parsed?.ok) throw new Error("parse failed");
      expect(parsed.statement.warnings.length).toBeGreaterThan(0);
      expect(result?.status).not.toBe("verified");
    },
  );

  test("a total row with a missing figure adds a warning and gives unverifiable", async () => {
    const pdf = clone(made.pdf);
    const last = pdf.pages[pdf.pages.length - 1];
    if (!last) throw new Error("no page");
    const gone = new Set(totalItems(pdf, 1, formatAmount(250000)));
    last.items = last.items.filter((i) => !gone.has(i));
    const { parsed, result } = await run(pdf);
    if (!parsed?.ok) throw new Error("parse failed");
    expect(parsed.statement.warnings.length).toBeGreaterThan(0);
    expect(result?.status).toBe("unverifiable");
  });

  test("a row date outside the statement period adds a warning", async () => {
    const pdf = clone(made.pdf);
    const row = made.rows[0] as Row;
    const date = onRow(pdf, row).find((i) => i.str === "SEP02");
    if (!date) throw new Error("no date");
    date.str = "AUG15";
    const { parsed, result } = await run(pdf);
    if (!parsed?.ok) throw new Error("parse failed");
    expect(parsed.statement.warnings.length).toBeGreaterThan(0);
    expect(result?.status).not.toBe("verified");
  });

  test("no period, or no transactions, is a failed parse with a reason", async () => {
    const lines = async (pdf: PdfSpec) => {
      const r = await extractPdf(makeTextPdf(pdf));
      if (!r.ok) throw new Error(r.reason);
      return normalize(r.doc);
    };
    const noPeriod = clone(made.pdf);
    for (const p of noPeriod.pages)
      p.items = p.items.filter((i) => i.str !== SPEC.period);
    expect(parse(await lines(noPeriod), tdChequing)).toMatchObject({
      ok: false,
    });

    const noRows = clone(made.pdf);
    for (const row of made.rows) {
      const page = noRows.pages[row.page];
      if (page)
        page.items = page.items.filter((i) => Math.abs(i.y - row.y) >= 0.01);
    }
    expect(parse(await lines(noRows), tdChequing)).toMatchObject({ ok: false });
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

  describe("overdrawn balances and the page-total switches", () => {
    const od = (opening: number) =>
      makeTdStatement({
        period: "SEP 01/25 - OCT 01/25",
        opening,
        slotsPerPage: 4,
        days: [
          { date: "SEP02", rows: [{ desc: "FAKE RENT", cents: -20000 }] },
          { date: "SEP03", rows: [{ desc: "ACME PAYROLL", cents: 30000 }] },
          { date: "SEP04", rows: [{ desc: "FAKE SHOP", cents: -123456 }] },
          { date: "SEP05", rows: [{ desc: "SAMPLE REFUND", cents: 200000 }] },
        ],
      });

    test.each([
      ["a balance that goes negative", 5000, [-15000, 15000, -108456, 91544]],
      [
        "an opening balance that is overdrawn",
        -5000,
        [-25000, 5000, -118456, 81544],
      ],
    ])(
      "%s is printed with OD, read as negative, and verifies",
      async (_n, opening, balances) => {
        const m = od(opening);
        const printed = m.pdf.pages.flatMap((p) => p.items.map((i) => i.str));
        expect(printed.some((x) => x.endsWith("OD"))).toBe(true);
        const { parsed, result } = await run(m.pdf);
        if (!parsed?.ok) throw new Error("parse failed");
        expect(parsed.statement.warnings).toEqual([]);
        expect(parsed.statement.openingBalance).toBe(opening);
        expect(
          parsed.statement.transactions.map((t) => t.balanceAfter),
        ).toEqual(balances);
        expect(result).toEqual({ status: "verified", method: "checkpoints" });
      },
    );

    const addBalance = (
      m: ReturnType<typeof od>,
      str: string,
      rowIndex: number,
      x: number,
    ) => {
      const pdf = clone(m.pdf);
      const row = m.rows[rowIndex] as Row;
      pdf.pages[row.page]?.items.push({ str, x, y: row.y });
      return pdf;
    };

    test("an OD token in the withdrawals column gives unverifiable", async () => {
      const { parsed, result } = await run(
        addBalance(od(5000), "450.00OD", 0, 240),
      );
      if (!parsed?.ok) throw new Error("parse failed");
      expect(parsed.statement.warnings.length).toBeGreaterThan(0);
      expect(result?.status).toBe("unverifiable");
    });

    test("a balance with an unknown suffix gives unverifiable", async () => {
      const m = od(5000);
      const pdf = clone(m.pdf);
      for (const p of pdf.pages)
        for (const i of p.items)
          if (i.str.endsWith("OD")) i.str = i.str.replace("OD", "XY");
      const { parsed, result } = await run(pdf);
      if (!parsed?.ok) throw new Error("parse failed");
      expect(parsed.statement.warnings.length).toBeGreaterThan(0);
      expect(result?.status).toBe("unverifiable");
    });

    test("an OD balance that is really positive breaks the checkpoint", async () => {
      const m = od(5000);
      const pdf = clone(m.pdf);
      for (const p of pdf.pages)
        for (const i of p.items) i.str = i.str.replace(/OD$/, "");
      const { result } = await run(pdf);
      expect(result?.status).toBe("mismatch");
    });

    test("with pageTotals off the old single total row is kept, and a second one warns", async () => {
      const profile = {
        ...tdChequing,
        pageTotals: false,
        lastPageRepeatsTotal: false,
      };
      const m = makeTdStatement({
        period: "SEP 01/25 - OCT 01/25",
        opening: 100000,
        days: [{ date: "SEP02", rows: [{ desc: "FAKE SHOP", cents: -1000 }] }],
      });
      const read = async (pdf: PdfSpec) => {
        const r = await extractPdf(makeTextPdf(pdf));
        if (!r.ok) throw new Error(r.reason);
        const parsed = parse(normalize(r.doc), profile);
        if (!parsed.ok) throw new Error("parse failed");
        return { parsed, result: reconcile(parsed.statement) };
      };
      const two = await read(m.pdf);
      expect(two.parsed.statement.warnings).toContain(
        "the statement has more than one total row",
      );
      expect(two.result.status).toBe("unverifiable");

      const one = clone(m.pdf);
      const extra = m.totals[0]?.ys[0];
      if (extra === undefined) throw new Error("no total");
      const page = one.pages[0];
      if (!page) throw new Error("no page");
      page.items = page.items.filter((i) => Math.abs(i.y - extra) >= 1);
      const ok = await read(one);
      expect(ok.parsed.statement.warnings).toEqual([]);
      expect(ok.parsed.statement.printedTotals).toEqual({
        withdrawals: 1000,
        deposits: 0,
      });
      expect(ok.result).toEqual({ status: "verified", method: "checkpoints" });
    });
  });
});
