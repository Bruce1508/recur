import {
  amountsStable,
  bucketOf,
  cadenceOfGaps,
  lowerMedian,
  withinTolerance,
} from "../merchant/cadence";
import { type DecodeContext, decodeDescription } from "../merchant/decode";
import { addDays, addMonths, daysBetween } from "../plainDate";
import type { Cents, PlainDate, Transaction } from "../types";
import type { RecurringSeries, SeriesCadence } from "./types";

const NOT_A_CHARGE = new Set([
  "TFR",
  "TRANSFER",
  "ETRANSFER",
  "XFER",
  "PAYMENT",
  "ATM",
  "WITHDRAWAL",
]);
const STORES = new Set([
  "APPLE",
  "GOOGLE",
  "ITUNES",
  "PAYPAL",
  "AMAZON",
  "AMZN",
]);
/** One charge at or above this is shown as a possible yearly charge ($50.00). */
const LARGE: Cents = 5000;
const FIXED_SHARE = 0.8;
const YEAR = { min: 350, max: 380 } as const;
const NEEDS_DAYS = 395;

interface Day {
  readonly date: PlainDate;
  readonly amount: Cents;
  readonly txs: readonly Transaction[];
}

const byDateThenId = (a: Transaction, b: Transaction): number =>
  a.date < b.date
    ? -1
    : a.date > b.date
      ? 1
      : a.id < b.id
        ? -1
        : a.id > b.id
          ? 1
          : 0;

const median = (xs: readonly number[]): number =>
  lowerMedian([...xs].sort((a, b) => a - b));

/** First index where the amounts step to a new level that holds for at least two charges. */
function stepAt(amounts: readonly Cents[]): number | undefined {
  for (let k = 1; k <= amounts.length - 2; k++) {
    const before = amounts.slice(0, k);
    const after = amounts.slice(k);
    if (
      (before.length < 2 || amountsStable(before)) &&
      amountsStable(after) &&
      !withinTolerance(median(after), median(before))
    )
      return k;
  }
  return undefined;
}

const PERIOD_DAYS: Record<string, number> = { weekly: 7, biweekly: 14 };
const next = (date: PlainDate, cadence: SeriesCadence): PlainDate =>
  cadence === "weekly" || cadence === "biweekly"
    ? addDays(date, PERIOD_DAYS[cadence] ?? 0)
    : addMonths(
        date,
        cadence === "monthly" ? 1 : cadence === "quarterly" ? 3 : 12,
      );
const PER_YEAR: Record<SeriesCadence, number> = {
  weekly: 52,
  biweekly: 26,
  monthly: 12,
  quarterly: 4,
  annual: 1,
  "annual-possible": 1,
};
const monthlyOf = (amount: Cents, cadence: SeriesCadence): Cents =>
  Math.round((amount * PER_YEAR[cadence]) / 12);

/**
 * Recurring charges in a ledger (ADR-014): money-out lines grouped by the decoder's key, gaps
 * bucketed into a cadence, amounts scored for stability, a sustained step reported as a price
 * change. Pure; the same lines in any order give the same series, each with its evidence.
 */
export function detectRecurring(
  transactions: readonly Transaction[],
  ctx: DecodeContext,
): RecurringSeries[] {
  const groups = new Map<string, Transaction[]>();
  const first = new Map<string, ReturnType<typeof decodeDescription>>();
  for (const t of [...transactions].sort(byDateThenId)) {
    if (t.amount >= 0) continue;
    const d = decodeDescription(t.description, ctx);
    if (d.merchantKey === "") continue;
    if (d.merchantKey.split(/[^A-Z0-9]+/).some((w) => NOT_A_CHARGE.has(w)))
      continue;
    const rows = groups.get(d.merchantKey);
    if (rows) rows.push(t);
    else {
      groups.set(d.merchantKey, [t]);
      first.set(d.merchantKey, d);
    }
  }

  const out: RecurringSeries[] = [];
  for (const [merchantKey, rows] of groups) {
    const days: Day[] = [];
    for (const t of rows) {
      const last = days[days.length - 1];
      if (last && last.date === t.date)
        days[days.length - 1] = {
          ...last,
          amount: last.amount - t.amount,
          txs: [...last.txs, t],
        };
      else days.push({ date: t.date, amount: -t.amount, txs: [t] });
    }
    const decoded = first.get(merchantKey);
    const series = classify(days);
    if (!series || !decoded) continue;
    out.push({
      merchantKey,
      displayName:
        decoded.reading.kind === "name" ? decoded.reading.name : merchantKey,
      ambiguous:
        decoded.processor !== undefined ||
        STORES.has(merchantKey.split(/[^A-Z0-9]+/)[0] ?? ""),
      occurrences: days.flatMap((d) => d.txs),
      ...series,
    });
  }
  return out.sort(
    (a, b) =>
      b.monthlyEquivalent - a.monthlyEquivalent ||
      (a.merchantKey < b.merchantKey
        ? -1
        : a.merchantKey > b.merchantKey
          ? 1
          : 0),
  );
}

