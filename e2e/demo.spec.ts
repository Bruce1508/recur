import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("the sample data loads with one click, verifies, and makes no request", async ({
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
  await expect(page.getByTestId("readout")).toHaveCount(0);
  await page.getByRole("button", { name: "Try with sample data" }).click();
  await expect(page.getByText(/^Verified:/).first()).toBeVisible();
  await expect(page.getByTestId("readout")).toBeVisible();
  await expect(
    page.getByTestId("readout").getByRole("row", { name: /Corner Cafe/ }),
  ).toBeVisible();
  await expect(
    page.getByTestId("readout").getByRole("row", { name: /Ironworks Gym/ }),
  ).toBeVisible();
  await page.getByTestId("readout").screenshot({
    path: "docs/evidence/demo-loaded.png",
  });
  const { violations } = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(violations.map((v) => v.id)).toEqual([]);
  expect(offenders).toEqual([]);
});

test("the sample can be removed like any file", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Try with sample data" }).click();
  await page.getByRole("button", { name: "Remove file" }).click();
  await expect(page.getByTestId("readout")).toHaveCount(0);
});
