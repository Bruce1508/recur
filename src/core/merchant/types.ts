import type { PlainDate } from "../types";

export type ReadingSource = "user" | "brand" | "rule";

/** What a description is read as. `unknown` carries no name: a guess is never shown. */
export type Reading =
  | {
      readonly kind: "name";
      readonly name: string;
      readonly source: ReadingSource;
      readonly confidence: "user" | "high" | "medium";
    }
  | { readonly kind: "unknown" };

export interface Decoded {
  /** Cleaned key: what recurring detection groups by and what a user label matches on. */
  readonly merchantKey: string;
  readonly reading: Reading;
  /** From the processor-prefix rule (FR-14). */
  readonly processor?: string;
  /** `meaning` only from a sourced entry in the bank profile's `bankCodes`. */
  readonly bankCode?: { readonly code: string; readonly meaning?: string };
  /** What the cleaning rules cut, in order, as `rule: text`. */
  readonly removed: readonly string[];
}

export type Cadence = "weekly" | "biweekly" | "monthly" | "quarterly";

export interface BehaviourHint {
  readonly merchantKey: string;
  readonly count: number;
  readonly cadence?: Cadence;
  readonly amountStable: boolean;
  readonly first: PlainDate;
  readonly last: PlainDate;
  /** Every occurrence came from a verified statement. */
  readonly verified: boolean;
}

/** `match` holds the description forms (upper case) that identify the brand. */
export interface Brand {
  readonly name: string;
  readonly match: readonly string[];
}

export interface LabelFile {
  readonly version: 1;
  readonly labels: readonly { readonly key: string; readonly name: string }[];
}
