import { expect, test } from "@playwright/test";

const withBalance = [
  "Date,Description,Amount,Balance",
  "2025-01-01,PAY,1000.00,1000.00",
  "2025-01-02,COFFEE,-4.50,995.50",
  "2025-01-03,BOOKS,-20.00,975.50",
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
  await expect(page.getByText("Verified")).toBeVisible();
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
