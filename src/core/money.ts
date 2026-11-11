import type { Cents } from "./types";

// Optional sign, optional "$", optional sign again ("-$5" and "$-5" both occur),
// whole part with correct thousands grouping or none, up to two decimals.
const AMOUNT =
  /^([+-]?)\$?([+-]?)([1-9]\d{0,2}(?:,\d{3})+|\d+)?(?:\.(\d{1,2}))?$/;
const BRACKETED = /^\(\s*(.*?)\s*\)$/;

/**
 * Parse a money string to integer cents without going through a float.
 * Accepts "$1,234.56", "-12.34", "$-12.34", "(12.34)" (bracketed = negative).
 * Returns null for anything else; callers turn that into a warning, never a guess.
 */
export function parseMoney(text: string): Cents | null {
  let body = text.trim();
  const bracketed = BRACKETED.exec(body);
  if (bracketed) body = bracketed[1] ?? "";

  const m = AMOUNT.exec(body);
  if (!m) return null;
  const [, sign1 = "", sign2 = "", whole, frac] = m;
  if (whole === undefined && frac === undefined) return null;
  if (sign1 && sign2) return null;
  if (bracketed && (sign1 || sign2)) return null;

  const cents =
    Number((whole ?? "0").replaceAll(",", "")) * 100 +
    Number((frac ?? "").padEnd(2, "0"));
  if (!Number.isSafeInteger(cents)) return null;
  const negative = bracketed !== null || sign1 === "-" || sign2 === "-";
  return negative && cents !== 0 ? -cents : cents;
}

const CAD = new Intl.NumberFormat("en-CA", {
  style: "currency",
  currency: "CAD",
});

/** Display form, e.g. "-$1,234.56". For the UI only; exports write plain numbers. */
export function formatCents(cents: Cents): string {
  // cents / 100 rounds back to the right cent for any realistic amount (well below 2^53 / 100).
  return CAD.format(cents === 0 ? 0 : cents / 100); // avoids "-$0.00" for -0
}
