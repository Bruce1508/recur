// Local CLI: a real bank PDF -> a masked layout dump. Run by the owner only; Claude never reads
// the PDF (ADR-016, ADR-019). Prints counts and paths, never file content.
//
//   npm run pdf:dump -- /abs/path/statement.pdf [--out /abs/path/layout.json] [--deny-list /abs/path/deny.txt]
//
// The dump holds, for every text run: its position, size and font, and its text masked by shape
// (see pdfMask.ts). Amounts, dates and column labels are kept, because the parser needs them.
// Read the output file yourself before sharing any of it. The default output is next to the input.

import { existsSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join } from "node:path";
import { extractPdf } from "../src/pdf/extract";
import { isInside } from "./paths";
import { deniedCount, maskDocument } from "./pdfMask";

function fail(message: string): never {
  console.error(`pdf:dump: ${message}`);
  process.exit(1);
}

const argv = process.argv.slice(2);
const flags = new Map<string, string>();
const positional: string[] = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i] as string;
  if (a.startsWith("--"))
    flags.set(a.slice(2), argv[++i] ?? fail(`${a} needs a value`));
  else positional.push(a);
}

const input = positional[0];
if (positional.length !== 1 || !input || !isAbsolute(input))
  fail("give exactly one absolute path to the PDF");
if (!existsSync(input)) fail("the input file does not exist");

// The PDF, the dump and the deny-list stay outside the repository (ADR-016): the dump is meant
// to be read by its owner before it goes anywhere, and the deny-list holds real names.
const repo = realpathSync(process.cwd());
function outside(what: string, path: string): string {
  if (!isAbsolute(path)) fail(`${what} must be an absolute path`);
  const dir = realpathSync(existsSync(path) ? path : dirname(path));
  if (isInside(repo, dir))
    fail(`${what} is inside this repository; keep it outside`);
  return path;
}
outside("the input", input);
const outPath = outside(
  "--out",
  flags.get("out") ??
    join(dirname(input), `${basename(input, ".pdf")}.layout.json`),
);
if (existsSync(outPath))
  fail(`${outPath} already exists; choose another --out`);
const denyFlag = flags.get("deny-list");
const deny =
  denyFlag === undefined
    ? []
    : readFileSync(outside("--deny-list", denyFlag), "utf8").split("\n");

const extracted = await extractPdf(new Uint8Array(readFileSync(input)));
if (!extracted.ok) fail(extracted.reason);

const masked = maskDocument(extracted.doc);
const json = `${JSON.stringify(masked, null, 1)}\n`;

const hits = deniedCount(json, deny);
if (hits > 0)
  fail(
    `${hits} deny-list entr${hits === 1 ? "y" : "ies"} survived masking; nothing was written`,
  );

const runs = masked.pages.map(
  (p) => p.items.filter((i) => i.str.trim() !== "").length,
);
const total = runs.reduce((a, b) => a + b, 0);
if (total === 0)
  fail(
    "this PDF has no text layer (a scan or an image?); nothing was written. Tell Claude: ADR-019 says to revisit the plan",
  );

writeFileSync(outPath, json, { mode: 0o600 });
console.log(
  `wrote ${outPath}: ${masked.pages.length} page(s), ${total} text runs (per page: ${runs.join(", ")})`,
);
console.log("Read the file yourself before sharing any of it.");
