import type { Cadence } from "./types";

/** Median-gap windows in days (ARCHITECTURE 6.8). `recurring/` reuses these; annual is added there. */
export const CADENCE_BUCKETS: readonly {
  readonly cadence: Cadence;
  readonly min: number;
  readonly max: number;
}[] = [
  { cadence: "weekly", min: 6, max: 8 },
  { cadence: "biweekly", min: 12, max: 16 },
  { cadence: "monthly", min: 28, max: 33 },
  { cadence: "quarterly", min: 85, max: 95 },
];

export const bucketOf = (gap: number): Cadence | undefined =>
  CADENCE_BUCKETS.find((b) => gap >= b.min && gap <= b.max)?.cadence;

/**
 * The bucket of the median gap, when at least two thirds of the gaps fall in that same bucket.
 * Needs two gaps (three occurrences); fewer gives no cadence.
 */
export function cadenceOfGaps(gaps: readonly number[]): Cadence | undefined {
  if (gaps.length < 2) return undefined;
  const sorted = [...gaps].sort((a, b) => a - b);
  const median = sorted[Math.floor((sorted.length - 1) / 2)] ?? 0;
  const cadence = bucketOf(median);
  if (cadence === undefined) return undefined;
  const inside = gaps.filter((g) => bucketOf(g) === cadence).length;
  return inside * 3 >= gaps.length * 2 ? cadence : undefined;
}

/**
 * True when every amount is within 7.5% or 1.00 (whichever is larger) of the median amount
 * (ADR-014, ADR-021). Integer cents; the median is the lower middle value. Needs two amounts.
 */
export function amountsStable(cents: readonly number[]): boolean {
  if (cents.length < 2) return false;
  const sorted = cents.map(Math.abs).sort((a, b) => a - b);
  const median = lowerMedian(sorted);
  return sorted.every((c) => withinTolerance(c, median));
}

/** The lower middle value of an ascending list; 0 for an empty one. */
export const lowerMedian = (sorted: readonly number[]): number =>
  sorted[Math.floor((sorted.length - 1) / 2)] ?? 0;

/** Within 7.5% or 1.00 (whichever is larger) of `median`, in integer cents. */
export const withinTolerance = (cents: number, median: number): boolean =>
  Math.abs(cents - median) * 1000 <= Math.max(100_000, median * 75);
