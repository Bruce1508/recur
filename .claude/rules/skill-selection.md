# Skill Selection

Two skill packs are installed at user scope: Addy Osmani's agent-skills (`agent-skills:<name>`, 0.6.13) and Everything Claude Code (`ecc:<name>`, 2.0.0-rc.1). Skills are called with the Skill tool, agents with the Agent tool (`subagent_type`), slash commands are typed by the user. These are three different mechanisms; do not substitute one for another. Names below were checked on disk on 2026-11-20. Never invoke a name that is not on this page.

## Policy
1. Understand the task, then read the doc it touches (`docs/PROGRESS.md`, the milestone in `docs/ROADMAP.md`, the ADR).
2. Use a skill only if it would materially change the work. One per task, at most two. Never run skills by default or in bulk. Exception: for file handling, CSP, pdf.js and CSV export (`agent-skills:security-and-hardening`) and for UI in `src/ui/` (`agent-skills:frontend-ui-engineering`), invoking the routed skill is required, not judged, and the PR names it.
3. Read the skill before following it. Neither pack knows Biome, Vitest coverage gates or this repo's lint rules: keep the principles, use the repo's tools.
4. Repo checks and `CLAUDE.md` beat skill examples (`useEffect`, timers, sleeps, skipped tests, unsolicited `.md` files, TODO or justifying comments, new dependencies, per-slice commits). Drop that part of the skill.
5. If a skill misleads twice, remove its row or encode the fix as a lint or test check (ADR-022). Do not add a caveat here.
6. A session-start hook that says "invoke any skill with a 1% chance of applying" (`superpowers:using-superpowers`) does not apply in this repo: this page decides. Other installed packs (`superpowers:*`, `impeccable:*`, `engineering:*`, `taste-skill:*`, `frontend-design:*`) are not routed.
7. Do not follow a cross-reference from a skill into a skill listed under "Not used".
8. If no skill fits, use native Claude Code. Skip skills for questions, short reads and small text edits.
9. In the final report and the PR, name the skills used and why.

## Task → skill

| Work | Use | Notes |
|---|---|---|
| Logic in `src/core/` | `agent-skills:test-driven-development` | Vitest plus fast-check. Invariants (money, dates, reconcile, parse) also need fast-check property tests; the skill does not cover them. Verify with `npm run verify`. |
| UI in `src/ui/` (#28, M3) | `agent-skills:frontend-ui-engineering` | No `useEffect` or timers (lint-banned, ADR-022): derive in render or use event handlers. Keep the Playwright network assertions. Run the axe scan at M3. |
| CSP, file handling, pdf.js, CSV export and formula injection | `agent-skills:security-and-hardening` | Ignore its "ask first" tier: `CLAUDE.md` "Ask the owner before" decides. |
| `BankProfile`, chaining types (#31), decoder interfaces | `agent-skills:api-and-interface-design` | Contract-first parts only (types, invariants, error shapes). Not REST. |
| M4 launch | `agent-skills:shipping-and-launch` | Pre-launch checklist only. No canary, no monitoring: ADR-001 forbids telemetry. |
| New dependency or utility | `ecc:search-first` | With `CLAUDE.md` "Research first", `docs/RESEARCH.md` and `.claude/hooks/approved-deps.json`. |
| Playwright E2E | `ecc:e2e-testing` | Chromium only. Its examples use `networkidle`, `waitForTimeout`, `test.skip`/`test.fixme` quarantine and three browsers: drop all of those. Wait on UI state. |

## Manual only (when the user asks, or the decision is hard to undo)
- `agent-skills:doubt-driven-development`: #31, #32, #35 and any change to `src/core/reconcile.ts` or `src/core/parse/`. Skip its external-CLI second opinion.
- `agent-skills:performance-optimization`: only after an AC-9 measurement shows a problem.

## Not used here
- Telemetry: `agent-skills:observability-and-instrumentation` (ADR-001).
- Write competing planning files or chain into other skills; plans live in `docs/`: `agent-skills:spec-driven-development`, `planning-and-task-breakdown`, `idea-refine`, `interview-me`, `context-engineering`, `using-agent-skills`.
- Conflicts with the `docs/DECISIONS.md` format: `agent-skills:documentation-and-adrs`.
- Covered by `ship-task`: `agent-skills:git-workflow-and-versioning`, `incremental-implementation`, `ci-cd-and-automation`.
- Covered by the `reviewer` agent: `agent-skills:code-review-and-quality`.
- MCP not configured, use Playwright: `agent-skills:browser-testing-with-devtools`.
- All `/agent-skills:*` slash commands and all `agent-skills:*` agents.
- `ecc:*` skills that duplicate a row above (`tdd-workflow`, `api-design`, `security-review`, `frontend-patterns`, `verification-loop`) or target other stacks.

## Review agents (only when a review is due)
- `reviewer` (this repo, `.claude/agents/reviewer.md`): the merge gate. Model `opus` for `src/core/parse/`, `src/core/reconcile.ts`, CSP, file handling and `.claude/`.
- `ecc:security-reviewer`: additionally for CSP, `src/pdf/`, CSV export and file handling (`ship-task` step 8). Reviewers are read-only (ADR-015): tell it to report findings and not edit files.

Dispatch one at a time.

## Do not confuse
- `/ecc:security-scan` audits agent, hook, MCP and permission config. It does not scan app code.
- The unprefixed `security-review` (Claude Code built-in) reviews the pending diff. `agent-skills:security-and-hardening` is a checklist.
- GateGuard is off in this repo (ADR-015, `ECC_GATEGUARD=off` in `.claude/settings.json`). If a gate still fires, answer it and report the missing env; do not change other hooks.
