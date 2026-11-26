import { expect, test } from "vitest";
import type { Transaction } from "../core/types";
import { monthsOf, verifiedIds } from "./readoutView";

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

test("an id is verified only when every statement with that id is", () => {
  expect(
    verifiedIds([
      { id: "a", verified: true },
      { id: "a", verified: false },
      { id: "b", verified: true },
      { id: "c", verified: false },
    ]),
  ).toEqual(new Set(["b"]));
});
