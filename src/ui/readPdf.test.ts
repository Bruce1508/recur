import { expect, test } from "vitest";
import { makeTextPdf } from "../../tools/makePdf";
import { makeTdStatement } from "../../tools/makeTdStatement";
import { readPdf } from "./readPdf";

// Invented data, generated in memory (ADR-016).
const td = makeTdStatement({
  period: "SEP 01/25 - OCT 01/25",
  opening: 100000,
  days: [
    { date: "SEP02", rows: [{ desc: "FAKE COFFEE", cents: -450 }] },
    { date: "SEP03", rows: [{ desc: "ACME PAYROLL", cents: 250000 }] },
  ],
});

test("a TD chequing PDF becomes a parsed statement", async () => {
  const r = await readPdf(makeTextPdf(td.pdf));
  if (!r.ok) throw new Error(r.reason);
  expect(r.statement.input).toBe("pdf");
  expect(r.statement.bankId).toBe("td-chequing");
  expect(r.statement.transactions).toHaveLength(2);
});

test("a readable PDF of an unknown format gives the unsupported-format reason", async () => {
  const pdf = makeTextPdf({
    pages: [
      { width: 612, height: 792, items: [{ str: "Hello", x: 72, y: 72 }] },
    ],
  });
  expect(await readPdf(pdf)).toEqual({
    ok: false,
    reason: "unsupported format: this kind of statement cannot be read yet",
  });
});

test("bytes that are not a PDF fail closed with a reason", async () => {
  const r = await readPdf(new TextEncoder().encode("not a pdf"));
  expect(r.ok).toBe(false);
  if (!r.ok) expect(r.reason).toMatch(/^cannot read this PDF/);
});
