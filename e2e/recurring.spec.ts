import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

const rec = (page: Page) => page.getByTestId("recurring");
const row = (page: Page, name: string) =>
  rec(page).getByRole("row", { name: new RegExp(name) });

const scan = async (page: Page) => {
  const { violations } = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(violations.map((v) => v.id)).toEqual([]);
};

test("the sample shows its recurring charges with evidence, a price change and a total", async ({
  page,
}) => {
  await page.goto("/");
  await expect(rec(page)).toHaveCount(0);
  await page.getByRole("button", { name: "Try with sample data" }).click();
  await expect(rec(page)).toBeVisible();
  await expect(row(page, "Streamflix")).toContainText("Monthly");
  await expect(row(page, "Streamflix")).toContainText("$16.99");
  await expect(row(page, "Maple Rent")).toContainText("$1,200.00");
  await expect(row(page, "Ironworks Gym")).toContainText(
    "Price changed from $45.00 to $49.00",
  );
  await page.getByTestId("recurring").screenshot({
    path: "docs/evidence/recurring-light.png",
  });
  await row(page, "Streamflix")
    .getByText(/charge\(s\)/)
    .click();
  await expect(row(page, "Streamflix").getByRole("listitem")).toHaveCount(12);
  await expect(rec(page)).toContainText("13 months or more");
  await expect(rec(page).getByTestId("recurring-total")).toBeVisible();
  await scan(page);
});

test("a dismissed charge is hidden, can be shown again, and is never stored", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Try with sample data" }).click();
  await expect(row(page, "Streamflix")).toBeVisible();
  await rec(page)
    .getByRole("button", { name: "Not recurring: Streamflix" })
    .click();
  await expect(row(page, "Streamflix")).toHaveCount(0);
  await expect(rec(page).getByTestId("recurring-hidden")).toContainText(
    "Streamflix",
  );
  const stored = await page.evaluate(async () => ({
    local: localStorage.length,
    session: sessionStorage.length,
    cookie: document.cookie,
    dbs: (await indexedDB.databases()).length,
  }));
  expect(stored).toEqual({ local: 0, session: 0, cookie: "", dbs: 0 });
  await rec(page)
    .getByRole("button", { name: "Show again: Streamflix" })
    .click();
  await expect(row(page, "Streamflix")).toBeVisible();
});

test("dark recurring section has no accessibility violations", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");
  await page.getByRole("button", { name: "Try with sample data" }).click();
  await expect(rec(page)).toBeVisible();
  await page.getByTestId("recurring").screenshot({
    path: "docs/evidence/recurring-dark.png",
  });
  await scan(page);
});
