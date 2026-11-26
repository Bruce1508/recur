import type { Cadence } from "../merchant/types";
import type { Cents, PlainDate, Transaction } from "../types";

export type SeriesCadence = Cadence | "annual" | "annual-possible";

export interface RecurringSeries {
  /** The decoder's cleaned description: what the lines were grouped by. */
  readonly merchantKey: string;
  readonly displayName: string;
  readonly cadence: SeriesCadence;
  /** The description names only an app store or a payment processor (FR-14). */
  readonly ambiguous: boolean;
  /** Positive cents. After a price change, the new price. */
  readonly typicalAmount: Cents;
  readonly amountKind: "fixed" | "variable";
  readonly monthlyEquivalent: Cents;
  /** The typical amount times how many times a year it is charged, rounded once. */
  readonly annualCost: Cents;
  /** The money-out lines behind the series, oldest first: the evidence. */
  readonly occurrences: readonly Transaction[];
  readonly nextExpected: PlainDate;
  readonly priceChange?: {
    readonly from: Cents;
    readonly to: Cents;
    readonly since: PlainDate;
  };
  readonly confidence: "high" | "medium" | "low";
}
