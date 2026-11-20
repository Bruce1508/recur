import { expect, test } from "vitest";
import { describeBoundary, describeEnds, describeStatus } from "./Importer";

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

test("describeEnds names only the ends that are not checked", () => {
  expect(describeEnds({ start: true, end: true })).toBe("");
  expect(describeEnds({ start: false, end: true })).toMatch(
    /the start of the file/,
  );
  expect(describeEnds({ start: true, end: false })).toMatch(
    /the end of the file/,
  );
  expect(describeEnds({ start: false, end: false })).toMatch(
    /the start and the end of the file/,
  );
});

test("describeBoundary names both files and the balances, and is empty when chained", () => {
  const name = (id: string) => `${id}.csv`;
  const base = { before: "a", after: "b" };
  expect(
    describeBoundary({ ...base, outcome: { status: "chained" } }, name),
  ).toBe("");
  const gap = describeBoundary(
    { ...base, outcome: { status: "gap", expected: 97550, actual: 87550 } },
    name,
  );
  expect(gap).toContain("a.csv then b.csv");
  expect(gap).toContain("975.50");
  expect(gap).toContain("875.50");
  expect(gap).toMatch(/may be missing/);
  expect(gap).toMatch(/first or last rows/);
  expect(
    describeBoundary(
      { ...base, outcome: { status: "mismatch", expected: 1, actual: 2 } },
      name,
    ),
  ).toMatch(/missing or wrong/);
  expect(
    describeBoundary(
      {
        ...base,
        outcome: { status: "unchainable", reason: "the periods overlap" },
      },
      name,
    ),
  ).toContain("the periods overlap");
});
