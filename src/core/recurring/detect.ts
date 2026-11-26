import {
  bucketOf,
  cadenceOfGaps,
  lowerMedian,
  withinTolerance,
} from "../merchant/cadence";
import { type DecodeContext, decodeDescription } from "../merchant/decode";
import { addDays, addMonths, daysBetween, isMonthEnd } from "../plainDate";
import type { Cents, PlainDate, Transaction } from "../types";
import type { RecurringSeries, SeriesCadence } from "./types";

const NOT_A_CHARGE = new Set(["TFR", "TRANSFER", "ETRANSFER", "XFER", "ATM"]);
const PAY_WORDS = new Set(["PAYMENT", "PYMT", "PMT"]);
// PYMT and PMT are guesses at how a bank abbreviates a payment: unverified for TD. PREAUTH is not a card word (pre-authorized debits pay bills).
const CARD_WORDS = new Set([
  "CARD",
  "VISA",
  "MASTERCARD",
  "MC",
  "AMEX",
  "THANK",
]);
/** Moving money, not buying: transfers, cash and card payments (a bill named "PAYMENT" is a charge). */
const notACharge = (key: string): boolean => {
  const words = key.split(/[^A-Z0-9]+/);
  return (
    words.some((w) => NOT_A_CHARGE.has(w)) ||
    (words.some((w) => PAY_WORDS.has(w)) &&
      words.some((w) => CARD_WORDS.has(w)))
  );
};
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

/**
 * The latest sustained price change, found conservatively. Amounts are cut into runs wherever one
 * leaves the tolerance of its run's median, but a cut only counts when the jump from the previous
 * amount is itself beyond the tolerance (a slow drift is not a step). Only runs of at least two
 * charges are price levels, so a prorated first charge, a one-off odd charge or a single new
 * charge is not sustained; neighbouring levels at the same price merge. Anything ambiguous returns
 * nothing and the series is a variable bill: levels that come back to an earlier price (seasonal
 * bills, two prices that alternate), or amounts that mostly never settle on a price (groceries).
 */
function lastPriceChange(
  amounts: readonly Cents[],
  dates: readonly PlainDate[],
): { from: Cents; to: Cents; since: PlainDate } | undefined {
  const runs: { start: number; amounts: Cents[] }[] = [];
  amounts.forEach((a, i) => {
    const run = runs[runs.length - 1];
    const prev = amounts[i - 1] ?? a;
    if (
      run &&
      (withinTolerance(a, median(run.amounts)) || withinTolerance(a, prev))
    )
      run.amounts.push(a);
    else runs.push({ start: i, amounts: [a] });
  });
  const levels: { start: number; level: Cents }[] = [];
  let covered = 0;
  for (const r of runs) {
    if (r.amounts.length < 2) continue;
    covered += r.amounts.length;
    const level = median(r.amounts);
    const last = levels[levels.length - 1];
    if (!last || !withinTolerance(level, last.level)) {
      if (levels.some((l) => withinTolerance(level, l.level))) return undefined;
      levels.push({ start: r.start, level });
    }
  }
  if (covered / amounts.length < FIXED_SHARE) return undefined;
  const to = levels[levels.length - 1];
  const from = levels[levels.length - 2];
  return to && from
    ? { from: from.level, to: to.level, since: dates[to.start] ?? "" }
    : undefined;
}

const PERIOD_DAYS: Record<string, number> = { weekly: 7, biweekly: 14 };
const next = (
  date: PlainDate,
  cadence: SeriesCadence,
  anchorDay: number,
): PlainDate =>
  cadence === "weekly" || cadence === "biweekly"
    ? addDays(date, PERIOD_DAYS[cadence] ?? 0)
    : addMonths(
        date,
        cadence === "monthly" ? 1 : cadence === "quarterly" ? 3 : 12,
        anchorDay,
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
    if (notACharge(d.merchantKey)) continue;
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
      ambiguous: STORES.has(merchantKey.split(/[^A-Z0-9]+/)[0] ?? ""),
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
  // A last charge on the last day of a month may be a clamped 29th to 31st: keep the billing day.
  const anchorDay = isMonthEnd(lastDate)
    ? Math.max(...dates.map((d) => Number(d.slice(8, 10))))
    : Number(lastDate.slice(8, 10));
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
    nextExpected: next(lastDate, cadence, anchorDay),
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
    return amounts.every((a) => withinTolerance(a, m))
      ? body("annual", m, "fixed", days.length >= 3 ? "high" : "medium")
      : body(
          "annual-possible",
          amounts[amounts.length - 1] ?? 0,
          "fixed",
          "low",
        );
  }

  if (days.length === 2) {
    const cadence = bucketOf(gaps[0] ?? 0);
    return cadence && withinTolerance(amounts[0] ?? 0, amounts[1] ?? 0)
      ? body(cadence, m, "fixed", "low")
      : nearYearly(gaps, amounts, body);
  }

  const cadence = cadenceOfGaps(gaps);
  if (!cadence) return nearYearly(gaps, amounts, body);
  const regular =
    gaps.filter((g) => bucketOf(g) === cadence).length / gaps.length;
  const change = lastPriceChange(amounts, dates);
  if (change)
    return body(
      cadence,
      change.to,
      "fixed",
      days.length >= 4 && regular >= 0.8 ? "high" : "medium",
      change,
    );
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
  // Varying amounts make a bill only when it comes monthly or quarterly; weekly or fortnightly
  // purchases with varying amounts are shopping habits, not charges to track.
  if (cadence === "weekly" || cadence === "biweekly") return undefined;
  return body(cadence, m, "variable", days.length >= 5 ? "medium" : "low");
}

/** Charges close to a year apart that do not fit the yearly window or share an amount stay possible, not lost. */
function nearYearly(
  gaps: readonly number[],
  amounts: readonly Cents[],
  body: (
    c: SeriesCadence,
    t: Cents,
    k: "fixed" | "variable",
    conf: "low",
  ) => Body,
): Body | undefined {
  const biggest = Math.max(...amounts);
  return gaps.some((g) => g >= 330 && g <= 400) && biggest >= LARGE
    ? body("annual-possible", amounts[amounts.length - 1] ?? 0, "fixed", "low")
    : undefined;
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
