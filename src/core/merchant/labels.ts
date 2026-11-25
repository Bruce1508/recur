import type { LabelFile } from "./types";

export const LABEL_LIMITS = {
  bytes: 256 * 1024,
  labels: 5000,
  key: 200,
  name: 100,
} as const;

export type ParsedLabels =
  | { readonly ok: true; readonly file: LabelFile }
  | { readonly ok: false; readonly error: string };

// C0/C1 controls, line separators, zero-width and bidi characters: none belongs in a key or name.
const forbidden = (text: string): boolean =>
  [...text].some((ch) => {
    const c = ch.codePointAt(0) ?? 0;
    return (
      c < 0x20 ||
      (c >= 0x7f && c <= 0x9f) ||
      (c >= 0x200b && c <= 0x200f) ||
      (c >= 0x2028 && c <= 0x202e) ||
      (c >= 0x2066 && c <= 0x2069) ||
      c === 0xfeff
    );
  });
const POLLUTING = new Set(["__proto__", "constructor", "prototype"]);

/** Labels hold keys and names only: no amounts, no dates (ADR-021). */
export function serialiseLabels(file: LabelFile): string {
  return JSON.stringify(
    { version: 1, labels: file.labels.map(({ key, name }) => ({ key, name })) },
    null,
    2,
  );
}

const fail = (error: string): ParsedLabels => ({ ok: false, error });

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const sameKeys = (o: Record<string, unknown>, keys: string[]): boolean => {
  const own = Object.keys(o);
  return own.length === keys.length && keys.every((k) => own.includes(k));
};

/**
 * Validate a whole label file. Fails closed: any malformed, oversized, duplicated or hostile part
 * returns an error and nothing is applied.
 */
export function parseLabels(text: string): ParsedLabels {
  if (text.length > LABEL_LIMITS.bytes)
    return fail("The label file is too large.");
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return fail("The label file is not valid JSON.");
  }
  if (!isObject(data) || !sameKeys(data, ["version", "labels"]))
    return fail("The label file has an unexpected shape.");
  if (data.version !== 1) return fail("Unsupported label file version.");
  const raw = data.labels;
  if (!Array.isArray(raw)) return fail("The label list is missing.");
  if (raw.length > LABEL_LIMITS.labels) return fail("Too many labels.");

  const labels: { key: string; name: string }[] = [];
  const seen = new Set<string>();
  for (const entry of raw as unknown[]) {
    if (!isObject(entry) || !sameKeys(entry, ["key", "name"]))
      return fail("A label has an unexpected shape.");
    const { key, name } = entry;
    if (typeof key !== "string" || typeof name !== "string")
      return fail("A label key or name is not text.");
    if (key === "" || key.length > LABEL_LIMITS.key || POLLUTING.has(key))
      return fail("A label key is not allowed.");
    if (name.trim() === "" || name.length > LABEL_LIMITS.name)
      return fail("A label name is empty or too long.");
    if (forbidden(key) || forbidden(name))
      return fail("A label contains control characters.");
    if (seen.has(key)) return fail("A label key appears twice.");
    seen.add(key);
    labels.push({ key, name });
  }
  return { ok: true, file: { version: 1, labels } };
}

/** The labels as a lookup for `decodeDescription`. */
export function labelMap(file: LabelFile): Map<string, string> {
  return new Map(file.labels.map((l) => [l.key, l.name]));
}
