import { detect } from "../core/detect";
import { normalize } from "../core/normalize/normalize";
import { type ParseResult, parse } from "../core/parse/parse";
import { retryable } from "./retryable";

// Fetched when the app loads, not on the first PDF, so a PDF still opens after the network drops
// (AC-5). The dynamic import keeps pdf.js out of the first paint. A rejected import is not kept:
// the next file imports again.
const loadPdfModule = retryable(() => import("../pdf/extract"));
loadPdfModule().catch(() => {});

/** PDF bytes -> a parsed statement, or a reason. */
export async function readPdf(bytes: Uint8Array): Promise<ParseResult> {
  const { extractPdf } = await loadPdfModule();
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
