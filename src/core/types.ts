// Domain types shared by the pipeline (docs/ARCHITECTURE.md §5).
// PDF-only types (RawDocument, LineDocument) arrive with stage 2 (M5);
// RecurringSeries arrives with M2.

/** Integer cents. Never store or add dollars as floats. */
export type Cents = number;

/** Calendar date as "YYYY-MM-DD". No times, no time zones. */
export type PlainDate = string;

export type DateFormat = "YYYY-MM-DD" | "MM/DD/YYYY" | "DD/MM/YYYY";

export type AccountKind = "deposit" | "credit";

/** Which CSV column holds what. Indexes, because some exports have no header row. */
export interface ColumnMapping {
  hasHeader: boolean;
  date: number;
  dateFormat: DateFormat;
  description: number;
  amount: { signed: number } | { debit: number; credit: number };
  balance?: number;
  /** "low" means the UI must ask the user to confirm before use. */
  confidence: "high" | "low";
}

export interface Transaction {
  /** Stable hash of statement + row position. */
  id: string;
  date: PlainDate;
  postedDate?: PlainDate;
  /** As printed, whitespace-collapsed. */
  description: string;
  /** Signed: negative = money out. */
  amount: Cents;
  balanceAfter?: Cents;
  source:
    | { statementId: string; input: "csv"; row: number }
    | { statementId: string; input: "pdf"; page: number; lineIndex: number };
}

export interface ParsedStatement {
  id: string;
  input: "csv" | "pdf";
  /** "unknown" for a CSV the app could not attribute. */
  bankId: string;
  kind: AccountKind;
  period: { start: PlainDate; end: PlainDate };
  openingBalance?: Cents;
  closingBalance?: Cents;
  transactions: Transaction[];
  warnings: string[];
}

export type Reconciliation =
  | { status: "verified"; method: "totals" | "running-balance" }
  | { status: "mismatch"; expected: Cents; actual: Cents; firstBadRow?: number }
  | { status: "unverifiable"; reason: string };
