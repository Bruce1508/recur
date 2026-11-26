// Local CLI: regenerate the bundled demo file from the seeded synthetic generator.
//
//   npm run demo:build

import { writeFileSync } from "node:fs";
import { demoCsv } from "./demoCsv";

writeFileSync("src/ui/demo/sample-chequing.csv", demoCsv());
console.log("demo: wrote src/ui/demo/sample-chequing.csv");
