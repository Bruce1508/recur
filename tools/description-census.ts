// Local CLI: how do the descriptions on real statements look? Run by the owner only; Claude never
// reads the PDFs (ADR-016). Prints counts and percentages, never a description.
//
//   npm run census -- /abs/path/a.pdf [/abs/path/b.pdf ...]
//
// Each PDF goes through extract, normalize, detect and parse; a PDF that cannot be read is
// reported by reason class only and left out of the counts.

import { realpathSync } from "node:fs";
import { isAbsolute } from "node:path";
import { detect } from "../src/core/detect";
import { normalize } from "../src/core/normalize/normalize";
import { parse } from "../src/core/parse/parse";
import { reconcile } from "../src/core/reconcile";
import { extractPdf } from "../src/pdf/extract";
import { census, formatCensus } from "./descriptionCensus";
import { readInput } from "./paths";

function fail(message: string): never {
  console.error(`census: ${message}`);
  process.exit(1);
}

const inputs = process.argv.slice(2);
if (inputs.length === 0 || inputs.some((p) => p.startsWith("--")))
  fail("give one or more absolute paths to PDF files (no options)");
const repo = realpathSync(process.cwd());
for (const p of inputs) if (!isAbsolute(p)) fail("every path must be absolute");

const descriptions: string[] = [];
const statuses: Record<string, number> = {};
const note = (k: string) => {
  statuses[k] = (statuses[k] ?? 0) + 1;
};
for (const p of inputs) {
  const file = readInput(repo, p);
  if (!file.ok) fail(file.reason);
  const r = await extractPdf(file.bytes);
  if (!r.ok) {
    note("could not be read as a PDF");
    continue;
  }
  const doc = normalize(r.doc);
  const profile = detect(doc);
  if (!profile) {
    note("format not recognised");
    continue;
  }
  const parsed = parse(doc, profile);
  if (!parsed.ok) {
    note("recognised but not parsed");
    continue;
  }
  note(`parsed, ${reconcile(parsed.statement).status}`);
  for (const t of parsed.statement.transactions)
    descriptions.push(t.description);
}

console.log(`${inputs.length} file(s):`);
for (const [k, n] of Object.entries(statuses)) console.log(`  ${n} ${k}`);
console.log("");
for (const line of formatCensus(census(descriptions))) console.log(line);
