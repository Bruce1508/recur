import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

const body = [
  "Date,Description,Debit,Credit,Balance",
  "2025-01-01,PAY,,1000.00,1000.00",
  '2025-01-02,"=HYPERLINK(""http://x"")",4.50,,995.50',
  "2025-01-03,BOOKS,20.00,,975.50",
].join("\n");

test("the merged ledger downloads as a CSV with formulas neutralised and sends nothing", async ({
  page,
}) => {
  const origin = "http://localhost:4173";
  const offenders: string[] = [];
  page.on("request", (req) => {
    const url = new URL(req.url());
    if (url.protocol === "data:") return;
    if (url.origin !== origin || req.postData() !== null)
      offenders.push(req.url());
  });
  await page.goto("/");
  await expect(
    page.getByRole("link", { name: "Download transactions (CSV)" }),
  ).toHaveCount(0);
  await page.getByTestId("file-input").setInputFiles({
    name: "a.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(body),
  });
  const link = page.getByRole("link", { name: "Download transactions (CSV)" });
  await expect(link).toBeVisible();
  await page.screenshot({
    path: "docs/evidence/export-csv.png",
    fullPage: true,
  });

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    link.click(),
  ]);
  expect(download.suggestedFilename()).toBe("recur-transactions.csv");
  const path = await download.path();
  expect((await readFile(path, "utf8")).split("\r\n")).toEqual([
    "Date,Description,Amount,Balance,Account",
    "2025-01-01,PAY,1000.00,1000.00,B",
    '2025-01-02,"\'=HYPERLINK(""http://x"")",-4.50,995.50,B',
    "2025-01-03,BOOKS,-20.00,975.50,B",
  ]);
  expect(offenders).toEqual([]);
});
