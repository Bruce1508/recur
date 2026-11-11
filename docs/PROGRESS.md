# Progress

Living document. Update it at the end of every working session. Never record statement contents, merchant names from real statements, or account details here; counts and pass/fail only.

**Last updated:** 2026-11-11 (end of session)

## Current status

**Phase:** M1 in progress (stage 1, CSV first, ADR-018). The whole CSV pipeline up to the ledger is on `main`, tested end to end on synthetic data (269 tests, `npm run verify` green, CI green): `src/core/money.ts`, `plainDate.ts`, `csv/read.ts`, `csv/mapColumns.ts`, `csv/toStatement.ts`, `reconcile.ts`, `ledger.ts`, `tools/make-synthetic.ts`, and the import-boundary lint rule (PRs #5 to #12, tasks 1 to 7 and 10).

**Left in M1:** task 11 (walking-skeleton UI) can start now. Tasks 8 and 9 (fixture dump tool, fixture privacy check) can be built and tested on the synthetic files, but the owner must then run `fixture:dump` on his real exports and review the output, and the real-export acceptance criteria (AC-3) wait for that (see "Waiting on the owner"). M1 is done when two real export layouts import correctly.

**CI note:** the earlier `verify` failures were not code. `npx playwright install --with-deps chromium` failed because the runner could not resolve `*.ubuntu.com` (apt, `Temporary failure resolving`). A rerun passed. If it recurs, cache the Playwright browsers or retry that step, in its own branch.

**Next session, in order:**

1. Run `git log origin/main` and `gh pr list` to confirm what is merged, then start M1 task 11 through `ship-task`. Never `--admin`; never force-push (merge `main` into the branch instead of rebasing).
2. Task 11 (`src/ui/`): drop a CSV, confirm the column mapping when asked, see a plain table and the verification status. No styling effort. It must satisfy the "Requirements carried into task 11" list below. Check `docs/ARCHITECTURE.md` section 9 for the page states first.
3. Tasks 8 and 9 (tools only; Claude never reads a real export). Build them against synthetic files; the owner's run on real exports is queued below. Do these after task 11 or before it, whichever lets the owner start downloading exports sooner.
4. After M1: M2 (recurring-charge detection) needs the owner's hand-written subscription list first (see "Waiting on the owner").

**Requirements carried into task 11 and later** (found in reviews; each is pinned or noted in code):

- Group files by account and call `buildLedger` once per account. Two accounts of the same kind and bank with no balance column merge on an identical same-day charge (silent loss otherwise). The same account exported with and without a balance column, and (stage 2) as CSV and as PDF, is not de-duplicated.
- A lone signed amount column has no sign convention in `ColumnMapping`: the UI must show a sample and let the user set `negateSigned` before `toStatement`. A `low` mapping must never be converted without the user confirming it. `toStatement` does not check `confidence`.
- `source.row` counts rows after `readCsv` drops blank lines; do not present it as a spreadsheet line number.
- A blank description gives `""` without a warning; two identical files have the same statement id (`buildLedger` already treats that as one import).
- Show `unverifiable` as "Cannot verify: this file has no balances", and `mismatch` with the named row.
- Months are computed over all statements together; per-account missing months need the account grouping above.

**Backlog (not scheduled):**

- Cross-file balance chain check (closing balance of one file against the next file's opening balance). It is what would cover the first and last rows of a file, so AC-2 holds for CSV only for middle rows until it exists. Also use `ParsedStatement.openingBalance` in `reconcile` when a statement has one (stage 2). Reword AC-2 in the PRD when this is decided.
- `reconcile` reports `mismatch` rather than `unverifiable` when an export lists same-day rows against its overall date direction; check against the real TD and CIBC fixtures.
- `mapColumns`: a balance column with a blank cell is not detected (fail closed); a lone Amount column with mixed signs and no balance is `high` (sign convention is the UI's job, above).

**Target files:** stage 1: CSV exports from TD (chequing) and CIBC (credit card). Stage 2: PDF statements for the same two accounts (A1 confirmed). Real exports and statements stay in `~/Statements/`.

**Blocked on the owner:** nothing blocks Claude's next tasks (11, 8, 9). Real-export fixtures and AC-3 need the owner's own CSV exports in the statements folder (outside the repository) and his review of the redacted output.

## Milestones

| #   | Milestone                                             | Status      | Started    | Finished   | Notes                              |
| --- | ----------------------------------------------------- | ----------- | ---------- | ---------- | ---------------------------------- |
| —   | Discovery, research, architecture, planning           | Done        | 2026-11-10 | 2026-11-10 | Seven planning documents written   |
| M0  | Validation gate and bootstrap                         | Done        | 2026-11-10 | 2026-11-10 | Gate: GO; A1 confirmed (TD + CIBC) |
| M1  | CSV import, ledger, fixture tooling, walking skeleton | In progress | 2026-11-11 |            | Stage 1                            |
| M2  | Recurring-charge detection                            | Not started |            |            | Stage 1                            |
| M3  | Product UI, demo mode, exports, trust features        | Not started |            |            | Stage 1                            |
| M4  | Hardening, deployment, small launch, validation       | Not started |            |            | Stage 1; ends with the stage gate  |
| M5  | PDF extraction, line model, PDF fixture tooling       | Not started |            |            | Stage 2; needs the M4 gate         |
| M6  | First PDF format (TD chequing) with reconciliation    | Not started |            |            | Stage 2                            |
| M7  | Second PDF format (CIBC credit card)                  | Not started |            |            | Stage 2                            |

## What the planning phase established

- Five related open-source projects were cloned and read; versions and licences of about 30 packages were checked against the npm registry (`docs/RESEARCH.md`).
- A throwaway spike confirmed that `pdfjs-dist` 6.5.438 returns positioned text and metadata, and that column-geometry parsing with balance reconciliation works on a synthetic two-page statement. Nothing has been tested on a real statement.
- No existing project is client-side, Canadian and subscription-aware at the same time.
- The leading open-source parser commits no fixtures for Canadian banks, so sample statements are this project's main risk.

## Open questions

| #   | Question                                                                                                             | Owner | Blocks        | Answer                                                                                |
| --- | -------------------------------------------------------------------------------------------------------------------- | ----- | ------------- | ------------------------------------------------------------------------------------- |
| 1   | Banks and account types with ≥ 3 months of PDF statements?                                                           | Bruce | M1            | TD chequing and CIBC credit card, ≥ 3 months of PDFs each (2026-11-10)                |
| 2   | Hours per week through mid-December?                                                                                 | Bruce | Schedule      | More than 20 hours per week (2026-11-10)                                              |
| 3   | Licence: MIT (recommended) or AGPL-3.0?                                                                              | Bruce | First commit  | MIT (choice delegated to Claude, 2026-11-10; ADR-006)                                 |
| 4   | Project name; buy a domain?                                                                                          | Bruce | M6            | Working name `recur`; public repo `Bruce1508/recur`. Final name and domain still open |
| 5   | Does Digital ToolPad (or any other browser tool) already parse your statements correctly?                            | Bruce | Positioning   |                                                                                       |
| 6   | What CSV export does your bank offer, and how far back?                                                              | Bruce | Fallback plan | Bank offers CSV export, 12 months or more back (2026-11-10)                           |
| 7   | For TD chequing and CIBC credit card: how far back does each CSV export go, and does the file have a balance column? | Bruce | M1 fixtures   |                                                                                       |

## Decisions pending sign-off

ADR-006 (MIT), ADR-015, ADR-016, ADR-017 and ADR-018 are Accepted. The rest stay Proposed until the owner signs off on the PRD.

## Waiting on the owner

Queued by the autonomous workflow. Claude does not attempt these.

- [ ] `sudo chown -R 501:20 ~/.npm`: the npm cache has root-owned files, so `npm` fails in the sandbox (worked around with a temp cache).
- [x] `gh` TLS error: works inside Claude Code when the Bash call runs with the sandbox disabled (2026-11-11); PRs, CI and merges now run from Claude's side.

- [ ] M1: download a CSV of transactions from TD (chequing) and CIBC (credit card), as far back as each allows, and save them in `~/Statements/`. Answer open question 7.
- [ ] M1: when `npm run fixture:dump` exists, run it on those files and review the redacted output before it is committed.
- [ ] M2: before looking at any detector output, write down the subscriptions you believe you have (ground truth for AC-7). Keep the list out of the repository.
- [ ] Open question 5: try one of your own statements in Digital ToolPad (and StatementSensei if convenient) and write down what each got right and wrong. Do not paste statement contents into any AI tool. Positioning only; matters for stage 2.
- [ ] Keep real exports and statements in `~/Statements/` only (created, mode 700), never inside the repository.
- [x] M0b-1: `npm run e2e` outside the sandbox. Covered by CI: the `verify` job runs the Playwright step and passed on PR #2.

## Acceptance criteria tracker

| ID    | Criterion (short)                             | Status  | Evidence                                                                            |
| ----- | --------------------------------------------- | ------- | ----------------------------------------------------------------------------------- |
| AC-1  | Fixtures match golden output and reconcile    | Partial | 11 synthetic layouts parse to exact golden output; verified with a balance (task 7) |
| AC-2  | Mutations produce a mismatch                  | Partial | Middle rows only on synthetic files; the ends need the cross-file chain (backlog)   |
| AC-3  | Two real CSV layouts, two fixtures each       | Partial | Synthetic layouts done; real TD and CIBC fixtures need the owner                    |
| AC-4  | No cross-origin requests, no request bodies   | —       |                                                                                     |
| AC-5  | Works offline after load                      | —       |                                                                                     |
| AC-6  | Detection precision ≥ 0.90, recall ≥ 0.80     | —       |                                                                                     |
| AC-7  | ≥ 80% of hand-listed subscriptions found      | —       |                                                                                     |
| AC-8  | CSV round-trip and injection safety           | —       |                                                                                     |
| AC-9  | 12 files in under 5 s                         | —       |                                                                                     |
| AC-10 | Demo works with no user file                  | —       |                                                                                     |
| AC-11 | CSP header on the deployed site               | —       |                                                                                     |
| AC-12 | README complete                               | —       |                                                                                     |
| AC-13 | Stage 2: two PDF formats, three fixtures each | —       |                                                                                     |
| AC-14 | Calendar file and list download are correct   | —       |                                                                                     |
| AC-15 | Five outside testers, findings recorded       | —       |                                                                                     |

## Risk watch

| Risk                                                                   | Status                                           | Next check               |
| ---------------------------------------------------------------------- | ------------------------------------------------ | ------------------------ |
| Too few real statements                                                | Reduced: A1 confirmed for two accounts           | M5                       |
| Real PDFs differ from the synthetic spike                              | Open                                             | M5, first real statement |
| Schedule against exams and internship applications                     | Open                                             | Weekly                   |
| TypeScript 7 tooling friction                                          | Closed: `tsc --noEmit` runs clean on 7.0.2 in CI | —                        |
| Real CSV exports differ from the synthetic layouts, or have no balance | Open                                             | M1, first real export    |
| People will not download a file from their bank                        | Open                                             | M4 validation            |
| `gh` TLS failure (`x509 -26276`) inside the sandbox                    | Works with the sandbox off (2026-11-11)          | Each session             |

## Session log

Newest first. One entry per session: date, what changed, what was verified, what is next.

### 2026-11-11 — M1 task 1: domain types, money, dates

- Added `src/core/types.ts` (the M1 subset of ARCHITECTURE §5), `money.ts` (`parseMoney` to integer cents without floats, bracketed and signed negatives, strict thousands grouping; `formatCents` via `Intl` en-CA CAD) and `plainDate.ts` (`parseDate` for the three `DateFormat`s with calendar validation; `daysBetween` by integer day numbers, no `Date`).
- Verified: `npm run verify` passes (114 tests); `src/core` line coverage 100%.
- Not decided: trailing-minus (`12.34-`) and `CR`/`DR` amounts are rejected for now; add them only if a real export shows them.
- Reviewer: APPROVE; fixed leading-zero thousands group (`0,001`), year 0000, and the `formatCents` comment. Open for task 3: `1,234` reads as thousands, so a decimal-comma export would misread by 1000x; `mapColumns` must not assume dot decimals silently.
- Next: M1 task 2 (`csv/read.ts`, PapaParse).

### 2026-11-11 — M1 task 10: import-boundary rule

- Added two `overrides` to `biome.json` using `style/noRestrictedImports` (error) with glob `patterns`: `src/core/**` may not import `pdfjs-dist`, `react`, `react-dom` (or any subpath of them) or anything under a `ui/` or `pdf/` directory; the rest of `src/` (except `src/pdf/extract.ts`) may not import `pdfjs-dist` or its subpaths. It runs in `npm run lint`, so it is part of `npm run verify` and CI.
- Proof (throwaway files, deleted): in `src/core/csv/`, `pdfjs-dist/legacy/build/pdf.mjs`, `react/jsx-runtime`, `react-dom/client`, `../ui/x` and bare `pdfjs-dist` were all errors; `pdfjs-dist/build/pdf.mjs` in `src/ui/` and `src/pdf/other.ts` was an error; in `src/pdf/extract.ts` it was accepted; `react-dom/client` in `src/ui/` was accepted.
- Review round 1 (fixed): the first version used exact package names (`paths`), so subpath imports like `pdfjs-dist/build/pdf.mjs`, the normal way to import it, passed. Patterns now cover subpaths. The reviewer also confirmed type-only imports and dynamic `import()` are flagged.
- Verified: `npm run verify` passes.
- Next: task 11 (walking-skeleton UI).

### 2026-11-11 — M1 task 7: synthetic exports

- Added `tools/make-synthetic.ts` (seeded, deterministic, fictional merchants): `generateLedger(seed)` (12 months: semi-monthly pay, rent, a streaming charge, a gym whose price rises after six months, random groceries, coffee and a bookshop with a comma in its name), `LAYOUTS` (header x signed/split x balance with all three date formats, plus a newest-first file and two files with `$` and thousands separators), `renderCsv`, `expectedMapping`, `makeSyntheticSet`. `tools/` is now in `tsconfig.json` and Vitest's include.
- `tools/make-synthetic.test.ts` runs every layout through `readCsv → mapColumns → toStatement → reconcile`: exact golden transactions, `verified` with a balance and `unverifiable` without, and a one-cent alteration of a middle row flips to `mismatch` naming that row (AC-1, AC-2 for middle rows, AC-3 synthetic part). Two overlapping exports merge back into the original ledger through `buildLedger` (nothing lost, nothing doubled), and a file that skips months reports them.
- **Bug found by these tests and fixed in `mapColumns`:** a debit/credit file whose balance chain was broken was refused ("Cannot tell which numeric columns are amounts"), so the user never saw a mismatch. A pair of complementary columns plus one always-filled column is now mapped as debit/credit + balance at low confidence, and `reconcile` reports the break.
- No CLI writes files yet; the Playwright fixtures and the demo (tasks 11 and M3) import the generator or generate files when they need them.
- Verified: `npm run verify` passes (269 tests).
- Next: tasks 8-9 need the owner's real exports (see "Waiting on the owner"); task 10 (import-boundary rule) and task 11 (walking-skeleton UI) do not.

### 2026-11-11 — M1 task 6: ledger

- Added `src/core/ledger.ts`: `buildLedger(statements)` returns `{ transactions, duplicatesRemoved, missingMonths }`. Rows are the same when date, amount, description and printed balance match; for each row the statement holding the most copies supplies them (first on a tie), so two identical coffees in one file stay, and the same row in two overlapping exports is kept once. The same file imported twice adds nothing. Missing months are whole calendar months between covered stretches.
- Review round 1 (REQUEST_CHANGES, fixed): the identity key ignored the account, so a chequing and a card CSV without balances lost one of two identical charges silently. Bank and kind are now part of the key. **Residual limit (pinned by a test):** two accounts of the same kind with no balance column still merge on an identical same-day charge; the UI (task 11) must group files by account and call `buildLedger` once per account.
- Limits, pinned by tests or noted in the code: the same account exported with and without a balance column is not de-duplicated; missing months are computed over all statements together (a gap in one account can hide behind another's coverage; the UI should group by account); same-day order follows input order, so a newest-first file lists its same-day rows reversed.
- **Not done, moved to the backlog:** the cross-file balance chain check (closing balance of one file against the next file's opening balance). It is what would cover the first and last rows of a file (see task 5), so AC-2 ("removing or altering any one transaction") is only guaranteed for middle rows of a CSV until it exists. Needs a decision on opening-balance handling together with `reconcile` ignoring `ParsedStatement.openingBalance`; do it when real fixtures show what the exports contain.
- Verified: `npm run verify` passes (219 tests).
- Next: task 7 (`tools/make-synthetic.ts`).

### 2026-11-11 — M1 task 5: running-balance reconciliation

- Added `src/core/reconcile.ts`: `reconcile(statement)` checks each printed balance against the previous row. The dates pick the direction (rising: oldest-first, falling: newest-first); dates in no order are `unverifiable`. Only when every date is the same are both orders tried (fewer broken steps wins, oldest-first on a tie), and then an altered last-in-time row can go unseen. A credit account's balance is the amount owed, so purchases raise it. Result is `verified`, `mismatch` (with expected, actual and the first bad row) or `unverifiable` (no balances, a row without one, fewer than two rows, or rows skipped in `toStatement`). A mismatch wins over warnings.
- **Known limit, by construction:** one file has no opening balance, so the first row's own amount and a row removed from either end are not detected. AC-2 ("removing or altering any one transaction") therefore holds for CSV only for middle rows; the ends need the ledger chain check (task 6: closing balance of one file against the next). Both limits are pinned by tests so they cannot change silently. Update the AC-2 wording in the PRD when task 6 lands.
- Carried from the task 4 review: `source.row` counts rows after `readCsv` drops blank lines, so do not show it as a spreadsheet line; the UI (task 11) must make the user confirm a lone signed column and must not convert a `low` mapping unconfirmed; a blank description gives `""` without a warning; two identical files have the same statement id, so `ledger` must treat that as already imported.
- Review round 1 (opus, REQUEST_CHANGES, fixed): choosing the order by failure count let an altered last row verify (a purchase and its refund); and in the newest-first reading `expected`/`actual` belonged to the neighbouring row. Both pinned by tests.
- Verified: `npm run verify` passes (203 tests); `reconcile.ts` fully covered except two defensive lines.
- Next: task 6 (`ledger.ts`).

### 2026-11-11 — M1 task 4: rows to statement

- Added `src/core/csv/toStatement.ts`: `toStatement(rows, mapping, { kind, negateSigned? })` returns `{ ok: true, statement }` or `{ ok: false, reason }`. A row that cannot be converted (date, amount, both or neither of debit/credit, negative debit or credit) becomes a warning naming the row and field, never the cell text; the row is left out. An unreadable balance keeps the transaction and drops `balanceAfter`. Fails only when no row converts.
- Statement id is `csv-` plus a 53-bit hash of the rows; transaction id is `<statementId>:<row>`; no `-0`.
- Sign convention: `ColumnMapping` still has no sign field, so a lone signed column is taken as negative = out unless the UI passes `negateSigned` after the user confirms a sample. The M1 UI task (11) must ask when there is a lone signed column with no balance to check it against (review note on task 3).
- Tests cover the cross-field invariants (`source.statementId`, `input`, `period.start <= end`).
- Verified: `npm run verify` passes (169 tests); `toStatement.ts` 100% line coverage.
- Next: task 5 (`reconcile.ts`, running-balance method).

### 2026-11-11 — M1 task 3: column mapping

- Added `src/core/csv/mapColumns.ts`: `mapColumns(rows)` returns `{ ok: true, mapping }` or `{ ok: false, reason }`. Works from cell contents (header labels only break a debit/credit tie). Date column must be filled in every row; a balance is accepted only when it continues row to row by the amounts, oldest-first or newest-first.
- Low confidence (UI must confirm): dates that fit both day-first and month-first, two text columns, debit/credit order not provable, a balance that moves opposite to the amounts (no sign field in `ColumnMapping`), two numeric columns that do not reconcile.
- Fails closed: ragged rows, decimal-comma amounts (refused rather than low confidence, because `toStatement` cannot convert them and `1,234` would read as 1234), no date, amount or description column, no transactions.
- Verified: `npm run verify` passes; `mapColumns.ts` fully covered.
- Known limit: a column of plain integers (cheque numbers) looks like money; it yields low confidence or a failure, not a silent wrong mapping.
- Review round 1 (REQUEST_CHANGES, fixed): with a balance and separate debit/credit columns, the order came from the balance sign and ignored the header, so a card export swapped them at high confidence. Now the header decides; no labels and a reversed sign is low.
- Review round 2 (REQUEST_CHANGES, fixed): a Debit/Credit file where one column is empty in every row was mapped as a signed amount at high confidence, so purchases read as inflows. A lone column labelled Debit or Credit is now low.
- Review round 3 (REQUEST_CHANGES, fixed after the owner asked to continue past the two-round limit): a headerless Debit/Credit file whose partner column is empty in every row and which has no balance column maps as signed at high confidence (purchases read as inflows). Now low when a lone amount column has no balance and is all positive.
- Fixed: French amounts (`4,50 $`, `1 234,56`) now get the decimal-comma message.
- Open, non-blocking: a balance column with a blank cell is not detected (a three-money-column file is then refused, fail closed). Relaxing this would let a debit column pose as a balance.
- Next: task 4 (`toStatement`).

### 2026-11-11 — M1 task 2: CSV reader

- Added `src/core/csv/read.ts`: `readCsv(text)` returns `{ ok: true, rows }` or `{ ok: false, reason }` (a deliberate refinement of the `string → string[][]` signature in ARCHITECTURE §6.0, so a malformed quote fails closed instead of folding the rest of the file into one cell). Cells stay strings; BOM stripped; blank lines dropped; delimiter detected by PapaParse.
- Dependencies: `papaparse` 5.7.1 and `@types/papaparse` 5.5.2, exact pins, both already in `approved-deps.json`; RESEARCH §5 row updated (it said 5.7.0).
- Verified: `npm run verify`, see the PR for the result lines.
- Next: M1 task 3 (`csv/mapColumns.ts`). It must not assume dot decimals silently (see task 1 note), must check row widths (`readCsv` returns ragged rows as they are), and should treat a semicolon-delimited file with comma decimals as low confidence.

### 2026-11-10 — Re-scope: CSV first, PDF second (ADR-018)

- **Scope changed.** The owner made usefulness to real users the first goal. CSV import is now the first input (stage 1, M1–M4, ending with a small launch and five outside testers); verified PDF parsing is stage 2 (M5–M7) behind a stage gate. Added to the PRD: annual-charge detection, a calendar file, a summary download, a label for ambiguous charges, AC-13 to AC-15, assumptions A8 and A9.
- Updated: `docs/PRD.md` (v0.2), `docs/ROADMAP.md` (new milestone order), `docs/ARCHITECTURE.md` (CSV input stages, data model), `docs/DECISIONS.md` (ADR-018), `docs/RESEARCH.md` §12 (market re-check with sources), `README.md`, `CLAUDE.md`.
- Evidence: four web searches, mostly vendor pages; no users interviewed. The AC-6 and AC-7 thresholds are unchanged.
- Verified: `npm run verify` passes (docs-only change; lint covers the Markdown formatting).
- Not verified: any bank's real CSV layout; whether people will download a file from their bank (A9, tested in M4).
- Next: M1 through `ship-task`. Tasks 1–7 need nothing from the owner.

### 2026-11-10 — M0 gate decision: GO

- Owner answers: open questions 1, 2 and 6 answered (table above). A1 is confirmed with two target formats: TD chequing and CIBC credit card. Open question 5 (existing-tool test) is still open and queued under "Waiting on the owner"; it affects positioning only.
- Decision: **go**, no scope change. A time budget of 20+ hours per week supports the M1-M3 schedule.
- Fallback noted: the bank offers CSV export 12+ months back, which covers the fallback plan if a PDF format proves unparseable.
- Not verified: nothing has been run on a real statement yet. M1 starts when the owner places the first real statement in the private statements folder (Claude never reads it).
- Next: M1 through `ship-task`.

### 2026-11-10 — M0b-3 gate hardening and privacy probe

- PR #1 merged after reviewer APPROVE. It had no CI to wait for, and `main` requires the `verify` check, so the CI workflow (`.github/workflows/ci.yml`, job id `verify`) was added to PR #1 before merging.
- Hardened the gates: Biome `noExplicitAny` and `noNonNullAssertion` are now errors (they were warnings, so `verify` would not have caught a new `any`); the e2e network check ignores `data:` URLs (origin `"null"`).
- Privacy probe on a non-existent `private/probe.txt`: Read denied by the permission rule; `cat` and `node` denied by the guard hook. Blocked by path, not by "file not found".
- Verified: `npm run verify` (typecheck, lint on 22 files, 1 test, build) passes locally.
- Not verified: `npm run e2e` locally (see "Waiting on the owner"); the CI e2e step is its first run. `gh` fails inside the Claude Code process with a TLS error, so PR creation and merge were done by the owner from a terminal.
- Next: owner completes M0a (open questions 1, 2, 5, 6), then the M0 gate decision is recorded.

### 2026-11-10 — M0b-1 review fixes

- Fixed reviewer round 1: Biome `recommended` preset on, CSP moved to a build-only Vite plugin (dev server needs inline scripts) with `worker-src 'self'` per ARCHITECTURE §8, origin comparison in the e2e check, ADR-017 index row, `@types/react*` in RESEARCH §5, trailing blank line.
- Verified: `npm run verify` passes (typecheck, lint, 1 test, build); built `dist/index.html` contains the CSP meta. `npm run e2e` and `npm run dev` still not run.
- Not merged: `gh` fails with a TLS x509 error (OSStatus -26276) inside and outside the sandbox, so CI status could not be read and no reviewer re-review ran. PR 1 stays open.

### 2026-11-10 — M0b-1 scaffold

- Scaffolded Vite 8, React 19, TypeScript 7.0.2 (`tsc --noEmit` works, so ADR-012 stands), Biome, Vitest, Playwright, Tailwind, all pinned and in `approved-deps.json`; CSP `<meta>` and a placeholder page; `npm run verify`. Added ADR-017 and the standalone-command rule to `ship-task` steps 7 and 10. README stub and LICENSE confirmed present.
- Verified: `npm run verify` (typecheck, lint, 1 test, build) passes locally.
- Not verified: `npm run e2e` (sandbox blocks port binding); see "Waiting on the owner". No CI workflow yet (M0b task 7).
- Next: CI workflow with job `verify`.

### 2026-11-10 — Bootstrap

- Moved the planning documents into a standalone repository with `docs/`; added the Claude Code automation (settings, sandbox, guard and format hooks, `reviewer` agent, `ship-task` skill), PR template, `.gitignore`, LICENSE (MIT) and a README stub. Added ADR-015 and ADR-016.
- Verified: guard hook unit tests (`node --test .claude/hooks/guard.test.mjs`); the pinned versions in `docs/RESEARCH.md` §5 still match the npm registry.
- Not verified yet: sandbox and guard behaviour inside a live session (M0b privacy probe), GateGuard and claude-mem disabled (check with `/status` in the first session in `recur/`).
- Next: M0b.
### 2026-11-10 — Planning

- Wrote the PRD, research, architecture, decision records, roadmap, this file and `CLAUDE.md`.
- Verified: package versions and peer ranges, repository licences and activity, pdf.js extraction on a synthetic PDF, PapaParse formula-escaping behaviour.
- Not verified: anything involving a real bank statement.
- Next: Bruce answers open questions 1–3, then M0.
