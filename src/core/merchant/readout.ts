import type { Cents, Transaction } from "../types";
import { lowerMedian, withinTolerance } from "./cadence";
import { type DecodeContext, decodeDescription } from "./decode";
import type { ReadingSource } from "./types";

/** Money out and in are positive cents. `name` is null for the unknown group only. */
export interface ReadoutGroup {
  readonly name: string | null;
  readonly sources: readonly ReadingSource[];
  readonly moneyOut: Cents;
  readonly moneyIn: Cents;
  readonly count: number;
  /** False when any line came from a statement that is not verified (AC-17 labels it). */
  readonly verified: boolean;
}

export interface Readout {
  /** Named groups, largest money out first, then by name. */
  readonly groups: readonly ReadoutGroup[];
  /** Lines with no reading: always its own group, never dropped. */
  readonly unknown: ReadoutGroup;
  readonly moneyOut: Cents;
  readonly moneyIn: Cents;
  /** Names whose first line in the ledger falls in `period`. */
  readonly newNames: readonly string[];
  /** Ids of money-out lines in `period` outside 7.5% or 1.00 of the median of at least two earlier lines with the same key. */
  readonly unusual: readonly string[];
}

interface Acc {
  name: string | null;
  sources: Set<ReadingSource>;
  moneyOut: Cents;
  moneyIn: Cents;
  count: number;
  verified: boolean;
  first: string;
}

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

const freeze = (a: Acc): ReadoutGroup => ({
  name: a.name,
  sources: [...a.sources].sort(cmp),
  moneyOut: a.moneyOut,
  moneyIn: a.moneyIn,
  count: a.count,
  verified: a.verified,
});

/**
 * Where the money went (FR-17, AC-17): every transaction lands in exactly one group, so the
 * groups plus `unknown` add up to the ledger's money out and money in to the cent. Pure; the same
 * transactions in any order give the same result. `period` is "YYYY-MM".
 */
export function buildReadout(
  transactions: readonly Transaction[],
  ctx: DecodeContext,
  verifiedStatementIds: ReadonlySet<string>,
  period: string,
): Readout {
  const named = new Map<string, Acc>();
  const unknown: Acc = {
    name: null,
    sources: new Set(),
    moneyOut: 0,
    moneyIn: 0,
    count: 0,
    verified: true,
    first: "",
  };
  const byKey = new Map<string, Transaction[]>();

  for (const t of transactions) {
    const d = decodeDescription(t.description, ctx);
    let acc = unknown;
    if (d.reading.kind === "name") {
      acc = named.get(d.reading.name) ?? {
        name: d.reading.name,
        sources: new Set(),
        moneyOut: 0,
        moneyIn: 0,
        count: 0,
        verified: true,
        first: t.date,
      };
      named.set(d.reading.name, acc);
      acc.sources.add(d.reading.source);
    }
    if (t.amount < 0) acc.moneyOut -= t.amount;
    else acc.moneyIn += t.amount;
    acc.count += 1;
    acc.verified &&= verifiedStatementIds.has(t.source.statementId);
    if (acc.first === "" || t.date < acc.first) acc.first = t.date;
    if (t.amount < 0 && d.merchantKey !== "") {
      const rows = byKey.get(d.merchantKey);
      if (rows) rows.push(t);
      else byKey.set(d.merchantKey, [t]);
    }
  }

  const accs = [...named.values()];
  const unusual: string[] = [];
  for (const rows of byKey.values()) {
    for (const t of rows) {
      if (!t.date.startsWith(period)) continue;
      const earlier = rows
        .filter((o) => o.date < t.date)
        .map((o) => -o.amount)
        .sort((a, b) => a - b);
      if (
        earlier.length >= 2 &&
        !withinTolerance(-t.amount, lowerMedian(earlier))
      )
        unusual.push(t.id);
    }
  }

  const groups = accs
    .sort((a, b) => b.moneyOut - a.moneyOut || cmp(a.name ?? "", b.name ?? ""))
    .map(freeze);
  return {
    groups,
    unknown: freeze(unknown),
    moneyOut: accs.reduce((s, a) => s + a.moneyOut, unknown.moneyOut),
    moneyIn: accs.reduce((s, a) => s + a.moneyIn, unknown.moneyIn),
    newNames: accs
      .filter((a) => a.first.startsWith(period))
      .map((a) => a.name ?? "")
      .sort(cmp),
    unusual: unusual.sort(cmp),
  };
}
