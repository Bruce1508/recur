#!/usr/bin/env node
// PostToolUse: format the edited file with the project's Biome. No-op until Biome is installed.
// Errors are ignored on purpose: `npm run lint` in the merge gate reports anything left unformatted.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const event = JSON.parse(readFileSync(0, "utf8"));
const file = String(event.tool_input?.file_path ?? "");
const biome = `${process.env.CLAUDE_PROJECT_DIR ?? event.cwd}/node_modules/.bin/biome`;
if (/\.(ts|tsx|js|mjs|json|css)$/.test(file) && !file.includes("/node_modules/") && existsSync(biome)) {
  try {
    execFileSync(biome, ["check", "--write", file], { stdio: "ignore" });
  } catch {}
}
