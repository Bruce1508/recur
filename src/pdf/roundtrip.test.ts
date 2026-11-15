import { describe, expect, test } from "vitest";
import { makeTextPdf } from "../../tools/makePdf";
import { normalize } from "../core/normalize/normalize";
import { extractPdf } from "./extract";

// Invented data only. M5 acceptance: a synthetic PDF round-trips, so the rows that went in are the
// lines that come out, in order.
const COLUMNS = [50, 120, 380, 450];
const ROWS = [
  ["Date", "Description", "Withdrawals", "Balance"],
  ["Oct 15", "FAKE COFFEE #12", "4.50", "995.50"],
  ["Oct 16", "INVENTED BOOKS", "20.00", "975.50"],
  ["Oct 17", "ACME PAYROLL", "", "1,975.50"],
];

const page = (rows: string[][], firstY: number) => ({
  width: 612,
  height: 792,
  items: rows.flatMap((row, r) =>
    row.flatMap((str, c) =>
      str === "" ? [] : [{ str, x: COLUMNS[c] ?? 0, y: firstY + r * 14 }],
    ),
  ),
});

describe("extractPdf then normalize", () => {
  test("recovers every generated row as one line, in order, across pages", async () => {
    const r = await extractPdf(
      makeTextPdf({
        pages: [page(ROWS.slice(0, 2), 100), page(ROWS.slice(2), 100)],
      }),
    );
    if (!r.ok) throw new Error(r.reason);
    const out = normalize(r.doc);
    expect(out.lines.map((l) => [l.page, l.text])).toEqual([
      [1, "Date Description Withdrawals Balance"],
      [1, "Oct 15 FAKE COFFEE #12 4.50 995.50"],
      [2, "Oct 16 INVENTED BOOKS 20.00 975.50"],
      [2, "Oct 17 ACME PAYROLL 1,975.50"],
    ]);
  });

  test("keeps the columns as separate items with the generated x positions", async () => {
    const r = await extractPdf(makeTextPdf({ pages: [page(ROWS, 100)] }));
    if (!r.ok) throw new Error(r.reason);
    const line = normalize(r.doc).lines[1];
    expect(line?.items.map((i) => i.str)).toEqual([
      "Oct 15",
      "FAKE COFFEE #12",
      "4.50",
      "995.50",
    ]);
    expect(line?.items.map((i) => Math.round(i.x))).toEqual(COLUMNS);
  });
});
