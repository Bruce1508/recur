import { expect, type Page, test } from "@playwright/test";
import { makeTextPdf } from "../tools/makePdf";
import { makeTdStatement } from "../tools/makeTdStatement";

const withBalance = [
  "Date,Description,Debit,Credit,Balance",
  "2025-01-01,PAY,,1000.00,1000.00",
  "2025-01-02,COFFEE,4.50,,995.50",
  "2025-01-03,BOOKS,20.00,,975.50",
].join("\n");

const noBalance = [
  "Date,Description,Amount",
  "2025-01-02,COFFEE,4.50",
  "2025-01-03,BOOKS,20.00",
].join("\n");

function csv(name: string, body: string) {
  return { name, mimeType: "text/csv", buffer: Buffer.from(body) };
}

test("a CSV with balances imports, verifies, and sends nothing", async ({
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
  await page.getByTestId("file-input").setInputFiles(csv("a.csv", withBalance));
  await expect(
    page.getByText("Verified: every balance matches the rows around it"),
  ).toBeVisible();
  await expect(page.getByText("Transactions (3)")).toBeVisible();
  expect(offenders).toEqual([]);
});

test("a lone signed amount waits for confirmation, then shows the status", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByTestId("file-input").setInputFiles(csv("b.csv", noBalance));
  await expect(page.getByText("Confirm columns: b.csv")).toBeVisible();
  await expect(page.getByText("Transactions (")).toHaveCount(0);
  await page.getByRole("button", { name: "Confirm" }).click();
  await expect(
    page.getByText("Cannot verify: this file has no balances"),
  ).toBeVisible();
  await expect(page.getByText("Transactions (2)")).toBeVisible();
});

test("a file that is not a transaction export shows a clear message", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByTestId("file-input")
    .setInputFiles(csv("notes.csv", "hello\nworld"));
  await expect(page.getByRole("alert")).toContainText("cannot read this file");
});

test("a signed amount with a balance still asks, and shows the column roles", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByTestId("file-input")
    .setInputFiles(
      csv(
        "card.csv",
        [
          "Date,Description,Amount,Balance",
          "2025-01-01,STORE,10.00,10.00",
          "2025-01-02,CAFE,4.50,14.50",
          "2025-01-03,PAYMENT,-14.50,0.00",
        ].join("\n"),
      ),
    );
  await expect(page.getByText("Confirm columns: card.csv")).toBeVisible();
  await expect(
    page.getByRole("columnheader", { name: "Balance" }),
  ).toBeVisible();
});

// Invented data, generated in memory (ADR-016).
const tdPdf = makeTextPdf(
  makeTdStatement({
    period: "SEP 01/25 - OCT 01/25",
    opening: 100000,
    days: [
      { date: "SEP02", rows: [{ desc: "FAKE COFFEE", cents: -450 }] },
      { date: "SEP03", rows: [{ desc: "ACME PAYROLL", cents: 250000 }] },
    ],
  }).pdf,
);

function pdf(name: string, bytes: Uint8Array) {
  return { name, mimeType: "application/pdf", buffer: Buffer.from(bytes) };
}

function watchRequests(page: Page) {
  const origin = "http://localhost:4173";
  const offenders: string[] = [];
  page.on("request", (req) => {
    const url = new URL(req.url());
    if (url.protocol === "data:") return;
    if (url.origin !== origin || req.postData() !== null)
      offenders.push(req.url());
  });
  return offenders;
}

test("a TD chequing PDF verifies under the CSP and sends nothing", async ({
  page,
}) => {
  const offenders = watchRequests(page);
  await page.goto("/");
  await page.getByTestId("file-input").setInputFiles(pdf("td.pdf", tdPdf));
  await expect(
    page.getByText(
      "Verified: every printed balance and the statement totals follow from the amounts",
    ),
  ).toBeVisible();
  await expect(page.getByText("Transactions (2)")).toBeVisible();
  expect(offenders).toEqual([]);
});

test("a PDF of an unknown format shows the unsupported-format message", async ({
  page,
}) => {
  const other = makeTextPdf({
    pages: [
      { width: 612, height: 792, items: [{ str: "Hello", x: 72, y: 72 }] },
    ],
  });
  await page.goto("/");
  await page.getByTestId("file-input").setInputFiles(pdf("other.pdf", other));
  await expect(page.getByRole("alert")).toContainText("unsupported format");
});

test("a CSV joins a verified PDF only when the user puts it in that account, then is not double-counted", async ({
  page,
}) => {
  const overlap = [
    "Date,Description,Debit,Credit",
    "2025-09-02,COFFEE (CSV TEXT),4.50,",
    "2025-09-03,PAYROLL (CSV TEXT),,2500.00",
    "2025-10-05,AFTER THE STATEMENT,9.99,",
  ].join("\n");
  await page.goto("/");
  await page
    .getByTestId("file-input")
    .setInputFiles([pdf("td.pdf", tdPdf), csv("export.csv", overlap)]);
  await expect(page.getByText("Transactions (5)")).toBeVisible();
  await expect(page.getByTestId("ledger-notes")).toContainText(
    "0 duplicate row(s) removed",
  );
  await page.getByLabel("Account for export.csv").selectOption("A");
  await expect(page.getByText("Transactions (3)")).toBeVisible();
  await expect(page.getByTestId("ledger-notes")).toContainText(
    "2 duplicate row(s) removed",
  );
});

test("two CSVs of one account chain; a missing first row of the second is reported", async ({
  page,
}) => {
  const second = [
    "Date,Description,Debit,Credit,Balance",
    "2025-01-04,RENT,100.00,,875.50",
    "2025-01-05,PAY,,50.00,925.50",
    "2025-01-06,FOOD,10.00,,915.50",
  ].join("\n");
  const cut = second
    .split("\n")
    .filter((_, i) => i !== 1)
    .join("\n");
  await page.goto("/");
  await page
    .getByTestId("file-input")
    .setInputFiles([csv("a.csv", withBalance), csv("b.csv", second)]);
  await expect(page.getByText("Transactions (6)")).toBeVisible();
  await expect(page.getByTestId("chain-notes")).toHaveText("");
  await expect(
    page.getByText("Not checked: the start of the file"),
  ).toHaveCount(1);
  await expect(page.getByText("Not checked: the end of the file")).toHaveCount(
    1,
  );

  await page.goto("/");
  await page
    .getByTestId("file-input")
    .setInputFiles([csv("a.csv", withBalance), csv("c.csv", cut)]);
  await expect(page.getByTestId("chain-notes")).toContainText(
    "a.csv then c.csv",
  );
  await page.screenshot({
    path: "docs/evidence/chain-boundary.png",
    fullPage: true,
  });
});
