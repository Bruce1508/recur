import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

const csv = [
  "Date,Description,Debit,Credit,Balance",
  "2025-01-01,PAY ACME,,1000.00,1000.00",
  "2025-01-02,TIM HORTONS #123 TORONTO ON,4.50,,995.50",
  "2025-02-02,TIM HORTONS #124 TORONTO ON,4.50,,991.00",
  "2025-03-02,TIM HORTONS #125 TORONTO ON,9.00,,982.00",
  "2025-03-03,XQZ 12345,7.00,,975.00",
].join("\n");
const noBalance = [
  "Date,Description,Amount",
  "2025-01-02,TIM HORTONS #1,-4.50",
  "2025-01-03,BOOKS,-20.00",
].join("\n");

const drop = (page: Page, name: string, text: string) =>
  page.getByTestId("file-input").setInputFiles({
    name,
    mimeType: "text/csv",
    buffer: Buffer.from(text),
  });

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

test("the readout groups by name, keeps unknown visible and adds up", async ({
  page,
}) => {
  await page.goto("/");
  await drop(page, "a.csv", csv);
  const readout = page.getByTestId("readout");
  await expect(readout).toBeVisible();
  await expect(readout.getByRole("row", { name: /Tim Hortons/ })).toContainText(
    "3$18.00",
  );
  await expect(
    readout.getByRole("row", { name: /Not recognised/ }),
  ).toContainText("1$7.00");
  await expect(readout.getByRole("row", { name: /^Total/ })).toContainText(
    "$25.00",
  );
  await expect(readout.getByRole("row", { name: /^Total/ })).toContainText(
    "$1,000.00",
  );
  await expect(page.getByTestId("readout-new")).toHaveText(
    "No names first seen this month.",
  );
  await expect(page.getByTestId("readout-unusual")).toContainText(
    "2025-03-02 TIM HORTONS #125 TORONTO ON -$9.00",
  );
  await readout.getByRole("combobox").selectOption("2025-01");
  await expect(page.getByTestId("readout-new")).toHaveText(
    "Pay Acme, Tim Hortons",
  );
  await page.screenshot({
    path: "docs/evidence/readout-light.png",
    fullPage: true,
  });
  await scan(page);
});

test("a file that is not Verified is labelled in the readout", async ({
  page,
}) => {
  await page.goto("/");
  await drop(page, "b.csv", noBalance);
  await page.getByRole("button", { name: /confirm/i }).click();
  await expect(
    page.getByTestId("readout").getByText(/not Verified/),
  ).toHaveCount(2);
});

test("dark readout has no accessibility violations", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");
  await drop(page, "a.csv", csv);
  await expect(page.getByTestId("readout")).toBeVisible();
  await page.screenshot({
    path: "docs/evidence/readout-dark.png",
    fullPage: true,
  });
  await scan(page);
});
