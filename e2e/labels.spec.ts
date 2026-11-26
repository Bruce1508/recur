import { readFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

const csv = [
  "Date,Description,Debit,Credit,Balance",
  "2025-01-01,PAY ACME,,1000.00,1000.00",
  "2025-01-02,XQZ 11111,5.00,,995.00",
  "2025-01-03,XQZ 22222,5.00,,990.00",
  "2025-01-04,XQZ ONE 33333,3.00,,987.00",
].join("\n");

const drop = (page: Page) =>
  page.getByTestId("file-input").setInputFiles({
    name: "a.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv),
  });

const readout = (page: Page) => page.getByTestId("readout");
const row = (page: Page, name: string) =>
  readout(page).getByRole("row", { name: new RegExp(name) });

const nameLine = async (page: Page, key: string, name: string) => {
  await readout(page).getByLabel("Line").selectOption(key);
  await readout(page).getByLabel("Name", { exact: true }).fill(name);
  await readout(page).getByRole("button", { name: "Apply name" }).click();
};

test("a name applies to every line with the same key and to no other", async ({
  page,
}) => {
  await page.goto("/");
  await drop(page);
  await expect(row(page, "Not recognised")).toContainText("3$13.00");
  await nameLine(page, "XQZ", "My gym");
  await expect(row(page, "My gym")).toContainText("2$10.00");
  await expect(row(page, "My gym")).toContainText("your label");
  await expect(row(page, "Not recognised")).toContainText("1$3.00");
  await expect(row(page, "^Total")).toContainText("$13.00");
  await page.screenshot({
    path: "docs/evidence/labels-light.png",
    fullPage: true,
  });
  const { violations } = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(violations.map((v) => v.id)).toEqual([]);
});

test("names download, load back, and a bad file changes nothing", async ({
  page,
}) => {
  await page.goto("/");
  await drop(page);
  await nameLine(page, "XQZ", "My gym");
  const downloading = page.waitForEvent("download");
  await readout(page)
    .getByRole("link", { name: /Download names/ })
    .click();
  const download = await downloading;
  const path = await download.path();
  expect(JSON.parse(readFileSync(path, "utf8"))).toEqual({
    version: 1,
    labels: [{ key: "XQZ", name: "My gym" }],
  });

  await readout(page)
    .getByRole("button", { name: "Remove the name for XQZ" })
    .click();
  await expect(row(page, "Not recognised")).toContainText("3$13.00");
  await readout(page).getByTestId("labels-input").setInputFiles(path);
  await expect(row(page, "My gym")).toContainText("2$10.00");

  await readout(page)
    .getByTestId("labels-input")
    .setInputFiles({
      name: "bad.json",
      mimeType: "application/json",
      buffer: Buffer.from('{"version":2,"labels":[]}'),
    });
  await expect(page.getByRole("alert")).toContainText("No labels were changed");
  await expect(row(page, "My gym")).toContainText("2$10.00");
  await expect(readout(page).getByTestId("label-list")).toContainText(
    "XQZ → My gym",
  );
});

test("labels and readings are never written to browser storage", async ({
  page,
}) => {
  await page.goto("/");
  await drop(page);
  await nameLine(page, "XQZ", "My gym");
  await expect(row(page, "My gym")).toBeVisible();
  const stored = await page.evaluate(async () => ({
    local: localStorage.length,
    session: sessionStorage.length,
    cookie: document.cookie,
    dbs: (await indexedDB.databases()).length,
  }));
  expect(stored).toEqual({ local: 0, session: 0, cookie: "", dbs: 0 });
});

test("a blank name is refused with a message", async ({ page }) => {
  await page.goto("/");
  await drop(page);
  await nameLine(page, "XQZ", "   ");
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(row(page, "Not recognised")).toContainText("3$13.00");
});
