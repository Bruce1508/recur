export interface Cleaned {
  readonly merchantKey: string;
  readonly processor?: string;
  readonly bankCode?: string;
  readonly removed: readonly string[];
}

// Hand-written, small on purpose (ADR-021): extend only from a descriptor that is shown to need it.
const PROCESSOR_PREFIX = /^(SQ|TST|PAYPAL|PP)\s*\*\s*|^(SP)\s+/;
const CITIES = new Set([
  "TORONTO",
  "SCARBOROUGH",
  "MISSISSAUGA",
  "BRAMPTON",
  "MARKHAM",
  "OTTAWA",
  "MONTREAL",
  "VANCOUVER",
  "CALGARY",
  "EDMONTON",
  "WINNIPEG",
  "HALIFAX",
]);
const PROVINCES = new Set([
  "ON",
  "QC",
  "BC",
  "AB",
  "MB",
  "SK",
  "NS",
  "NB",
  "NL",
  "PE",
]);

const tidy = (s: string): string => s.replace(/\s+/g, " ").trim();

/** Upper-case, drop apostrophes, turn a dot that is not inside a number into a space. */
export function normalise(description: string): string {
  return tidy(
    description
      .toUpperCase()
      .replaceAll("'", "")
      .replace(/(?<!\d)\.|\.(?!\d)/g, " "),
  );
}

/** The cleaning rules of ADR-021, in its fixed order. Pure and deterministic. */
export function clean(description: string): Cleaned {
  let text = normalise(description);
  const removed: string[] = [];
  const cut = (rule: string, re: RegExp): void => {
    const found: string[] = [];
    text = tidy(
      text.replace(re, (m) => {
        found.push(m.trim());
        return " ";
      }),
    );
    for (const f of found) removed.push(`${rule}: ${f}`);
  };

  let bankCode: string | undefined;
  const tail = /_([A-Z])$/.exec(text);
  if (tail) {
    bankCode = tail[1];
    text = tidy(text.slice(0, tail.index));
    removed.push(`bank code: ${tail[0]}`);
  }

  let processor: string | undefined;
  const prefix = PROCESSOR_PREFIX.exec(text);
  if (prefix) {
    processor = prefix[1] ?? prefix[2];
    text = tidy(text.slice(prefix[0].length));
    removed.push(`processor: ${prefix[0].trim()}`);
  }

  cut("leading asterisk", /^\*+/);
  cut("amount", /\*?\s*\$?\b\d+\.\d{2}\b/g);
  text = tidy(text.replaceAll("*", " "));
  cut("store number", /#\s*\d+|\bSTORE\s*\d+\b/g);
  cut(
    "reference",
    /\b\d{5,}\b|\b(?=[A-Z0-9]*[A-Z])(?=(?:[A-Z]*\d){2})[A-Z0-9]{4,}\b/g,
  );

  for (const set of [PROVINCES, CITIES]) {
    const words = text.split(" ");
    const last = words[words.length - 1] ?? "";
    if (words.length > 1 && set.has(last)) {
      removed.push(`place: ${last}`);
      text = words.slice(0, -1).join(" ");
    }
  }

  const merchantKey = text.replace(/^[^A-Z0-9]+|[^A-Z0-9]+$/g, "");
  return { merchantKey, processor, bankCode, removed };
}
