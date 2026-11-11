// CI and local gate: no PDF outside fixtures/synthetic/, no run of nine or more digits in any
// fixture, and optionally no term from the owner's personal deny-list (ADR-005, ADR-016).
//
//   npm run fixtures:check [-- --deny-list /abs/path/deny.txt]
//
// Prints file, line and rule only, never the matched text.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { checkFiles, type FixtureFile } from "./fixtureRules";

const ROOT = "fixtures";

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
  );
}

const argv = process.argv.slice(2);
const at = argv.indexOf("--deny-list");
const denyPath = at >= 0 ? argv[at + 1] : undefined;
if (at >= 0 && !denyPath) {
  console.error("fixtures:check: --deny-list needs a path");
  process.exit(1);
}
const denyList = denyPath ? readFileSync(denyPath, "utf8").split("\n") : [];

const paths = existsSync(ROOT) ? walk(ROOT) : [];
const files: FixtureFile[] = paths.map((p) => {
  const path = p.split("\\").join("/");
  // A PDF is judged by its path alone; its bytes are never read.
  return {
    path,
    text: path.toLowerCase().endsWith(".pdf") ? "" : readFileSync(p, "utf8"),
  };
});

const violations = checkFiles(files, denyList);
for (const v of violations)
  console.error(`${v.path}${v.line ? `:${v.line}` : ""} ${v.rule}`);
if (violations.length > 0) {
  console.error(`fixtures:check: ${violations.length} violation(s)`);
  process.exit(1);
}
console.log(
  `fixtures:check: ${files.length} file(s) ok${denyPath ? " (deny-list applied)" : ""}`,
);
