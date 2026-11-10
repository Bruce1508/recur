// Run: node --test .claude/hooks/guard.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { check } from "./guard.mjs";

const run = (tool_name, tool_input, branch = "m0/02-scaffold") =>
  check({ tool_name, tool_input }, { projectDir: "/p", home: "/h", branch });
const bash = (command, branch) => run("Bash", { command }, branch);

test("private paths are blocked for file tools, Bash and MCP", () => {
  assert.ok(run("Read", { file_path: "/p/private/a.pdf" }));
  assert.ok(run("Read", { file_path: "private/a.pdf" }));
  assert.ok(run("Read", { file_path: "/h/Statements/a.pdf" }));
  assert.ok(run("Glob", { pattern: "private/**" }));
  assert.ok(bash("cat private/a.txt"));
  assert.ok(bash("git check-ignore private/x && cat private/x"));
  assert.ok(run("mcp__plugin_playwright_playwright__browser_navigate", { url: "file:///h/Statements/a.pdf" }));
});

test("look-alikes and rule text are allowed", () => {
  assert.equal(run("Read", { file_path: "/private/tmp/x.txt" }), null);
  assert.equal(run("Write", { file_path: "/p/.gitignore", content: "private/\n" }), null);
  assert.equal(bash("git check-ignore private/x.pdf"), null);
  assert.equal(run("Agent", { prompt: "never read under private/ ever" }), null);
  assert.equal(bash('git commit -m "keep private data out"'), null);
});

test("main is reachable only through PRs", () => {
  assert.ok(bash("git push origin main"));
  assert.ok(bash("git push origin HEAD:main"));
  assert.ok(bash("git push --force origin m0/x"));
  assert.ok(bash("git push", "main"));
  assert.ok(bash("gh pr merge 3 --squash --admin"));
  assert.ok(bash("gh api -X DELETE repos/a/b/branches/main/protection"));
  assert.ok(bash("gh repo edit --visibility private"));
  assert.equal(bash("git push -u origin m0/02-scaffold"), null);
  assert.equal(bash("git push"), null);
  assert.equal(bash("gh pr merge 3 --squash --delete-branch"), null);
});

test("only pre-approved dependencies install", () => {
  assert.ok(bash("npm install left-pad"));
  assert.ok(bash("cd /p && npm install evil@1.0.0"));
  assert.ok(bash("npx cowsay hi"));
  assert.ok(bash("npm init playwright@latest"));
  assert.equal(bash("npm install -D --save-exact vitest@5.1.0 @vitest/coverage-v8@5.1.0"), null);
  assert.equal(bash("npm create vite@8 recur -- --template react-ts"), null);
  assert.equal(bash("npx vitest run"), null);
  assert.equal(bash("npm ci && npm run verify"), null);
});
