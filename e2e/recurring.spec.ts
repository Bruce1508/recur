import { readFileSync } from "node:fs";
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
  await expect(row(page, "Streamflix").getByRole("listitem")).toHaveCount(15);
  await expect(row(page, "Domainhouse")).toContainText("Yearly");
  await expect(row(page, "Domainhouse")).toContainText("2027-02-14");
  await expect(rec(page)).not.toContainText("13 months or more");
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

test("the downloads match what is on screen, and the calendar reads back", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Try with sample data" }).click();
  await rec(page)
    .getByRole("button", { name: "Not recurring: Streamflix" })
    .click();

  const csvDownload = page.waitForEvent("download");
  await rec(page)
    .getByRole("link", { name: /Download list/ })
    .click();
  const csv = readFileSync(await (await csvDownload).path(), "utf8").replace(
    "﻿",
    "",
  );
  const csvRows = csv
    .trim()
    .split("\n")
    .slice(1)
    .map((l) => l.split(",")[0]);

  const onScreen = await rec(page)
    .getByTestId("recurring-row")
    .evaluateAll((rows) =>
      rows.map(
        (r) => r.querySelector("td")?.firstChild?.textContent?.trim() ?? "",
      ),
    );
  expect(csvRows).toEqual(onScreen);
  expect(csvRows).not.toContain("Streamflix");
  expect(csv).toContain(
    "Maple Rent,Monthly,1200.00,no,,1200.00,14400.00,2026-04-01,High",
  );

  const icsDownload = page.waitForEvent("download");
  await rec(page)
    .getByRole("link", { name: /Download calendar/ })
    .click();
  const ics = readFileSync(await (await icsDownload).path(), "utf8");
  expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
  expect(ics).toContain("SUMMARY:Maple Rent\r\n");
  expect(ics).toContain("DTSTART;VALUE=DATE:20260401\r\n");
  expect(ics).not.toContain("Streamflix");
  expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(onScreen.length);
});

test("printing shows the recurring list and hides the rest", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Try with sample data" }).click();
  await page.emulateMedia({ media: "print" });
  await expect(page.getByTestId("recurring")).toBeVisible();
  await expect(page.getByTestId("readout")).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Try with sample data" }),
  ).toBeHidden();
  await expect(page.getByRole("link", { name: /Download list/ })).toBeHidden();
});

test("a charge name with a lone surrogate still renders and its downloads exist", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const text = Blob.prototype.text;
    Blob.prototype.text = async function (this: Blob) {
      return (await text.call(this)).replaceAll("LONE", "\uD800");
    };
  });
  const csv = [
    "Date,Description,Debit,Credit,Balance",
    "2025-01-01,PAY,,1000.00,1000.00",
    "2025-01-05,GYMLONE,20.00,,980.00",
    "2025-02-05,GYMLONE,20.00,,960.00",
    "2025-03-05,GYMLONE,20.00,,940.00",
    "2025-04-05,GYMLONE,20.00,,920.00",
  ].join("\n");
  await page.goto("/");
  await page.getByTestId("file-input").setInputFiles({
    name: "a.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv),
  });
  await expect(rec(page).getByTestId("recurring-row")).toHaveCount(1);
  await expect(
    rec(page).getByRole("link", { name: /Download list/ }),
  ).toHaveAttribute("href", /^data:text\/csv/);
  await expect(
    rec(page).getByRole("link", { name: /Download calendar/ }),
  ).toHaveAttribute("href", /^data:text\/calendar/);
});
