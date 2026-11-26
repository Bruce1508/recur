import { expect, test } from "vitest";
import type { Transaction } from "../core/types";
import { monthsOf } from "./readoutView";

const tx = (date: string): Transaction => ({
  id: date,
  date,
  description: "X",
  amount: -1,
  source: { statementId: "s", input: "csv", row: 1 },
});

test("months are distinct and newest first", () => {
  expect(
    monthsOf([tx("2025-01-31"), tx("2025-03-01"), tx("2025-01-02")]),
  ).toEqual(["2025-03", "2025-01"]);
  expect(monthsOf([])).toEqual([]);
});
