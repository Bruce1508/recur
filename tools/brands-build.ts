// Local CLI: regenerate src/core/merchant/brands.ts from a downloaded name-suggestion-index file.
//
//   npm run brands:build -- /abs/path/nsi.min.json
//
// The file is dist/json/nsi.min.json of the npm package name-suggestion-index (BSD-3-Clause, see
// docs/RESEARCH.md section 13); download it from the package CDN at a pinned version.

import { readFileSync, writeFileSync } from "node:fs";
import { isAbsolute } from "node:path";
import { buildBrands, type Nsi, renderBrands } from "./brandTable";

const input = process.argv[2];
if (!input || !isAbsolute(input)) {
  console.error("brands: pass the absolute path of nsi.min.json");
  process.exit(1);
}
const { nsi } = JSON.parse(readFileSync(input, "utf8")) as { nsi: Nsi };
const brands = buildBrands(nsi);
writeFileSync("src/core/merchant/brands.ts", renderBrands(brands));
console.log(`brands: wrote ${brands.length} brands`);
