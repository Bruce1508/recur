import type { RecurringSeries } from "./types";

/** A yearly guess from one day's charge alone: nothing yet shows a schedule. */
export function isSingleChargeCandidate(s: RecurringSeries): boolean {
  return (
    s.cadence === "annual-possible" &&
    new Set(s.occurrences.map((t) => t.date)).size === 1
  );
}

/** Splits the series into the main list and the single-charge yearly candidates. */
export function splitSingleCharge(series: readonly RecurringSeries[]): {
  readonly main: readonly RecurringSeries[];
  readonly singles: readonly RecurringSeries[];
} {
  return {
    main: series.filter((s) => !isSingleChargeCandidate(s)),
    singles: series.filter(isSingleChargeCandidate),
  };
}
