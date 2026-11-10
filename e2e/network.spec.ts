import { expect, test } from "@playwright/test";

test("page makes no cross-origin requests and sends no request bodies", async ({
  page,
}) => {
  const origin = "http://localhost:4173";
  const offenders: string[] = [];
  page.on("request", (req) => {
    const url = new URL(req.url());
    if (url.protocol === "data:") return; // inline, never leaves the browser; origin is "null"
    if (url.origin !== origin || req.postData() !== null)
      offenders.push(req.url());
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Recur" })).toBeVisible();
  expect(offenders).toEqual([]);
});
