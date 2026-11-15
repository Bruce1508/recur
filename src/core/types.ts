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
  readonly hasHeader: boolean;
  readonly date: number;
  readonly dateFormat: DateFormat;
  readonly description: number;
  readonly amount:
    | { readonly signed: number }
    | { readonly debit: number; readonly credit: number };
  readonly balance?: number;
  /** "low" means the UI must ask the user to confirm before use. */
  readonly confidence: "high" | "low";
}

export interface Transaction {
  /** Stable hash of statement + row position. */
  readonly id: string;
  readonly date: PlainDate;
  readonly postedDate?: PlainDate;
  /** As printed, whitespace-collapsed. */
  readonly description: string;
  /** Signed: negative = money out. */
  readonly amount: Cents;
  readonly balanceAfter?: Cents;
  readonly source:
    | {
        readonly statementId: string;
        readonly input: "csv";
        readonly row: number;
      }
    | {
        readonly statementId: string;
        readonly input: "pdf";
        readonly page: number;
        readonly lineIndex: number;
      };
}

export interface ParsedStatement {
  readonly id: string;
  readonly input: "csv" | "pdf";
  /** A profile id from src/core/profiles/ (stage 2), or "unknown" for a CSV the app could not attribute. */
  readonly bankId: string;
  readonly kind: AccountKind;
  readonly period: { readonly start: PlainDate; readonly end: PlainDate };
  readonly openingBalance?: Cents;
  readonly closingBalance?: Cents;
  readonly transactions: readonly Transaction[];
  readonly warnings: readonly string[];
}

/** One run of text from a PDF page. `x` and `y` are the run's origin from the top-left of the page. */
export interface RawItem {
  readonly str: string;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly font: string;
}

export interface RawPage {
  readonly width: number;
  readonly height: number;
  readonly items: readonly RawItem[];
}

export interface RawDocument {
  readonly meta: {
    readonly producer?: string;
    readonly creator?: string;
    readonly title?: string;
  };
  readonly pages: readonly RawPage[];
}

/** One visual line of a page: its items left to right, and their text joined by single spaces. */
export interface Line {
  /** 1-based page number. */
  readonly page: number;
  /** Top-left-origin y of the line's top-most item. */
  readonly y: number;
  readonly items: readonly RawItem[];
  readonly text: string;
}

export interface LineDocument {
  readonly meta: RawDocument["meta"];
  /** Pages in order, and within a page from top to bottom. */
  readonly lines: readonly Line[];
}

// Row numbers: `source.row` and `firstBadRow` are 1-based line numbers in the CSV file,
// counting the header row if there is one, so they match what a spreadsheet shows.
// `expected` and `actual` are balances for "running-balance" and sums of amounts for "totals".
export type Reconciliation =
  | { status: "verified"; method: "totals" | "running-balance" }
  | { status: "mismatch"; expected: Cents; actual: Cents; firstBadRow?: number }
  | { status: "unverifiable"; reason: string };
