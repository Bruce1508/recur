import Papa from "papaparse";
import { decimal, neutralise } from "./exportCsv";
import { CONFIDENCE_LABEL, cadenceLabel } from "./recurring/labels";
import type { RecurringSeries } from "./recurring/types";

const yesNo = (b: boolean): string => (b ? "yes" : "no");

/**
 * The recurring list as CSV, one row per series as shown on screen (FR-13). Amounts are plain
 * numbers, text is neutralised against formula injection, and a byte order mark lets Excel read
 * accents.
 */
export function exportRecurringCsv(series: readonly RecurringSeries[]): string {
  return `﻿${Papa.unparse({
    fields: [
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
    ],
    data: series.map((s) => [
      neutralise(s.displayName),
      cadenceLabel(s.cadence),
      decimal(s.typicalAmount),
      yesNo(s.amountKind === "variable"),
      s.priceChange
        ? `from ${decimal(s.priceChange.from)} to ${decimal(s.priceChange.to)} on ${s.priceChange.since}`
        : "",
      decimal(s.monthlyEquivalent),
      decimal(s.annualCost),
      s.nextExpected,
      CONFIDENCE_LABEL[s.confidence],
      yesNo(s.ambiguous),
      String(new Set(s.occurrences.map((t) => t.id)).size),
    ]),
  })}`;
}
