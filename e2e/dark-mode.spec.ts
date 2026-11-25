import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { makeTextPdf } from "../tools/makePdf";
import { makeTdStatement } from "../tools/makeTdStatement";

const withBalance = [
  "Date,Description,Debit,Credit,Balance",
  "2025-01-01,PAY,,1000.00,1000.00",
  "2025-01-02,COFFEE,4.50,,995.50",
].join("\n");
const tdPdf = makeTextPdf(
  makeTdStatement({
    period: "SEP 01/25 - OCT 01/25",
    opening: 100000,
    days: [{ date: "SEP02", rows: [{ desc: "FAKE COFFEE", cents: -450 }] }],
  }).pdf,
);

const background = (page: Page) =>
  page.evaluate(() => getComputedStyle(document.body).backgroundColor);

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

test("follows a dark OS and a light OS", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");
  expect(await background(page)).toBe("rgb(21, 17, 29)");
  await page.emulateMedia({ colorScheme: "light" });
  expect(await background(page)).toBe("rgb(249, 247, 245)");
});

test("the button cycles system, light, dark, system and overrides the OS", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");
  const button = page.getByRole("button", { name: /^Theme:/ });
  await expect(button).toHaveText("Theme: Match system");
  await button.click();
  await expect(button).toHaveText("Theme: Light");
  expect(await background(page)).toBe("rgb(249, 247, 245)");
  await button.click();
  await expect(button).toHaveText("Theme: Dark");
  expect(await background(page)).toBe("rgb(21, 17, 29)");
  await page.emulateMedia({ colorScheme: "light" });
  expect(await background(page)).toBe("rgb(21, 17, 29)");
  await button.click();
  await expect(button).toHaveText("Theme: Match system");
  expect(await background(page)).toBe("rgb(249, 247, 245)");
});

test("dark empty and results states have no accessibility violations", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");
  await page.screenshot({
    path: "docs/evidence/dark-empty.png",
    fullPage: true,
  });
  await scan(page);
  await page.getByTestId("file-input").setInputFiles([
    { name: "a.csv", mimeType: "text/csv", buffer: Buffer.from(withBalance) },
    { name: "td.pdf", mimeType: "application/pdf", buffer: Buffer.from(tdPdf) },
    { name: "bad.csv", mimeType: "text/csv", buffer: Buffer.from("x") },
  ]);
  await expect(page.getByText(/^Verified:/).first()).toBeVisible();
  await expect(page.getByRole("alert")).toBeVisible();
  await page.screenshot({
    path: "docs/evidence/dark-results.png",
    fullPage: true,
  });
  await scan(page);
});
