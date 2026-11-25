import type { BankProfile } from "../profiles/types";
import type { Transaction } from "../types";
import { clean, normalise } from "./rules";
import type { Brand, Decoded, Reading } from "./types";

export interface DecodeContext {
  /** Exact-match brand table (generated list and alias table). */
  readonly brands: readonly Brand[];
  /** User labels by `merchantKey`. */
  readonly labels?: ReadonlyMap<string, string>;
  /** The bank profile's `bankCodes`; a code missing here is shown without a meaning. */
  readonly bankCodes?: BankProfile["bankCodes"];
}

const titleCase = (key: string): string =>
  key
    .toLowerCase()
    .replace(/(^|[ -])([a-z])/g, (_, sep, c) => sep + c.toUpperCase());

/** Census test (ADR-021): some word of four or more letters has a vowel. */
const looksLikeName = (key: string): boolean =>
  key.split(/[^A-Z]+/).some((w) => w.length >= 4 && /[AEIOUY]/.test(w));

/** Whole-word match: the key equals a match form or starts with it and a space. Longest form wins. */
function matchBrand(key: string, brands: readonly Brand[]): Brand | undefined {
  let best: { brand: Brand; form: string } | undefined;
  for (const brand of brands) {
    for (const raw of brand.match) {
      const form = normalise(raw);
      if (form === "" || !(key === form || key.startsWith(`${form} `)))
        continue;
      if (
        !best ||
        form.length > best.form.length ||
        (form.length === best.form.length && brand.name < best.brand.name)
      ) {
        best = { brand, form };
      }
    }
  }
  return best?.brand;
}

/**
 * Read one description. Precedence is fixed: user label, brand table, cleaned text that still looks
 * like a name, else unknown. Every reading names its single source (ADR-021).
 */
export function decodeDescription(
  description: string,
  ctx: DecodeContext,
): Decoded {
  const c = clean(description);
  const key = c.merchantKey;
  const label = ctx.labels?.get(key);
  const brand = label === undefined ? matchBrand(key, ctx.brands) : undefined;

  let reading: Reading = { kind: "unknown" };
  if (label !== undefined) {
    reading = { kind: "name", name: label, source: "user", confidence: "user" };
  } else if (brand) {
    reading = {
      kind: "name",
      name: brand.name,
      source: "brand",
      confidence: "high",
    };
  } else if (looksLikeName(key)) {
    reading = {
      kind: "name",
      name: titleCase(key),
      source: "rule",
      confidence: "medium",
    };
  }

  const meaning =
    c.bankCode === undefined ? undefined : ctx.bankCodes?.[c.bankCode]?.meaning;
  return {
    merchantKey: key,
    reading,
    ...(c.processor === undefined ? {} : { processor: c.processor }),
    ...(c.bankCode === undefined
      ? {}
      : {
          bankCode: {
            code: c.bankCode,
            ...(meaning === undefined ? {} : { meaning }),
          },
        }),
    removed: c.removed,
  };
}

/** Decode every transaction's printed description; the result is parallel to the input. */
export function decodeAll(
  transactions: readonly Transaction[],
  ctx: DecodeContext,
): Decoded[] {
  return transactions.map((t) => decodeDescription(t.description, ctx));
}
