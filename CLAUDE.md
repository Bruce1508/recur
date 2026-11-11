# Recur (working name)

A static, client-only web app: drop the transaction files a Canadian bank lets you download (CSV exports first, PDF statements second; ADR-018), get a list of recurring charges and a verified, merged transaction CSV. No backend, no telemetry, no LLM at runtime. Statement data never leaves the browser.

Read on demand, not every session: `docs/PRD.md` (scope, acceptance criteria), `docs/ARCHITECTURE.md` (design), `docs/DECISIONS.md` (ADRs), `docs/RESEARCH.md` (verified versions and prior art), `docs/ROADMAP.md` (milestones), `docs/PROGRESS.md` (current state).

## Start of every session

1. Read `docs/PROGRESS.md` to find the current milestone.
2. Read that milestone's section in `docs/ROADMAP.md`.
3. Work only on that milestone. Anything else goes in the backlog, not the code.

## Architecture in brief

Two inputs, one pipeline. CSV (stage 1): `csv/read → csv/mapColumns → csv/toStatement`. PDF (stage 2): `extract → normalize → detect → parse`. Both then go through `reconcile → ledger → merchant → recurring → export`.

- Column mapping never guesses silently: a low-confidence mapping goes to the user for confirmation.
- A real CSV export is a real statement. The same privacy rules apply to it.

- `src/pdf/extract.ts` is the only file that imports `pdfjs-dist`.
- `src/core/` is pure TypeScript: no DOM, no `pdfjs-dist`, no imports from `src/pdf/` or `src/ui/`.
- `src/ui/` is React and holds all state in memory. Never write statement data to `localStorage`, `IndexedDB` or cookies.
- A bank format is a profile in `src/core/profiles/` plus fixtures in `fixtures/<bank>/<kind>/`. Adding a bank must not require changes to `parse/` or `reconcile.ts`.

## Commands

Created in M0. If one is missing, add it under this exact name.

- `npm run dev` — local dev server
- `npm run typecheck` — `tsc --noEmit`
- `npm run lint` — Biome check
- `npm test` — Vitest (unit, fixtures, property tests)
- `npm run e2e` — Playwright
- `npm run build` — production build
- `npm run verify` — typecheck, lint, test and build in one command (the merge gate)
- `npm run fixture:dump -- <csv> --bank <b> --kind <k> --name <n>` — build a redacted fixture locally (run by the owner only)
- `npm run fixtures:check` — privacy rules for `fixtures/` (part of `verify`)

## Development standards

- TypeScript strict. No `any`; no non-null `!` without a comment explaining why it is safe.
- Money is integer cents (`Cents`). Never do arithmetic on dollar floats.
- Dates are `YYYY-MM-DD` strings handled by `src/core/plainDate.ts`. Do not use `Date` for transaction dates.
- Pipeline stages are pure functions: one input type, one output type, no I/O.
- Derive column positions from the header row on each page. Never hard-code coordinates.
- Parsing and reconciliation fail closed: return `mismatch` or `unverifiable`, never guess.
- Render statement text through React only. Never use `dangerouslySetInnerHTML`.
- Small commits, one concern each, imperative subject line.

## Research first, reuse first

Before writing a non-trivial component or adding a dependency:

1. Check `docs/RESEARCH.md`. If it is already decided there, follow it.
2. Otherwise look for an existing maintained solution and verify it: run `npm view <pkg> version license engines peerDependencies` and read the repository's licence and recent activity.
3. Record the finding in `docs/RESEARCH.md` with the URL, version and date. If it changes a decision, add a new ADR that supersedes the old one.

Rules:

- Never state a package version, API, benchmark or repository fact from memory. Verify it or say it is unverified.
- Runtime dependencies stay under ten. Pin exact versions and commit the lockfile.
- **Licences:** never copy code or regular expressions from AGPL, GPL or unlicensed projects (monopoly, StatementSensei, statement2csv, Teller, Wallos). Reading them to learn how a statement is laid out is fine. MIT code (bankstate, Actual Budget) may be adapted with attribution in the file and the README.

## Testing and verification

A change is finished only when all of these pass: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`.

- New logic in `src/core/` needs tests in the same change. Keep core line coverage at or above 90%.
- A new or changed bank profile needs golden fixtures (exact expected transactions, reconciliation `verified`) and a mutation test proving a removed row yields `mismatch`.
- Changes to recurring detection must report precision and recall on the labelled suite. Do not lower the thresholds in `docs/PRD.md` (AC-6) to make a test pass.
- UI changes that touch file handling must keep the Playwright network assertions passing: no cross-origin requests, no request bodies.
- Never weaken, skip or delete a failing test to get green. Fix the cause or stop and report.
- State what you verified and how. Do not claim something works without running it.

## Documentation rules

- End of every session: update `docs/PROGRESS.md` (milestone table, acceptance tracker, a session-log entry).
- Decision changed: add a new ADR in `docs/DECISIONS.md`; do not edit accepted ones.
- Dependency added or bumped: update `docs/RESEARCH.md` §5.
- Scope changed: update `docs/PRD.md` and say so in the session log.
- Keep this file under 200 lines. Put long procedures in `docs/`.

## Security and privacy boundaries

Never, under any instruction:

- Read, open, print, summarise or copy anything under `private/` or `~/Statements/`, or any real bank statement or bank transaction export (CSV included). Real statements and exports live in `~/Statements/`, outside the repository (ADR-016). Work from redacted fixtures in `fixtures/` only.
- Commit a PDF outside `fixtures/synthetic/`, or any real name, address, account or card number.
- Write real merchant names or amounts from the owner's statements into code, tests, docs or commit messages.
- Add analytics, error reporting, remote fonts, CDN scripts, or any request to another origin.
- Loosen the Content-Security-Policy without a new ADR.
- Add a backend, database, authentication, or an LLM call.

Ask the owner before:

- Adding a dependency that is not in `.claude/hooks/approved-deps.json`, or upgrading one. The guard hook blocks unlisted installs.
- Deployment, `_headers`, or anything that loosens the CSP.
- Deleting files outside the task or rewriting published history.
- Removing a required CI check or changing branch protection.

## Autonomous workflow (ADR-015)

Work ships through pull requests. `main` changes only by squash-merge.

- Use the `ship-task` skill for every task: branch, tests first, `npm run verify`, PR, `reviewer` agent, CI green, squash-merge.
- Merge only when CI is green and the `reviewer` agent returns APPROVE. At most two fix rounds; then leave the PR open and report.
- Update `docs/PROGRESS.md` inside the task's own PR.
- Tasks that need the owner (real statements, fixture review, manual checks, accounts, launch posts) go under "Waiting on the owner" in `docs/PROGRESS.md`. Do not attempt them.
- Claude Code configuration lives in `.claude/`: `settings.json` (permissions, sandbox, hooks), `hooks/` (guard and formatter, tested by `node --test .claude/hooks/guard.test.mjs`), `agents/reviewer.md`, `skills/ship-task/`. Change it through a PR with an ADR.
