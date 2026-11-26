import Papa from "papaparse";
import { expect, test } from "vitest";
import { exportRecurringCsv } from "./exportRecurring";
import type { RecurringSeries } from "./recurring/types";

const s = (over: Partial<RecurringSeries>): RecurringSeries => ({
  merchantKey: "STREAMLY",
  displayName: "Streamly",
  cadence: "monthly",
  ambiguous: false,
  typicalAmount: 1699,
  amountKind: "fixed",
  monthlyEquivalent: 1699,
  annualCost: 20388,
  occurrences: [],
  nextExpected: "2026-01-05",
  confidence: "high",
  ...over,
});

const parse = (csv: string) =>
  Papa.parse<string[]>(csv.replace(/^﻿/, ""), { skipEmptyLines: true }).data;

test("one row per series with plain-number amounts", () => {
  const rows = parse(
    exportRecurringCsv([
      s({}),
      s({
        displayName: "Gym",
        cadence: "weekly",
        typicalAmount: 1699,
        monthlyEquivalent: 7362,
        annualCost: 88348,
        priceChange: { from: 1500, to: 1699, since: "2025-07-12" },
        confidence: "medium",
      }),
    ]),
  );
  expect(rows[0]).toEqual([
    "Name",
    "How often",
    "Amount",
    "Amount varies",
    "Price change",
    "Per month",
    "Per year",
    "Next expected",
    "Confidence",
    "App store or processor",
    "Charges",
  ]);
  expect(rows[1]).toEqual([
    "Streamly",
    "Monthly",
    "16.99",
    "no",
    "",
    "16.99",
    "203.88",
    "2026-01-05",
    "High",
    "no",
    "0",
  ]);
  expect(rows[2]).toEqual([
    "Gym",
    "Weekly",
    "16.99",
    "no",
    "from 15.00 to 16.99 on 2025-07-12",
    "73.62",
    "883.48",
    "2026-01-05",
    "Medium",
    "no",
    "0",
  ]);
});

test("a name that a spreadsheet would run as a formula is neutralised; commas are quoted", () => {
  const csv = exportRecurringCsv([s({ displayName: '=HYPERLINK("x"), a' })]);
  expect(csv).toContain(`"'=HYPERLINK(""x""), a"`);
  expect(parse(csv)[1]?.[0]).toBe(`'=HYPERLINK("x"), a`);
});

test("starts with a byte order mark and has only a header for an empty list", () => {
  const csv = exportRecurringCsv([]);
  expect(csv.startsWith("﻿")).toBe(true);
  expect(parse(csv)).toHaveLength(1);
});
