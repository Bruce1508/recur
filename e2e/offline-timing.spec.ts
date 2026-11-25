import { expect, type Page, test } from "@playwright/test";
import { generateLedger, LAYOUTS, renderCsv } from "../tools/make-synthetic";
import { makeTextPdf } from "../tools/makePdf";
import { makeTdStatement, type TdDay } from "../tools/makeTdStatement";

const MONTHS = "JAN FEB MAR APR MAY JUN JUL AUG SEP OCT NOV DEC".split(" ");
const splitLayout = LAYOUTS.find((l) => l.name === "header-split-balance");

function csvFile(name: string, body: string) {
  return { name, mimeType: "text/csv", buffer: Buffer.from(body) };
}

function pdfFile(name: string, bytes: Uint8Array) {
  return { name, mimeType: "application/pdf", buffer: Buffer.from(bytes) };
}

/** Twelve monthly TD-style statements cut from one synthetic year, each opening where the last closed. */
function monthlyPdfs(seed: number) {
  const entries = generateLedger(seed, 12, 2025);
  let opening = 500000;
  return MONTHS.map((mon, i) => {
    const month = entries.filter((e) => Number(e.date.slice(5, 7)) === i + 1);
    const days: TdDay[] = [];
    for (const e of month) {
      const date = `${mon}${e.date.slice(8, 10)}`;
      const last = days.at(-1);
      const row = { desc: e.description, cents: e.amount };
      if (last?.date === date) last.rows.push(row);
      else days.push({ date, rows: [row] });
    }
    const next = MONTHS[(i + 1) % 12];
    const yy = i === 11 ? "26" : "25";
    const spec = {
      period: `${mon} 01/25 - ${next} 01/${yy}`,
      opening,
      days,
    };
    opening = month.at(-1)?.balance ?? opening;
    return pdfFile(`td-${mon}.pdf`, makeTextPdf(makeTdStatement(spec).pdf));
  });
}

async function dropAndWaitVerified(
  page: Page,
  files: { name: string; mimeType: string; buffer: Buffer }[],
) {
  await page.getByTestId("file-input").setInputFiles(files);
  await expect(page.getByText(/^Verified:/)).toHaveCount(files.length, {
    timeout: 15_000,
  });
}

test("AC-5: after the page has loaded, a CSV and a PDF still import and verify offline", async ({
  page,
  context,
}) => {
  if (!splitLayout) throw new Error("layout missing");
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Recur" })).toBeVisible();
  await context.setOffline(true);
  await dropAndWaitVerified(page, [
    csvFile("a.csv", renderCsv(generateLedger(1, 2), splitLayout)),
    ...monthlyPdfs(2).slice(0, 1),
  ]);
});

test("AC-9: twelve CSV files of a year each, and twelve monthly PDFs, each process in under 5 s", async ({
  page,
}) => {
  if (!splitLayout) throw new Error("layout missing");
  await page.goto("/");
  const csvs = Array.from({ length: 12 }, (_, i) =>
    csvFile(`y${i}.csv`, renderCsv(generateLedger(i + 1, 12), splitLayout)),
  );
  let start = Date.now();
  await dropAndWaitVerified(page, csvs);
  const csvMs = Date.now() - start;

  await page.goto("/");
  start = Date.now();
  await dropAndWaitVerified(page, monthlyPdfs(7));
  const pdfMs = Date.now() - start;

  test.info().annotations.push({
    type: "timing",
    description: `12 CSV: ${csvMs} ms; 12 PDF: ${pdfMs} ms`,
  });
  expect(csvMs).toBeLessThan(5000);
  expect(pdfMs).toBeLessThan(5000);
});
