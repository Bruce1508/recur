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

test("a PDF mismatch names the page and the line on that page, and each method has its own verified text", () => {
  expect(
    describeStatus({
      status: "mismatch",
      expected: 1,
      actual: 2,
      firstBadSource: {
        statementId: "p",
        input: "pdf",
        page: 2,
        lineIndex: 13,
      },
    }),
  ).toBe(
    "Mismatch on page 2, line 14: the printed balance does not follow from the amounts",
  );
  const verified = (["running-balance", "checkpoints", "totals"] as const).map(
    (method) => describeStatus({ status: "verified", method }),
  );
  expect(new Set(verified).size).toBe(3);
  for (const v of verified) expect(v).toMatch(/^Verified: /);
});