type Body = Pick<
  RecurringSeries,
  | "cadence"
  | "typicalAmount"
  | "amountKind"
  | "monthlyEquivalent"
  | "nextExpected"
  | "priceChange"
  | "confidence"
>;

function classify(days: readonly Day[]): Body | undefined {
  const amounts = days.map((d) => d.amount);
  const dates = days.map((d) => d.date);
  const lastDate = dates[dates.length - 1] ?? "";
  const body = (
    cadence: SeriesCadence,
    typical: Cents,
    kind: "fixed" | "variable",
    confidence: Body["confidence"],
    priceChange?: Body["priceChange"],
  ): Body => ({
    cadence,
    typicalAmount: typical,
    amountKind: kind,
    monthlyEquivalent: monthlyOf(typical, cadence),
    nextExpected: next(lastDate, cadence),
    confidence,
    ...(priceChange ? { priceChange } : {}),
  });

  if (days.length === 1) {
    const a = amounts[0] ?? 0;
    return a >= LARGE ? body("annual-possible", a, "fixed", "low") : undefined;
  }

  const gaps = dates.slice(1).map((d, i) => daysBetween(dates[i] ?? d, d));
  const m = median(amounts);
  if (gaps.every((g) => g >= YEAR.min && g <= YEAR.max)) {
    if (!amounts.every((a) => withinTolerance(a, m))) return undefined;
    return body("annual", m, "fixed", days.length >= 3 ? "high" : "medium");
  }

  if (days.length === 2) {
    const cadence = bucketOf(gaps[0] ?? 0);
    return cadence && withinTolerance(amounts[0] ?? 0, amounts[1] ?? 0)
      ? body(cadence, m, "fixed", "low")
      : undefined;
  }

  const cadence = cadenceOfGaps(gaps);
  if (!cadence) return undefined;
  const regular =
    gaps.filter((g) => bucketOf(g) === cadence).length / gaps.length;
  const k = stepAt(amounts);
  if (k !== undefined) {
    const from = median(amounts.slice(0, k));
    const to = median(amounts.slice(k));
    return body(
      cadence,
      to,
      "fixed",
      days.length >= 4 && regular >= 0.8 ? "high" : "medium",
      {
        from,
        to,
        since: dates[k] ?? lastDate,
      },
    );
  }
  const fixed =
    amounts.filter((a) => withinTolerance(a, m)).length / amounts.length >=
    FIXED_SHARE;
  if (fixed)
    return body(
      cadence,
      m,
      "fixed",
      days.length >= 4 && regular >= 0.8 ? "high" : "medium",
    );
  return body(cadence, m, "variable", days.length >= 5 ? "medium" : "low");
}

/** Says when the history is too short to confirm a yearly charge (FR-15). */
export function annualHistoryNote(
  transactions: readonly Transaction[],
): string | undefined {
  if (transactions.length === 0) return undefined;
  const dates = transactions.map((t) => t.date).sort();
  const span = daysBetween(dates[0] ?? "", dates[dates.length - 1] ?? "");
  if (span >= NEEDS_DAYS) return undefined;
  return `The files cover about ${Math.max(1, Math.round(span / 30.44))} month(s). A yearly charge needs 13 months or more of history to be confirmed.`;
}
