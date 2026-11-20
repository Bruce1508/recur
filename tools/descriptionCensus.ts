// Counts how the descriptions of a statement look, without ever printing one. The owner runs it on
// real statements (ADR-016); the numbers decide how a transaction decoder should be built (what
// share of descriptions is readable text, a payment-processor prefix, or an opaque code).
// The processor prefixes below are a hand-written, unverified starting list.

export type DescriptionClass = "processor-prefix" | "code-like" | "readable";

const PROCESSOR_PREFIX = /^(SQ\s?\*|TST\*|PAYPAL\s?\*|PP\*|GOOGLE\s?\*)/i;
// A word of four or more letters with a vowel looks like a name; a code usually has none.
const WORD = /[A-Z]{4,}/gi;
const VOWEL = /[AEIOUY]/i;
// A trailing one-letter bank code such as "_V", as in the first layout dump.
const BANK_CODE_SUFFIX = /\s_[A-Z]$/i;
const LONG_DIGITS = /\d{6,}/;

export function classify(description: string): DescriptionClass {
  const d = description.trim();
  if (PROCESSOR_PREFIX.test(d)) return "processor-prefix";
  const words = d.match(WORD) ?? [];
  return words.some((w) => VOWEL.test(w)) ? "readable" : "code-like";
}

export interface Census {
  transactions: number;
  distinct: number;
  /** Per class: transactions, distinct descriptions, and transactions whose description appears 3+ times. */
  byClass: Record<
    DescriptionClass,
    { transactions: number; distinct: number; repeated: number }
  >;
  withBankCodeSuffix: number;
  withLongDigitRun: number;
}

export function census(descriptions: readonly string[]): Census {
  const counts = new Map<string, number>();
  for (const d of descriptions) {
    const key = d.trim().replace(/\s+/g, " ").toUpperCase();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const empty = () => ({ transactions: 0, distinct: 0, repeated: 0 });
  const out: Census = {
    transactions: descriptions.length,
    distinct: counts.size,
    byClass: {
      "processor-prefix": empty(),
      "code-like": empty(),
      readable: empty(),
    },
    withBankCodeSuffix: 0,
    withLongDigitRun: 0,
  };
  for (const [key, n] of counts) {
    const c = out.byClass[classify(key)];
    c.transactions += n;
    c.distinct += 1;
    if (n >= 3) c.repeated += n;
    if (BANK_CODE_SUFFIX.test(key)) out.withBankCodeSuffix += n;
    if (LONG_DIGITS.test(key)) out.withLongDigitRun += n;
  }
  return out;
}

const pct = (n: number, of: number) =>
  of === 0 ? "0%" : `${Math.round((100 * n) / of)}%`;

/** Counts and percentages only. */
export function formatCensus(c: Census): string[] {
  const lines = [
    `${c.transactions} transactions, ${c.distinct} distinct descriptions`,
  ];
  for (const [name, v] of Object.entries(c.byClass)) {
    lines.push(
      `${name}: ${v.transactions} (${pct(v.transactions, c.transactions)}), ${v.distinct} distinct, ${v.repeated} in descriptions seen 3+ times`,
    );
  }
  lines.push(
    `with a one-letter bank code suffix: ${c.withBankCodeSuffix}`,
    `with a digit run of 6 or more: ${c.withLongDigitRun}`,
  );
  return lines;
}
