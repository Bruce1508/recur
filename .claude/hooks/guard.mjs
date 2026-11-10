#!/usr/bin/env node
// PreToolUse guard (ADR-015). Runs for every tool call, including subagents and MCP tools,
// which permission deny rules and the sandbox do not cover. Exit 2 blocks the call.
// ponytail: text heuristic; misses obfuscated commands (variables, eval, base64). The OS sandbox
// is the real wall for Bash; upgrade path is `sandbox.allowUnsandboxedCommands: false`.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

const approved = JSON.parse(readFileSync(new URL("./approved-deps.json", import.meta.url), "utf8"));
const PATH_FIELDS = {
  Read: ["file_path"], Write: ["file_path"], Edit: ["file_path"], NotebookEdit: ["notebook_path"],
  Glob: ["path", "pattern"], Grep: ["path", "glob"],
};
const PRIVATE = "real statements and private/ are off limits (CLAUDE.md, ADR-016)";

function touchesPrivate(text, projectDir, home) {
  const t = text.replaceAll("\\", "/");
  if ([`${projectDir}/private/`, `${home}/Statements`, "~/Statements", "$HOME/Statements"].some((p) => t.includes(p))) return true;
  // project-relative private/...; system paths such as /private/tmp stay allowed
  return /(^|[\s"'=:(,;|&<>])(\.\/)?private\//.test(t);
}

function pkgName(spec) {
  const at = spec.lastIndexOf("@");
  return at > 0 ? spec.slice(0, at) : spec;
}

function checkSegment(s, branchOf) {
  if (/^git\s+push\b/.test(s)) {
    if (/\s(--force(-with-lease)?|-f|--mirror|--delete|-d)(\s|=|$)/.test(s)) return "force, mirror or delete pushes are not allowed";
    const refs = s.split(/\s+/).slice(2).filter((a) => !a.startsWith("-")).slice(1);
    if (refs.some((r) => /(^|:)(refs\/heads\/)?(main|master)$/.test(r))) return "never push to main; open a PR";
    if ((refs.length === 0 || refs.includes("HEAD")) && ["main", "master"].includes(branchOf())) return "on main: push a feature branch and open a PR";
  }
  if (/^gh\s+pr\s+merge\b/.test(s) && /\s--admin\b/.test(s)) return "--admin bypasses branch protection";
  if (/^gh\s+api\b/.test(s) && /protection|rulesets/.test(s)) return "branch protection is changed only by the owner";
  if (/^gh\s+repo\s+(delete|edit|rename)\b/.test(s)) return "repository settings are changed only by the owner";

  const notApproved = (names) => names.filter((n) => !approved.packages.includes(n) && !approved.bins.includes(n));
  let m = s.match(/^(?:npm|pnpm|yarn)\s+(?:install|i|add)\s+(.*)$/);
  if (m) {
    const bad = notApproved(m[1].split(/\s+/).filter((a) => a && !a.startsWith("-")).map(pkgName));
    if (bad.length) return `dependency not pre-approved: ${bad.join(", ")}; ask the owner`;
  }
  m = s.match(/^(?:npm|pnpm|yarn)\s+(?:create|init)\s+([^\s-]\S*)/);
  if (m) {
    const n = pkgName(m[1]);
    const bad = notApproved([n.startsWith("@") ? n : `create-${n}`]);
    if (bad.length) return `initializer not pre-approved: ${bad[0]}; ask the owner`;
  }
  m = s.match(/^(?:npx|pnpm\s+dlx|npm\s+exec)\s+(.*)$/);
  if (m) {
    const first = m[1].split(/\s+/).find((a) => a && !a.startsWith("-"));
    if (first && notApproved([pkgName(first)]).length) return `npx package not pre-approved: ${first}; ask the owner`;
  }
  return null;
}

function currentBranch(dir) {
  try {
    return execFileSync("git", ["-C", dir, "rev-parse", "--abbrev-ref", "HEAD"], { encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

export function check(event, opts = {}) {
  const projectDir = opts.projectDir ?? process.env.CLAUDE_PROJECT_DIR ?? event.cwd ?? process.cwd();
  const home = opts.home ?? homedir();
  const branchOf = () => opts.branch ?? currentBranch(projectDir);
  const tool = event.tool_name ?? "";
  const input = event.tool_input ?? {};

  if (tool === "Bash") {
    const cmd = String(input.command ?? "");
    if (!/^\s*git\s+check-ignore\b[^;&|]*$/.test(cmd) && touchesPrivate(cmd, projectDir, home)) return PRIVATE;
    for (const seg of cmd.split(/&&|\|\||;|\|/)) {
      const reason = checkSegment(seg.trim(), branchOf);
      if (reason) return reason;
    }
    return null;
  }
  const fields = PATH_FIELDS[tool];
  const text = fields
    ? fields.map((f) => String(input[f] ?? "")).join("\n")
    : tool.startsWith("mcp__") || tool === "WebFetch" ? JSON.stringify(input) : "";
  return touchesPrivate(text, projectDir, home) ? PRIVATE : null;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let reason;
  try {
    reason = check(JSON.parse(readFileSync(0, "utf8")));
  } catch (err) {
    reason = `guard failed closed: ${err.message}`;
  }
  if (reason) {
    process.stderr.write(`guard: ${reason}\n`);
    process.exit(2);
  }
}
