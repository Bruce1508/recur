import { detect } from "../core/detect";
import { normalize } from "../core/normalize/normalize";
import { type ParseResult, parse } from "../core/parse/parse";

/**
 * PDF bytes -> a parsed statement, or a reason. pdf.js is loaded on the first PDF only, so a CSV
 * user never downloads it.
 */
export async function readPdf(bytes: Uint8Array): Promise<ParseResult> {
  const { extractPdf } = await import("../pdf/extract");
  const extracted = await extractPdf(bytes);
  if (!extracted.ok) return extracted;
  const doc = normalize(extracted.doc);
  const profile = detect(doc);
  if (!profile)
    return {
      ok: false,
      reason: "unsupported format: this kind of statement cannot be read yet",
    };
  return parse(doc, profile);
}
