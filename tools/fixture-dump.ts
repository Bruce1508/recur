// Local CLI: a real bank CSV -> a redacted fixture. Run by the owner only; Claude never reads the
// input (ADR-016). Prints counts and paths, never file content.
//
//   npm run fixture:dump -- /abs/path/to/export.csv --bank td --kind chequing --name 2025-01 \
//     [--description 2] [--map /abs/path/merchant-map.json] [--deny-list /abs/path/deny.txt]
//
// --description (1-based) is needed when the file has an extra text column, such as a card number:
// look at the file, then say which column holds the merchant text. The merchant map defaults to a
// file next to the input, outside the repository, so placeholders stay the same across files.

import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { checkFiles } from "./fixtureRules";
import { isInside } from "./paths";
import { redactCsv } from "./redact";

function fail(message: string): never {
  console.error(`fixture:dump: ${message}`);
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
  fail("give exactly one absolute path to the CSV");
const slug = /^[a-z0-9][a-z0-9-]*$/;
const part = (name: string) => {
  const v = flags.get(name);
  if (!v || !slug.test(v))
    fail(`--${name} is required: lower-case letters, digits and "-"`);
  return v;
};
const [bank, kind, name] = [part("bank"), part("kind"), part("name")];

// Real exports, the merchant map and the deny-list stay outside the repository (ADR-016): the map
// holds real merchant names and the deny-list holds real names and numbers.
const repo = realpathSync(process.cwd());
function outside(what: string, path: string): string {
  if (!isAbsolute(path)) fail(`${what} must be an absolute path`);
  const dir = realpathSync(existsSync(path) ? path : dirname(path));
  if (isInside(repo, dir))
    fail(`${what} is inside this repository; keep it outside`);
  return path;
}
outside("the input", input);

const denyFlag = flags.get("deny-list");
const deny =
  denyFlag === undefined ? undefined : outside("--deny-list", denyFlag);

const descFlag = flags.get("description");
const descriptionColumn =
  descFlag === undefined ? undefined : Number(descFlag) - 1;
if (descriptionColumn !== undefined && !Number.isInteger(descriptionColumn))
  fail("--description is a column number, counting from 1");

const mapPath = outside(
  "--map",
  flags.get("map") ?? join(dirname(input), "merchant-map.json"),
);
const loaded: unknown = existsSync(mapPath)
  ? JSON.parse(readFileSync(mapPath, "utf8"))
  : {};
if (typeof loaded !== "object" || loaded === null || Array.isArray(loaded))
  fail("the merchant map is not a JSON object");
const previous = loaded as Record<string, string>;

const result = redactCsv(readFileSync(input, "utf8"), previous, {
  descriptionColumn,
});
if (!result.ok) fail(result.reason);

const outPath = join(resolve("fixtures"), bank, kind, `${name}.csv`);
if (existsSync(outPath))
  fail(`${outPath} already exists; choose another --name`);
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, `${result.csv}\n`);

// The same rules CI applies, so a bad fixture never reaches a commit.
const violations = checkFiles(
  [
    {
      path: relative(process.cwd(), outPath).split("\\").join("/"),
      text: `${result.csv}\n`,
    },
  ],
  deny ? readFileSync(deny, "utf8").split("\n") : [],
);
if (violations.length > 0) {
  unlinkSync(outPath);
  fail(
    `the redacted file broke a privacy rule (${violations
      .map((v) => `${v.rule} line ${v.line ?? "-"}`)
      .join(", ")}); nothing was written`,
  );
}

writeFileSync(mapPath, `${JSON.stringify(result.map, null, 2)}\n`, {
  mode: 0o600,
});
const { rows, merchants, blankedColumns } = result.report;
console.log(
  `wrote ${outPath}: ${rows} rows, ${merchants} merchants so far, ${blankedColumns} column(s) blanked`,
);
console.log(`merchant map kept at ${mapPath} (outside the repository)`);
console.log("Read the fixture yourself before committing it.");
