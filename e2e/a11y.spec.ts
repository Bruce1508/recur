import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { makeTextPdf } from "../tools/makePdf";
import { makeTdStatement } from "../tools/makeTdStatement";

const withBalance = [
  "Date,Description,Debit,Credit,Balance",
  "2025-01-01,PAY,,1000.00,1000.00",
  "2025-01-02,COFFEE,4.50,,995.50",
].join("\n");
const noBalance = [
  "Date,Description,Amount",
  "2025-01-02,COFFEE,4.50",
  "2025-01-03,BOOKS,20.00",
].join("\n");

const tdPdf = makeTextPdf(
  makeTdStatement({
    period: "SEP 01/25 - OCT 01/25",
    opening: 100000,
    days: [{ date: "SEP02", rows: [{ desc: "FAKE COFFEE", cents: -450 }] }],
  }).pdf,
);

const scan = async (page: Page) => {
  const { violations } = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(
    violations.map(
      (v) => `${v.id}: ${v.nodes.map((n) => n.target).join(" | ")}`,
    ),
  ).toEqual([]);
};

test("empty state has no serious accessibility violations", async ({
  page,
}) => {
  await page.goto("/");
  await scan(page);
});

test("confirm-columns state has none", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("file-input").setInputFiles({
    name: "b.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(noBalance),
  });
  await expect(page.getByText("Confirm columns: b.csv")).toBeVisible();
  await scan(page);
});

test("results state (CSV and PDF, status, error) has none", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByTestId("file-input").setInputFiles([
    { name: "a.csv", mimeType: "text/csv", buffer: Buffer.from(withBalance) },
    { name: "td.pdf", mimeType: "application/pdf", buffer: Buffer.from(tdPdf) },
    { name: "bad.csv", mimeType: "text/csv", buffer: Buffer.from("x") },
  ]);
  await expect(page.getByText(/^Verified:/).first()).toBeVisible();
  await expect(page.getByRole("alert")).toBeVisible();
  await scan(page);
});

test("the scan itself catches a violation (control)", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    document.body.insertAdjacentHTML("beforeend", '<img src="data:,">');
  });
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(violations.map((v) => v.id)).toContain("image-alt");
});

test("results state does not scroll sideways at phone width (320 px)", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto("/");
  await page.getByTestId("file-input").setInputFiles([
    { name: "a.csv", mimeType: "text/csv", buffer: Buffer.from(withBalance) },
    { name: "td.pdf", mimeType: "application/pdf", buffer: Buffer.from(tdPdf) },
  ]);
  await expect(page.getByText(/^Verified:/).first()).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  await page.screenshot({
    path: "docs/evidence/phone-width.png",
    fullPage: true,
  });
});
