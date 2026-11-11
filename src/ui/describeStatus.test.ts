import { expect, test } from "vitest";
import { describeStatus } from "./Importer";

test("each reconciliation result has its own wording, naming the row on a mismatch", () => {
  expect(
    describeStatus({ status: "verified", method: "running-balance" }),
  ).toMatch(/^Verified/);
  expect(
    describeStatus({
      status: "mismatch",
      expected: 1,
      actual: 2,
      firstBadRow: 7,
    }),
  ).toContain("row 7");
  expect(
    describeStatus({
      status: "unverifiable",
      reason: "this file has no balances",
    }),
  ).toBe("Cannot verify: this file has no balances");
});
