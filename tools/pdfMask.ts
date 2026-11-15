import type { RawDocument } from "../src/core/types";

// Masks a PDF's text so its layout can be shared without its content (ADR-019, ADR-016).
// A run is kept as it is only when it is a money amount, a date or a structural label; every
// other run keeps its shape (letter case, digit count, punctuation) but not its characters.

const MONTH =
  "jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec|january|february|march|april|june|july|august|september|october|november|december";

const MONEY =
  /^[-(]?\$?\d{1,3}(,\d{3})*\.\d{2}\)?(cr|dr|-)?$|^[-(]?\$?\d+\.\d{2}\)?(cr|dr|-)?$/i;
const DATE = new RegExp(
  `^(\\d{4}-\\d{2}-\\d{2}|\\d{1,2}/\\d{1,2}/\\d{2,4}|(${MONTH})\\.? ?\\d{1,2}(, ?\\d{4})?|\\d{1,2} ?(${MONTH})\\.?( \\d{4})?)$`,
  "i",
);

// Words that label the columns of a statement. Whole runs only, compared case-insensitively.
const LABELS = new Set([
  "date",
  "description",
  "details",
  "transaction",
  "transactions",
  "debit",
  "debits",
  "credit",
  "credits",
  "withdrawal",
  "withdrawals",
  "deposit",
  "deposits",
  "amount",
  "balance",
  "opening balance",
  "closing balance",
  "previous balance",
  "new balance",
  "posting date",
  "transaction date",
  "page",
]);

export function maskRun(str: string): string {
  const t = str.trim();
  if (t === "") return str;
  if (MONEY.test(t) || DATE.test(t) || LABELS.has(t.toLowerCase())) return str;
  return str.replace(/\p{L}|\p{N}/gu, (c) => {
    if (/\p{N}/u.test(c)) return "9";
    return c === c.toLowerCase() ? "x" : "X";
  });
}

export function maskDocument(doc: RawDocument): RawDocument {
  const { producer, creator, title } = doc.meta;
  return {
    // Producer and creator name software, which profile detection needs; the title can hold a name.
    meta: {
      ...(producer === undefined ? {} : { producer }),
      ...(creator === undefined ? {} : { creator }),
      ...(title === undefined ? {} : { title: maskRun(title) }),
    },
    pages: doc.pages.map((p) => ({
      ...p,
      items: p.items.map((i) => ({ ...i, str: maskRun(i.str) })),
    })),
  };
}

/** How many non-blank deny-list entries appear in `text`, ignoring case. */
export function deniedCount(text: string, deny: readonly string[]): number {
  const hay = text.toLowerCase();
  return deny.filter(
    (d) => d.trim() !== "" && hay.includes(d.trim().toLowerCase()),
  ).length;
}
