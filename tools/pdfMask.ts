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
  // Whitespace and a few ASCII punctuation marks stay; every other character, including symbols,
  // combining marks and private-use characters, becomes "_".
  return Array.from(str, (c) => {
    if (/\s/u.test(c) || PUNCTUATION.has(c)) return c;
    if (/\p{N}/u.test(c)) return "9";
    if (/\p{L}/u.test(c)) return c === c.toLowerCase() ? "x" : "X";
    return "_";
  }).join("");
}

const PUNCTUATION = new Set([..."., -/$()%:#&"]);

/**
 * True when some run holds a control, private-use or replacement character other than tab and
 * line breaks. That is what pdf.js returns for a font with no Unicode map: the text is then glyph
 * codes, and masking by shape would leave a readable substitution of the real text. Callers must
 * refuse such a document rather than write it.
 */
export function hasUnmappedText(doc: RawDocument): boolean {
  return doc.pages.some((p) =>
    p.items.some((i) =>
      /[\p{Cc}\p{Co}�]/u.test(i.str.replace(/[\t\r\n]/g, "")),
    ),
  );
}

// Software names are kept only when they look like one: some generators put a user name or a
// file path in these fields.
const SOFTWARE = /^[\w .\-+()®©]{1,64}$/;
const software = (v: string | undefined) =>
  v !== undefined && SOFTWARE.test(v) ? v : undefined;

export function maskDocument(doc: RawDocument): RawDocument {
  const { title } = doc.meta;
  const producer = software(doc.meta.producer);
  const creator = software(doc.meta.creator);
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
