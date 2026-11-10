---
name: ship-task
description: Ship one Recur roadmap task end to end through a pull request - branch, tests first, verify, PR, independent review, CI, squash-merge. Use for every implementation task in the current milestone.
argument-hint: "<task id, e.g. M0b-2> <short description>"
---

# Ship one task

Follow these steps in order. Do not skip one because the change looks small.

1. **Scope.** Read `docs/PROGRESS.md` and the task's milestone in `docs/ROADMAP.md`. If the task needs the owner (real statements, fixture review, manual checks, accounts, launch posts, a dependency outside `.claude/hooks/approved-deps.json`), add it to "Waiting on the owner" in `docs/PROGRESS.md` and stop.
2. **Branch.** `git switch main && git pull --ff-only && git switch -c <milestone>/<nn>-<slug>` (for example `m1/03-normalize`).
3. **Research gate.** A new library API or dependency: check `docs/RESEARCH.md` first, then Context7 or `npm view <pkg> version license engines peerDependencies`. Record findings in `docs/RESEARCH.md`.
4. **Tests first** for anything in `src/core/`: write the failing test, run it, see it fail for the right reason, then implement.
5. **Verify.** `npm run verify` must pass. Before `verify` exists (early M0b), run the scripts that do exist and say which ones.
6. **Read your own diff.** `git diff main...HEAD`. Remove debug output and unrelated changes. Update `docs/PROGRESS.md` (task status, evidence, one session-log line) in this same branch.
7. **Commit and open the PR.** Small commits, one concern each, imperative subject. `git push -u origin HEAD`, then `gh pr create` using `.github/pull_request_template.md`: task id, acceptance criteria, and the exact verification commands with their result lines.
8. **Independent review.** Run the `reviewer` subagent with the PR number. Use model `opus` instead of the default when the PR touches `src/core/parse/`, `src/core/reconcile.ts`, CSP, file handling or `.claude/`. Also run `ecc:security-reviewer` when it touches CSP, `src/pdf/`, CSV export or file handling.
9. **Fix.** Address blocking findings with new commits, re-run `npm run verify`, push, and re-review. Stop after two rounds that still have blocking findings: leave the PR open, record why in `docs/PROGRESS.md`, and report.
10. **CI and merge.** `gh pr checks <n> --watch --fail-fast`. When CI is green and the verdict is APPROVE: `gh pr merge <n> --squash --delete-branch`. Never use `--admin`.
11. **Report** in two or three lines: PR link, what was verified, what is next.

Stop and report instead of continuing when the same task fails twice, a test can only pass by weakening it, or a decision in `docs/DECISIONS.md` would have to change without a new ADR.
