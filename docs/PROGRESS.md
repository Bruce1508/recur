# Progress

Living document. Update it at the end of every working session. Never record statement contents, merchant names from real statements, or account details here; counts and pass/fail only.

**Last updated:** 2026-11-20

## Current status

**State on 2026-11-20 (verified against `git log origin/main` and the GitHub issue list):** `main` is at `3c808b9` (PR #26), 440 tests, CI green. Open pull request: #27 (ADR-021 proposed, docs only). Built and merged:

- M1, the CSV pipeline and walking-skeleton UI (PRs #5 to #16): code complete, synthetic data only.
- M5: `src/pdf/extract.ts` (the only `pdfjs-dist` importer), `normalize` (with the overdraw fix), the layout mask and `npm run pdf:dump`. The owner has run the dump on two real TD chequing statements and shared page 1 of one as a masked table; pages 2 to 4, the second statement and the CIBC statement have not been seen.
- M6 so far: ADR-020 and `reconcile` checkpoints and totals (PRs #23, #24); the `BankProfile` type, the `td-chequing` profile, `detect`, `parse` and a synthetic TD statement generator (PR #25); the description census CLI (PR #26).

**Not true yet, so do not assume it:** the parser has never run on a real PDF. Everything above is tested on invented data whose geometry comes from one masked page. The importer accepts PDFs (#28), but only synthetic ones have been dropped in it. There are no real fixtures (AC-13 needs three per format), no second bank (M7), no recurring detection or decoder (M2), no exports or demo (M3), no deployment (M4). `reconcile` has never produced `verified` for a real statement.

**Direction under discussion:** see the ADR-021 paragraph below. **Open work:** GitHub issues #28 to #38, listed with their model tier in "Issues and model routing".

**Scope change (2026-11-14, ADR-019):** the owner checked and both TD chequing and CIBC credit card offer statement PDFs only. PDF parsing now comes first: the order is M5, M6, M7, then M2, M3, M4. The CSV code below stays on `main` with no new work, and the real-CSV fixtures (AC-3, real part) are dropped. `src/pdf/extract.ts` and `tools/pdf-dump.ts` (M5 tasks 1 and 4) are built: the owner runs `npm run pdf:dump` on his PDFs to produce a masked layout dump. `normalize` (M5 task 2) is built too. The `reconcile` checkpoint and totals methods are merged (PR #24), and the TD profile, `detect` and `parse` are built against a synthetic generator (M6 task 4). Next: the UI accepts PDFs (M6 task 6).

**Phase (before ADR-019):** M1 in progress (stage 1, CSV first, ADR-018). The whole CSV pipeline up to the ledger is on `main`, tested end to end on synthetic data (269 tests, `npm run verify` green, CI green): `src/core/money.ts`, `plainDate.ts`, `csv/read.ts`, `csv/mapColumns.ts`, `csv/toStatement.ts`, `reconcile.ts`, `ledger.ts`, `tools/make-synthetic.ts`, and the import-boundary lint rule (PRs #5 to #12, tasks 1 to 7 and 10).

**M1 is code-complete:** tasks 1 to 11 are built (11 is the UI, PR #15; 8 and 9 are the fixture tools, PR #16; 312 tests on `main` at `e25ea6f`). The real-export criteria were dropped by ADR-019. Optional for the owner: try the UI with `npm run dev` on a synthetic CSV.

**Tooling note:** `gh` fails with `x509: OSStatus -26276`. On 2026-11-11 it worked once the sandbox was disabled for that call; since 2026-11-17 it fails intermittently even with the sandbox disabled (`gh pr checks`, `gh pr create` and `gh issue create` worked, `gh pr merge` often did not, and a failed call can be followed by a working one). It is therefore not only the sandbox. Use `dangerouslyDisableSandbox` only for `gh` and `git push`/`fetch`, never retry in a loop, and when a merge keeps failing give the owner the exact `gh pr merge ... --match-head-commit <sha>` command to run from a terminal. If the owner fixes the macOS certificate setup, drop this note.

**CI note:** the earlier `verify` failures were not code. `npx playwright install --with-deps chromium` failed because the runner could not resolve `*.ubuntu.com` (apt, `Temporary failure resolving`). A rerun passed. If it recurs, cache the Playwright browsers or retry that step, in its own branch.

**Direction under discussion (ADR-021, Proposed, 2026-11-20):** the owner wants the app to help read unfamiliar transaction descriptions (a readout of where the money went), without an LLM and without training a model. Read ADR-021 and PRD §1a before touching M2 or M3. It does not change M5 to M7. Waiting on the owner: run `npm run census` on his real statements and share the counts only; the ADR is completed from them.

**Next session, in order:**

1. Run `git log origin/main` and `gh pr list` to confirm what is merged (PR #27 may still be open). Never `--admin`; never force-push (merge `main` into the branch instead of rebasing).
2. Work the open issues in this order, one PR each, through `ship-task` (#30 is done in its own PR): #28 (UI accepts PDFs), #29 (property test and generator fix), #31 (statement chaining: Opus designs and writes the ADR, Sonnet implements). The model tier of each is in "Issues and model routing".
3. Owner-blocked, do not attempt: #38 (census numbers, dumps of pages 2 to 4 and the CIBC statement, the hand-written subscription list). When the owner pastes a reviewed dump or the census counts, record the quirks here and check the ADR-020 rules against them. Claude never reads a real statement; only the masked dump and counts.
4. After the census numbers: #32 (accept ADR-021, Opus). Then, following the ADR-019 order (M7 before M2): #35 (M7, needs the CIBC dump), then #33 (decoder) and #34 (recurring detection), then #36 (M3) and #37 (M4). If the CIBC dump is late, starting #33 after #32 would change the stated order and needs the owner's say-so recorded here; #34 always waits for M7.

**Requirements carried into task 11 and later** (found in reviews; most are pinned by a test or noted in code; the blank-description item is neither, add a test or a warning when touching `toStatement`):

- Group files by account and call `buildLedger` once per account. Two accounts of the same kind and bank with no balance column merge on an identical same-day charge (silent loss otherwise). The same account exported with and without a balance column is not de-duplicated. CSV and PDF of one account (#28): a verified PDF replaces the CSV rows dated inside its period; a PDF that does not verify replaces nothing, so its overlap with a CSV is counted twice. PDFs default to account A and CSVs to B, so the replacement needs the user to move the CSV (review of PR #42). Check against a real statement: periods share the boundary day (SEP 01 - OCT 01), and the end date counts as covered.
- A lone signed amount column has no sign convention in `ColumnMapping`: the UI must show a sample and let the user set `negateSigned` before `toStatement`. A `low` mapping must never be converted without the user confirming it. `toStatement` does not check `confidence`.
- `source.row` counts rows after `readCsv` drops blank lines; do not present it as a spreadsheet line number.
- A blank description gives `""` without a warning; two identical files have the same statement id (`buildLedger` already treats that as one import).
- Show `unverifiable` as "Cannot verify: this file has no balances", and `mismatch` with the named row.
- Months are computed over all statements together; per-account missing months need the account grouping above.

**Backlog (not scheduled):**

- A card export with labelled Debit/Credit columns and a balance is "ready" without asking, and the account type defaults to chequing, so it can show a false "Mismatch" until the user switches the type. Default the type from the balance direction, or ask (found in the task 11 re-review).
- `mapColumns` returns low confidence for any extra text column (a card number, a memo) and in one probe picked the card column as the description. `fixture:dump --description` works around it for fixtures; the UI has no way to pick the description column yet. See what the real CIBC export looks like first.
- `reconcile` reports `mismatch` rather than `unverifiable` when an export lists same-day rows against its overall date direction; check against the real TD and CIBC fixtures.
- `mapColumns`: a balance column with a blank cell is not detected (fail closed); a lone Amount column with mixed signs and no balance is `high` (sign convention is the UI's job, above).

**Target files (ADR-019):** PDF statements from TD (chequing) and CIBC (credit card); neither bank offers CSV. Real statements stay in `~/Statements/`.

**Blocked on the owner:** the census numbers (unblock ADR-021, #32), the dumps of TD pages 2 to 4, the second TD statement and the CIBC statement (unblock real-layout checks and M7, #35), and the hand-written subscription list (AC-7). Issues #28 to #31 do not need the owner. Full list: issue #38 and "Waiting on the owner".

## Issues and model routing

Created 2026-11-20 as GitHub issues, each with a "Model routing" section from `/ecc:model-route` (one routing agent per task; several worked from the task text without reading the docs, so the tiers are estimates to be corrected on evidence). Routing policy: `~/.claude/CLAUDE.md` (Sonnet default; escalate on evidence; the `reviewer` agent runs on every PR, opus for parse, reconcile, CSP, file handling).

| Issue | Task                                      | Model                                | Fallback            | Blocked by                 |
| ----- | ----------------------------------------- | ------------------------------------ | ------------------- | -------------------------- |
| #28   | M6: UI accepts PDF statements (PR open)   | Sonnet (Haiku for strings)           | Opus                | none                       |
| #29   | M6: property test and generator fix       | Sonnet                               | Opus if a real bug  | none                       |
| #30   | Small review findings from PRs #25 to #27 | Sonnet                               | Opus                | none                       |
| #31   | Statement chaining in the ledger          | Opus (ADR), then Sonnet              | Sonnet only         | none                       |
| #32   | ADR-021: complete and accept              | Opus                                 | Fable if messy      | owner census (#38)         |
| #33   | M2: transaction decoder                   | Sonnet (Haiku for scaffolding)       | Opus                | #32                        |
| #34   | M2: recurring-charge detection            | Sonnet                               | Opus                | M7 order; owner list (#38) |
| #35   | M7: CIBC credit card                      | Opus (ADR), then Sonnet              | Sonnet only         | owner CIBC dump (#38)      |
| #36   | M3: UI, demo, exports                     | Sonnet (Opus reviews the CSV export) | Opus                | M2                         |
| #37   | M4: hardening, deployment, launch         | Sonnet                               | Opus on CSP failure | M3; owner approvals        |
| #38   | Owner tasks                               | not for Claude                       | n/a                 | n/a                        |

## Milestones

| #   | Milestone                                             | Status      | Started    | Finished   | Notes                                                                                                                                                    |
| --- | ----------------------------------------------------- | ----------- | ---------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| —   | Discovery, research, architecture, planning           | Done        | 2026-11-10 | 2026-11-10 | Seven planning documents written                                                                                                                         |
| M0  | Validation gate and bootstrap                         | Done        | 2026-11-10 | 2026-11-10 | Gate: GO; A1 confirmed (TD + CIBC)                                                                                                                       |
| M1  | CSV import, ledger, fixture tooling, walking skeleton | Code done   | 2026-11-11 | 2026-11-13 | Tasks 1 to 11 merged; real-CSV fixtures dropped (ADR-019)                                                                                                |
| M5  | PDF extraction, line model, PDF fixture tooling       | Mostly done | 2026-11-14 |            | Extract, normalize, mask and dump built; first real page seen; real fixtures wait on the owner                                                           |
| M6  | First PDF format (TD chequing) with reconciliation    | In progress | 2026-11-14 |            | Reconcile, profile, detect, parse built on synthetic data; UI (#28), property test (#29), chaining (#31) merged; real-statement checks wait on the owner |
| M7  | Second PDF format (CIBC credit card)                  | Not started |            |            | After M6                                                                                                                                                 |
| M2  | Recurring-charge detection                            | Not started |            |            | Now after M7                                                                                                                                             |
| M3  | Product UI, demo mode, exports, trust features        | Not started |            |            |                                                                                                                                                          |
| M4  | Hardening, deployment, small launch, validation       | Not started |            |            | Ends with the launch and testers                                                                                                                         |

## What the planning phase established

- Five related open-source projects were cloned and read; versions and licences of about 30 packages were checked against the npm registry (`docs/RESEARCH.md`).
- A throwaway spike confirmed that `pdfjs-dist` 6.5.438 returns positioned text and metadata, and that column-geometry parsing with balance reconciliation works on a synthetic two-page statement. Nothing has been tested on a real statement.
- No existing project is client-side, Canadian and subscription-aware at the same time.
- The leading open-source parser commits no fixtures for Canadian banks, so sample statements are this project's main risk.

## Open questions

| #   | Question                                                                                                             | Owner | Blocks        | Answer                                                                                                                  |
| --- | -------------------------------------------------------------------------------------------------------------------- | ----- | ------------- | ----------------------------------------------------------------------------------------------------------------------- |
| 1   | Banks and account types with ≥ 3 months of PDF statements?                                                           | Bruce | M1            | TD chequing and CIBC credit card, ≥ 3 months of PDFs each (2026-11-10)                                                  |
| 2   | Hours per week through mid-December?                                                                                 | Bruce | Schedule      | More than 20 hours per week (2026-11-10)                                                                                |
| 3   | Licence: MIT (recommended) or AGPL-3.0?                                                                              | Bruce | First commit  | MIT (choice delegated to Claude, 2026-11-10; ADR-006)                                                                   |
| 4   | Project name; buy a domain?                                                                                          | Bruce | M6            | Working name `recur`; public repo `Bruce1508/recur`. Final name and domain still open                                   |
| 5   | Does Digital ToolPad (or any other browser tool) already parse your statements correctly?                            | Bruce | Positioning   |                                                                                                                         |
| 6   | What CSV export does your bank offer, and how far back?                                                              | Bruce | Fallback plan | Bank offers CSV export, 12 months or more back (2026-11-10). Corrected 2026-11-14: TD and CIBC offer PDF only (ADR-019) |
| 7   | For TD chequing and CIBC credit card: how far back does each CSV export go, and does the file have a balance column? | Bruce | M1 fixtures   |                                                                                                                         |

## Decisions pending sign-off

ADR-006 (MIT), ADR-015, ADR-016, ADR-017, ADR-018 (stage order superseded by ADR-019) and ADR-019 are Accepted. The rest stay Proposed until the owner signs off on the PRD.

## Waiting on the owner

Queued by the autonomous workflow. Claude does not attempt these.

- [ ] `sudo chown -R 501:20 ~/.npm`: the npm cache has root-owned files, so `npm` fails in the sandbox (worked around with a temp cache).
- [x] ~~M1: download CSVs from TD and CIBC~~ Dropped by ADR-019: both banks offer PDF only (owner checked 2026-11-14). Open question 7 is moot.
- [ ] M5: keep at least three statement PDFs per account (TD chequing, CIBC credit card) in `~/Statements/`. Run `npm run pdf:dump -- /abs/path/statement.pdf` on one PDF per account (add `--deny-list /abs/path/deny.txt` with your own names and numbers). It writes `<name>.layout.json` next to the PDF, outside the repository, and refuses a PDF with no text layer. Read the output; if it holds no real names, numbers or merchants, paste it to Claude. Dates and amounts are kept as they are (the parser needs them), so look at those too.
- [ ] Description census (ADR-021, pending): run `npm run census -- /abs/path/a.pdf /abs/path/b.pdf ...` on your real TD statements, outside the repository. It prints counts and percentages only, never a description (readable text, payment-processor prefix, opaque code; bank-code suffixes; digit runs). Paste the output to Claude.
- [ ] Optional, only if you ever get a CSV: `npm run fixture:dump` still works (`--description <n>` for an extra text column, `--deny-list /abs/path/deny.txt` for your own names and numbers). Its merchant map holds real merchant names: keep it outside the repository.
- [ ] M2: before looking at any detector output, write down the subscriptions you believe you have (ground truth for AC-7). Keep the list out of the repository.
- [ ] Open question 5: try one of your own statements in Digital ToolPad (and StatementSensei if convenient) and write down what each got right and wrong. Do not paste statement contents into any AI tool. Positioning only; matters for stage 2.
- [ ] Keep real exports and statements in `~/Statements/` only (created, mode 700), never inside the repository.
- [x] M0b-1: `npm run e2e` outside the sandbox. Covered by CI: the `verify` job runs the Playwright step and passed on PR #2.

## Acceptance criteria tracker

| ID    | Criterion (short)                             | Status  | Evidence                                                                                                                                                                                                 |
| ----- | --------------------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC-1  | Fixtures match golden output and reconcile    | Partial | 11 synthetic CSV layouts and one synthetic TD PDF format (PR #25) parse to exact golden output and verify; no real fixture yet                                                                           |
| AC-2  | Mutations produce a mismatch                  | Partial | CSV: middle rows by the file's own check, first and last rows by the chain with a neighbour (ADR-025, #31); outer ends labelled. Synthetic TD PDF: every row removed or altered by a cent gives mismatch |
| AC-3  | Synthetic CSV layouts (real CSV dropped)      | Met     | 11 synthetic layouts (task 7); real TD and CIBC CSV dropped by ADR-019                                                                                                                                   |
| AC-4  | No cross-origin requests, no request bodies   | —       |                                                                                                                                                                                                          |
| AC-5  | Works offline after load                      | —       |                                                                                                                                                                                                          |
| AC-6  | Detection precision ≥ 0.90, recall ≥ 0.80     | —       |                                                                                                                                                                                                          |
| AC-7  | ≥ 80% of hand-listed subscriptions found      | —       |                                                                                                                                                                                                          |
| AC-8  | CSV round-trip and injection safety           | —       |                                                                                                                                                                                                          |
| AC-9  | 12 files in under 5 s                         | —       |                                                                                                                                                                                                          |
| AC-10 | Demo works with no user file                  | —       |                                                                                                                                                                                                          |
| AC-11 | CSP header on the deployed site               | —       |                                                                                                                                                                                                          |
| AC-12 | README complete                               | —       |                                                                                                                                                                                                          |
| AC-13 | Stage 2: two PDF formats, three fixtures each | —       |                                                                                                                                                                                                          |
| AC-14 | Calendar file and list download are correct   | —       |                                                                                                                                                                                                          |
| AC-15 | Five outside testers, findings recorded       | —       |                                                                                                                                                                                                          |

## Risk watch

| Risk                                                                         | Status                                                    | Next check                                 |
| ---------------------------------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------ |
| Too few real statements                                                      | Reduced: A1 confirmed for two accounts                    | M5                                         |
| Real PDFs differ from the synthetic data (parser built from one masked page) | Open: parser never run on a real PDF                      | Owner runs the census and more dumps (#38) |
| Schedule against exams and internship applications                           | Open                                                      | Weekly                                     |
| TypeScript 7 tooling friction                                                | Closed: `tsc --noEmit` runs clean on 7.0.2 in CI          | —                                          |
| Real CSV exports differ from the synthetic layouts, or have no balance       | Closed for the owner (no CSV, ADR-019)                    | Only if a CSV user appears                 |
| People will not download a file from their bank                              | Open                                                      | M4 validation                              |
| `gh` TLS failure (`x509 -26276`)                                             | Intermittent, also with the sandbox off; see Tooling note | Each session                               |

## Session log

Newest first. One entry per session: date, what changed, what was verified, what is next.

### 2026-11-20 — Review notes from PR #45

- Fixed the non-blocking notes: the gap text now says a statement between the files, or the first or last rows of either file, may be missing (a CSV's period comes from its rows, so a removed edge row also shows as a gap); the per-file "Not checked" line no longer claims there is no neighbour; the unchainable reason no longer shows an internal id; a property pins that a newest-first CSV chains like the same CSV oldest-first. Screenshot `docs/evidence/chain-boundary.png` retaken.
- Not done: the `doubt-driven-development` pass that ADR-025 and `skill-selection.md` name for #31 was not run; the Opus reviewer of PR #45 did an adversarial read with scratch tests through `toStatement` instead. PR #45's body gave a wrong reason for skipping it.
- Previous PR (#45): one review round (APPROVE, five non-blocking notes), CI green on the first run.
- Verified: typecheck, `npm test` (479 passed), `npm run e2e` (9 passed, outside the sandbox). Not verified: any real statement.

### 2026-11-20 — Statement chaining (#31, ADR-025)

- Opus designed ADR-025 (accepted): the ends of a statement come only from a verified statement (PDF: printed opening balance, closing = opening + net; CSV: first and last row balances in time order), the caller groups by account, adjacent statements are judged `chained`, `gap`, `mismatch` or `unchainable`. New `src/core/chain.ts` (`chainStatements`), `Ledger.chain`, AC-2 reworded in the PRD. UI: a per-file note for unchecked CSV ends and a per-account list of boundaries that do not chain (names both files and both balances). Deviation from the ADR text: the file status stays "Verified: ..." and the unchecked ends are a separate line, so the existing wording and e2e checks are unchanged.
- Tests: 18 in `chain.test.ts` (examples from the ADR plus four fast-check properties: clean history, order independence, any one-row mutation caught except the two outer-end cases which are asserted to stay unseen, dropped middle statement is a gap). Mutation check of `chain.ts` (no verified check, CSV shared day, gap threshold, no reversal, sign): each fails tests. Screenshot: `docs/evidence/chain-boundary.png` (synthetic CSVs).
- Verified: see the PR. Not verified: any real statement. Known limits (ADR-025): a missing stretch that nets to zero chains, the outer ends of an account stay unchecked, overlapping CSV exports are `unchainable`. A CSV and a PDF of one account chain only when the user puts them in the same account letter.
- Previous PR (#44): one review round (APPROVE, three non-blocking notes), CI green on the first run.
- Next: no unblocked implementation task is left in M6. #32 and #35 wait on the owner (census numbers, CIBC dump, #38); #33, #34 follow them.

### 2026-11-20 — Property test and generator fix (#29)

- `src/pdf/tdStatement.property.test.ts` (fast-check 4.10.2, 100 runs): a random ledger goes through `makeTdStatement`, `extractPdf`, `normalize`, `detect`, `parse` and `reconcile` and must come back exactly with `verified` by checkpoints. Generator fix: the suffix is placed after the measured description width plus a fixed gap, so long descriptions no longer push it into the amount area. Mutation check: the old formula fails the property.
- Found by the property, not fixed (real-layout geometry needed): a description continuation line that ends a non-final page with no total row is cut by `parse`'s body rule, silently (amounts and `verified` unaffected). The multi-page runs therefore carry no continuation lines. A negative running balance is printed without a sign by the generator, so balances stay positive; the real overdraft format is unknown.
- Previous PR (#42/#43, from the git log): review rounds and first-run CI not re-checked this session.
- Verified: `npm run typecheck`, `npx biome check` on tracked paths, `npm test` (457 passed), `npm run build`, `npm run fixtures:check`. Not verified: any real statement.
- Next: #31 (statement chaining; Opus designs).

### 2026-11-20 — Strengthen the ship-task workflow (ADR-024)

- `ship-task` gained: intended-behaviour list, fast-check property tests for invariants, UI screenshot evidence, doubt pass for `reconcile.ts` and `parse/`, per-PR outcome tracking and a sequential-until-five-clean-PRs line. `skill-selection.md` policy 2 requires the routed security and UI skills; the PR template has "Skills used" and "Evidence". Docs and config only.
- Verified: `npm run verify`, see the PR. Skill names confirmed on disk. Not verified: the new steps on a real task (first use is the next PR).

### 2026-11-20 — UI accepts PDF statements (#28)

- The importer takes PDFs and CSVs. A PDF goes `extractPdf → normalize → detect → parse → reconcile` (`src/ui/readPdf.ts`); pdf.js and its worker load on the first PDF only, from our own origin (`GlobalWorkerOptions.workerSrc` set from a Vite `?url` import). An unknown PDF shows "unsupported format" as an alert. Status text names the method when verified and the page and line for a PDF mismatch. Ledger (owner's choice): a verified PDF replaces the CSV rows of the same account kind dated inside its period; an unverified PDF replaces nothing.
- Verified: typecheck, lint, `npm test` (456 tests), build, and `npm run e2e` (8 tests, 3 new: a synthetic TD PDF verifies under the built CSP with no cross-origin request; unknown PDF; CSV plus PDF not double-counted). A probe confirmed pdf.js runs in a real worker (`/assets/pdf.worker.min-*.mjs`), with no console errors, and that the 500 kB pdf.js chunk is not fetched on page load.
- Not verified: a real statement (owner checks M6's "Verified" criterion on his machine).

### 2026-11-20 — Small review findings (#30)

- Parse: no code change. A dated row that loses its amount but keeps its balance is already `mismatch` (checkpoint and printed-totals checks); a new warning would make multi-page statements with a balance-forward row unverifiable (ADR-020), so a test pins `mismatch` instead. Trailing-minus and CR amounts stay unplaceable text that fails the row closed (existing `stray` rule, ADR-020 fail-closed); four tests pin it, no ADR. Census CLI: the input file's own real path is checked against the repository and read errors print a fixed reason, no path (`readInput`, 3 tests). Census output labels the readable share an upper bound. PRD FR-16 and FR-18 reworded; FR-17 waits for ADR-021 acceptance.
- Verified: typecheck, `npm test` (449 tests, 23 files, core line coverage 100%), build, `fixtures:check` pass. Lint passes on tracked files.
- Not verified: the census CLI against a real PDF (owner runs it).
- Next: #28.

### 2026-11-20 — Skill routing page (ADR-023)

- Added `.claude/rules/skill-selection.md` (task to skill table, manual-only, not-used with reasons, review agents) and ADR-023; `CLAUDE.md` points to it. Every skill name was checked as a `SKILL.md` on disk under the cached plugin directories (`agent-skills` 0.6.13, `ecc` 2.0.0-rc.1) on 2026-11-20.
- Not verified: that a session actually follows the page; `ecc:e2e-testing` was read, not run.

### 2026-11-20 — Prose rules become checks (ADR-022)

- Added Biome rules for skipped tests, network and browser-storage globals, `Date` in `src/core/` (not tests), `useEffect`/`useLayoutEffect`, timers, and `profiles/` imports in `reconcile.ts`; a 90% line-coverage gate on `src/core/**` inside `npm test`. Fixed `ship-task` step 10 to merge with `--match-head-commit`. No existing violations. Core coverage today: 100% lines, 99.49% statements, 93.18% branches.
- Gap: `parse/parse.ts` type-imports `BankProfile` from `profiles/`, and Biome cannot exempt type imports, so the NFR-6 rule covers `reconcile.ts` only. Open for the owner.

### 2026-11-20 — Status sync, issues and model routing

- Re-checked the state against `git log origin/main` (PRs #24 to #26 merged, #27 open) and the issue list, rewrote "State on 2026-11-20", the next-steps list, the M5 and M6 table rows, the AC-1 and AC-2 evidence, the risk rows and the `gh` tooling note, and added "Issues and model routing". The memory file and the cross-project ledger were updated outside the repository.
- Created labels (`M2` to `M7`, `model:*`, `owner-blocked`, `chore`, `docs`) and issues #28 to #38, one per next step; nine routing agents (one per task, Sonnet) returned a recommendation, confidence, reason, fallback and cheaper sub-parts, copied into each issue.
- Routing outcome: Sonnet for #28, #29, #30, #33, #34, #36, #37; Opus first, then Sonnet, for #31 and #35 (semantics of balances, false-verified risk); Opus for #32 (licence and design decision). No task needs Fable. Haiku only for mechanical sub-parts.
- Verified: issue numbers and labels from the `gh` output; test count from the last `npm test` on `main`. Not verified: any behaviour on a real statement.

### 2026-11-20 — ADR-021 proposed: transaction readout reframe

- Wrote ADR-021 (Proposed), PRD §1a with persona P4 and FR-16 to FR-18, a pointer in ROADMAP M2 and ARCHITECTURE §6.7, and the "Direction under discussion" paragraph above. Decided: a rule-based decoder with behaviour hints and user labels, unknown stays unknown, no runtime LLM, no model trained from scratch (no labelled data). Position: verified numbers that stay on the device, not better explanations than a chatbot. Not decided: the brand list (none found or licence-checked yet), the bank-code meanings (unverified), whether a small embedded model is ever worth it.
- Docs only. Verified: `npx biome check`. Not verified: any claim about how real descriptions look; the census is the first measurement.
- Next: the owner runs the census; M6 task 6 (UI accepts PDFs).

### 2026-11-20 — Description census tool

- Context: the owner wants the app to help read transaction descriptions he does not recognise. Discussed, not decided: a rule-based decoder (processor prefixes, bank-code suffixes, fuzzy match to a public brand list, behaviour hints, labels the user sets once), no model trained from scratch, because there is no labelled data and ADR-013 forbids a runtime LLM. Chatbots can read a statement too, so the claim to keep is verified numbers that never leave the device. No ADR or PRD change yet; ADR-021 waits for the census numbers.
- Added `tools/descriptionCensus.ts` (`classify`, `census`, `formatCensus`: counts by class, never a description), its test, and `tools/description-census.ts` with `npm run census`. Stacked on `m6/03-td-profile` (PR #25, merged afterwards by the owner because `gh` failed with the TLS error), because it uses `parse` and `detect`.
- Verified: unit tests (9); the CLI on a generated statement in a temp folder (counts printed, no text); it refuses an input inside the repository. Not verified: anything on a real statement. The processor-prefix list is hand-written and unverified.
- Next: the owner runs the census; then ADR-021 and the PRD change; M6 task 6 (UI accepts PDFs).

### 2026-11-17 — M6 task 4: TD profile, detect, parse, synthetic generator

- Added `src/core/profiles/` (`BankProfile` type, `tdChequing`, registry), `src/core/detect.ts` (the first profile whose markers all match a line; no match is `null`, the unsupported-format path), `src/core/parse/parse.ts` and `tools/makeTdStatement.ts` (a synthetic statement with the dump's geometry: right edges 306.4, 405.5 and 534.4, centred header labels, `SEP02`-style dates, a balance on the last row of each day, a total row drawn twice, a fees block, a repeated header on page 2, a description continuation line). `hash53` is now exported from `toStatement.ts` and reused for the statement id.
- `parse` follows ADR-020: spans from each amount label's left edge, each amount assigned by its right edge, items left of the first amount label are description, a page fails closed with a warning when the right edges of one column differ by more than 1 point, a dated page with no header warns, a second total row warns and drops the printed totals, the body ends at the total row (or the last line with an amount), the opening balance is the first balance-only row, the year comes from the period (December to January handled).
- Tests (`src/pdf/tdStatement.test.ts`, 18, invented data, through `extractPdf`, `normalize`, `detect`, `parse`, `reconcile`): exact golden transactions and `verified` by checkpoints; every row removed and every amount altered by a cent gives `mismatch`; an altered printed total gives `mismatch`; a lost last page or total row gives `unverifiable`; the fees block is not read; an unknown PDF is not detected. Mutation check of the code: a 1000-point tolerance fails the alignment test, removing the several-totals guard fails its test.
- Detection is by structure (the five labels, a period, a starting balance), not by a bank name, because the dump masks names. It is the first thing to check against a second real statement.
- Limits: a description continuation line at the very bottom of a page with no total row, after the last amount, is cut by the body rule (description only; amounts and reconciliation are unaffected). Dates must be English month names. Not yet done: the property test (random ledger to statement to parse), three or more fixtures of this format (needs the owner's reviewed dumps), and anything on a real statement.
- Review round 1 of PR #25 (opus, REQUEST_CHANGES, fixed): the description was the items whose right edge was left of the first amount label, so a description wider than about 193 points was dropped with no warning and the row still verified (centred labels sit about 44 points left of the amounts); it is now the non-amount items that start left of that label. Also: text in the amount area that is not a placed amount or a row date (for example a trailing-minus amount) and a dated row with no amount now add warnings; tests added for those, for an unreadable total row, a date outside the period, no period and no transactions. Known deviation from ADR-020, left as is: a page with no table header warns only when it holds a date-shaped item, because a real statement may end with a fees or summary page that is not a table page.
- Review nits from PR #24 folded in: the running-balance JSDoc moved onto `reconcileRunningBalance`; ADR-020 now says the date-order check applies only when some row has a balance.
- Verified: `npm run typecheck`, `npx biome check src tools docs e2e`, `npm test` (431 passed), `npm run fixtures:check`, `npm run build`. Not verified: behaviour on a real statement. `npx biome check` over the whole tree also reports the owner's untracked `.agents/` and `.codex/` files (formatting), which are not in the repository.
- Next: M6 task 6, the UI accepts PDFs.

### 2026-11-14 — M6 task 3: reconcile checkpoints and totals (ADR-020)

- `src/core/reconcile.ts`: `reconcile` now routes by input: a CSV statement goes to the unchanged running-balance code, a PDF statement to `reconcileAnchored`. `reconcileAnchored` follows ADR-020: the opening balance and each printed balance are checkpoints and the rows of a segment (up to and including the checkpoint row) must sum to the difference; then the printed totals and the closing balance are checked against the rows; `verified` needs at least one such anchor, every anchor in `requiredAnchors`, dates that do not go backwards (when row balances exist), and no warnings. Method is `checkpoints` when some row has a balance, `totals` when none has. A mismatch names the checkpoint row (`firstBadSource`) and wins over warnings. No opening balance, no anchor, a missing required anchor, backwards dates or a warning give `unverifiable`.
- Types: `ParsedStatement.printedTotals` and `requiredAnchors`; `Reconciliation` method `checkpoints` and `firstBadSource`.
- Tests (`src/core/reconcileAnchored.test.ts`, 63 tests, invented data, four days and eleven rows): every row removed, altered by a cent, or added at every position is a `mismatch` (AC-2); the first row is covered by the opening balance; a statement with its last day cut off is a `mismatch` with printed totals or a closing balance and `unverifiable` with neither; each anchor fails on its own by one cent; credit sign; rows after the last printed balance; totals method; the stated limit (two amounts swapped within a day stay verified) is pinned.
- Mutation check of the code itself: removing the end-anchor requirement fails 4 tests, removing the checkpoint comparison fails 1 (the anchors catch the rest, the checkpoint adds the pinpoint), sending PDF statements through running-balance fails 55.
- The round-trip with a real statement is not done: the profile and parser come next, so nothing here has run on a real statement. Coverage of `reconcile.ts`: 100% lines, 95.6% branches.
- Verified: `npm run typecheck`, `npx biome check`, `npm test` (413 passed), `npm run fixtures:check`, `npm run build`. Not verified: behaviour on a real statement.
- Next: the TD profile, `detect` and `parse` with the synthetic generator (M6 task 4).

### 2026-11-14 — ADR-020: checkpoint and totals reconciliation, amount columns from the amounts

- The owner asked Claude to proceed with the design while the other pages of the dump are still to come. Added ADR-020 (Accepted): a `checkpoints` method in `reconcile` for statements that print a balance on some rows only (the opening balance and each printed balance are checkpoints; the rows of a segment must sum to the difference), an end anchor that does not come from the rows (printed totals or closing balance) required before `verified`, and amount columns found from spans that start at each amount label's left edge and contain the right edges of the amounts. Updated ARCHITECTURE §6.4 and §6.5, ROADMAP M6 task 3, and the DECISIONS index.
- Stated limit: errors that cancel within one day (two amounts swapped between rows of the same day) are not detected.
- Review round 1 (opus, REQUEST_CHANGES, fixed): the rule "every available check passes" let a missing end anchor turn a failing check into a skipped one, so a statement cut short at a day boundary (a last page the parser skipped) could be verified; now `verified` needs an anchor that does not come from the rows (printed totals or closing balance), the profile declares the anchors it requires, and any warning gives `unverifiable`. Also: the net-movement check no longer applies when rows follow the last balance; the stated limits now include wrong description pairing, a charge and its reversal both dropped, and wrong dates; the column rule uses spans from each label's left edge (so a withdrawals-only page is fine and the table body ends at the total row); balance-only rows are not transactions; the method is chosen from the data, and ARCHITECTURE §6.4 and §6.5 agree.
- Review round 2 (opus, REQUEST_CHANGES, fixed in the next commit): a statement whose every row carries a balance was sent to `running-balance`, which reads no anchors and skips the first row, reopening the truncation hole; now `checkpoints` is used whenever an opening balance is present. Also: exactly one total row per statement; closing balance and totals must come from a labelled line; a page without a recognised header between table pages is a dropped page with a warning; the body ends at the last line with an amount; items left of the first amount label are description text; a later balance-only row is ignored. Round 3 (the owner allowed it, REQUEST_CHANGES, fixed in the next commit): the selection rule contradicted the "Totals alone" and checkpoint bullets and let a PDF with a balance on every row and no parsed opening balance reach `running-balance`; now one ordered rule (PDF with opening balance and a row balance: `checkpoints`; with opening balance and none: `totals`; CSV with every balance: `running-balance`; anything else: `unverifiable`), `running-balance` is CSV only. Also: the opening balance is a balance-only row before any transaction, §6.4 row assembly agrees, and the stale "Next" lines here are fixed.
- **Real amount removed:** an earlier entry in this file (PR #22) quoted a total from the owner's statement. It is replaced in this PR, and the PR description was edited. It remains in git history, which is not rewritten; the owner can decide whether that matters.
- Docs only. Verified: `npx biome check` on the docs; the span rule was checked by hand against the dump (each amount column's right edges fall in exactly one span). Not verified: that pages 2 to 4 and the CIBC statement fit this method (the ADR says to revisit if not).
- Next: the `reconcile` PR, see "Next session".

### 2026-11-14 — First real dump (TD chequing): findings and the overdraw fix

- The owner ran `pdf:dump` on two TD chequing statements (4 pages and 2 pages) and shared page 1 of the first as a text table. Both PDFs have a text layer, no font lacks a Unicode map, no deny-list entry survived, and the mask held: names and addresses came out as shapes only. Only shapes, positions, dates, amounts and labels were seen; none of them is recorded here. Figures below are layout geometry, not personal data.
- **Geometry on page 1 (points, top-left origin, page 612 x 792):** text height 8.5 in the table; description text starts at x 69.1 and the merchant suffix (`_V`, `_M`) is a separate item about 7 to the right; amounts are right-aligned, with right edges at 306.4 (withdrawals), 405.5 (deposits) and 534.4 (balance) to within 0.1; the date is left-aligned near x 417.5 (`SEP01`); row pitch is 9.5, and every item of a row shares the same y. Header labels are centred over their columns, not right-aligned with the amounts, so matching amounts to a header by its right edge fails; the amount columns have to be found from the amounts themselves (three clusters of right edges, taken left to right in the order of the header labels) and the parse must fail closed if the cluster count differs from the header count.
- **Bug found and fixed in `normalize`:** the total row is drawn twice (0.65 apart vertically, up to 0.2 apart horizontally), so the old merge produced `TotalTotal` and each total amount printed twice in a row, a doubled amount. `normalize` now drops an item that repeats an earlier item's text within 0.25 of the text height both ways, and no longer merges fragments that overlap by more than 0.2 of the height (it kept them concatenated before). Tests use the dump's offsets with invented amounts, and pin the 0.2 threshold on both sides.
- **Checked by hand against the dump (arithmetic only):** at every printed balance (start, then the last row of each day), the previous balance plus deposits minus withdrawals of the rows between equals it, and opening plus total deposits minus total withdrawals equals the last balance and matches the total row. So the checkpoint and totals methods described in the entry below are expected to verify this layout. The total row is on page 1 (the table ends there); what pages 2 to 4 hold (more rows, or something else) is unknown until their dumps are read.
- Not done: the parser (M6), the reconcile checkpoint and totals methods and their ADR, synthetic fixtures with this geometry, the CIBC dump, pages 2 to 4.
- Verified: `npx vitest run src/core/normalize src/pdf` (the overdraw tests failed before the change and reproduced the doubled text); full gate results in the PR.

### 2026-11-14 — Mask keeps statement periods and totals labels; TD layout facts

- The owner showed one page of a TD chequing statement in the chat (image; nothing from it is stored here). Two things in it would have broken the dump: the statement period (`JAN 05/25 - FEB 04/25`, the only place the year appears) was masked to digits, and `STARTING BALANCE` and `Total` were masked to shapes. `tools/pdfMask.ts` now keeps a period made of exactly two dates joined by a dash or "to", and the labels `starting balance`, `ending balance` and `total`.
- **Layout facts for the TD profile (M6), no values recorded:** columns left to right are Description, Withdrawals, Deposits, Date, Balance; row dates are month plus day with no space and no year (`JAN05`), so the year comes from the period in the header; the first row is a starting balance with a date and a balance; **a balance is printed only on the last row of each day, not on every row**; the table ends with a total row holding total withdrawals and total deposits; the statement has several pages ("Page 1 of 4"); a fees and summary block follows the table; rows are shaded alternately.
- **Consequence for reconcile:** the current `running-balance` method returns `unverifiable` when any row has no balance, so it cannot verify this layout. M6 needs the `totals` method (opening balance plus deposits minus withdrawals equals the closing balance, and the printed total row equals the sums) and a checkpoint check at each printed balance (balance at a checkpoint equals the previous checkpoint plus the rows between). On the page shown, opening plus deposits minus withdrawals equals the last printed balance, so the totals method is expected to work. To be confirmed on the real dump; decide it in an ADR when M6 starts.
- Backlog from the `normalize` review (non-blocking, check on the real dump): the line tolerance uses only the first item's height (a small superscript can split a line, a large heading can absorb a nearby small line); overlapping items merge into duplicated text (bold drawn twice would give `TOTALTOTAL`, which could double an amount, so fail closed or drop exact duplicates); no test pins the 0.2 merge threshold; vertical text is not handled.
- Verified: `npx vitest run tools/pdfMask.test.ts` (13 passed, the new cases failed before the change); full gate results in the PR. Not verified: anything on the real dump.

### 2026-11-14 — M5 task 2: normalize

- Added `src/core/normalize/normalize.ts` (`normalize(RawDocument) -> LineDocument`) and the `Line` and `LineDocument` types. Items are grouped into a line when their baselines differ by less than half the text height; lines run top to bottom per page, items left to right; fragments closer than 0.2 of the text height merge into one item (a glyph drawn on its own becomes a word), wider gaps stay separate items so columns survive; whitespace-only items are dropped; the line text joins items with single spaces.
- Tests: 11 unit tests on invented items, and `src/pdf/roundtrip.test.ts` (M5 acceptance): a generated two-page statement-like PDF goes through `extractPdf` and `normalize`, and the rows come back as the same lines in order, with the columns at their generated x positions.
- The thresholds (0.5 and 0.2 of the text height) are chosen from standard Helvetica metrics, not from a real statement. They are the first thing to check against the first reviewed dump; a real layout may need different values or a per-profile override.
- Not done: M5 task 3 (full synthetic statement PDFs with multi-line descriptions and several accounts' layouts) and task 5 (the first real dump, which only the owner can produce: see "Waiting on the owner").
- Verified: see the PR for result lines. Not verified: anything on a real statement.
- Next: M5 task 3, then the owner's dump decides the TD profile (M6).

### 2026-11-14 — M5 tasks 1 and 4: PDF extraction and the layout dump

- Added `pdfjs-dist` 6.5.438 (exact pin; `npm view` 2026-11-14: Apache-2.0, engines node >=22.13 or >=24; already in `approved-deps.json`; RESEARCH §5 row added). Added `RawItem`, `RawPage`, `RawDocument` to `src/core/types.ts`; `src/pdf/extract.ts` (`extractPdf(bytes)` returns `{ ok, doc }` or a reason made of the error class name only; top-left coordinates; legacy build, which runs in Node); `tools/pdfMask.ts` (`maskRun`, `maskDocument`, `deniedCount`); `tools/pdf-dump.ts` with `npm run pdf:dump`; `tools/makePdf.ts` (in-memory test PDFs, nothing written to disk).
- Masking: amounts, dates and a short list of column labels are kept; every other run keeps its shape (letter case, digit count, punctuation) and loses its characters; the PDF title is masked, producer and creator are kept. The CLI refuses inputs, outputs and deny-lists inside the repository, refuses to overwrite, fails if a deny-list entry survives masking, and fails on a PDF with no text layer. Output is mode 600 next to the input.
- Finding from the tests: pdf.js emits whitespace-only items at line ends. They are kept (`normalize` needs the gaps) and show up in the dump as `" "`.
- Verified: unit tests for the mask and for extraction on generated PDFs (positions, metadata, empty page, input bytes untouched, non-PDF fails closed); `pdf:dump` run on a synthetic PDF in a temp folder (mask output as expected, planted deny entry caught, output inside the repo refused). Not verified: anything on a real statement; whether real PDFs have a text layer.
- Limit: dates and amounts stay readable in the dump by design; the owner must read it before sharing.
- Review round 1 (opus and security reviewer, REQUEST_CHANGES, fixed): (1) coordinates ignored `/Rotate` and a page box not at 0,0 (now `viewport.convertToViewportPoint`, tests for both); (2) the mask left punctuation, symbols and private-use characters, and a font with no Unicode map turned a name into a readable substitution of those characters (now every character except whitespace, letters, digits and `.,-/$()%:#&` becomes `_`, and `pdf:dump` refuses a PDF whose text holds control, private-use or U+FFFD characters); (3) the output could follow a dangling symlink into the repository (now `wx` write, tested by hand: refused, nothing created); (4) producer and creator are kept only if they look like software names; (5) unknown flags such as a mistyped `--deny-list` are refused; a missing output folder and a missing deny-list are reported.
- **Resolved (F4, owner delegated the choice, 2026-11-14):** `pdfjs-dist` loads the optional native package `@napi-rs/canvas` 1.1.1 (MIT, lockfile-pinned with integrity hash, from registry.npmjs.org) when imported in Node. Accepted as a transitive dependency of an approved package: `npm ci --omit=optional` is not an option because it would also drop the native binaries of vite, esbuild and Biome. `pdf:dump` was run with `node_modules/@napi-rs` moved aside and works, so an owner who wants the process that reads a real PDF to run no native add-on can delete that folder first.
- Residual leak, accepted unless the owner decides otherwise: word lengths and letter case of names and merchants survive in the mask, and a font whose glyph codes avoid control characters could still give a substitution cipher. Read the dump before sharing.

### 2026-11-14 — Re-scope: PDF first (ADR-019)

- **Scope changed.** The owner found that TD chequing and CIBC credit card offer PDF statements only, so the CSV-first plan (ADR-018) cannot serve his own accounts. Added ADR-019: PDF first (M5, M6, M7), then M2 to M4; the CSV pipeline stays with no new work; real-CSV fixtures dropped from AC-3 (PRD v0.3, ROADMAP, this file updated). ADR-016 is unchanged: real PDFs are never read by Claude; the layout reaches it only through a masked dump the owner runs.
- The owner edited `CLAUDE.md` locally to remove the "never read statements" rule; that edit is not part of this change, and the guard hook and sandbox still block those paths. Changing them needs an owner-made change and its own ADR.
- Verified: docs-only change, `npm run verify` result in the PR. Not verified: that the PDFs have a text layer (the first dump will show it).
- Review of PR #18: round 1 (REQUEST_CHANGES, fixed): stale CSV and M4-gate wording in ROADMAP and PROGRESS. Round 2 (REQUEST_CHANGES, fixed in the next commit): M6 "remains CSV-only" fallback, PRD "after the launch gate" heading, A8/A9 and the M4 "Done when" wording. Two rounds with blocking findings, so the PR is left open for the owner's decision on a third round.
- Next: `src/pdf/extract.ts` and `tools/pdf-dump.ts` in a separate PR.

### 2026-11-11 — M1 tasks 8 and 9: fixture tools

- Added `tools/redact.ts` (`redactCsv`), `tools/fixture-dump.ts` (CLI), `tools/fixtureRules.ts` (`checkFiles`) and `tools/check-fixtures.ts` (CLI), with `npm run fixture:dump` and `npm run fixtures:check`; `fixtures:check` is now part of `npm run verify`, so CI runs it. Both CLIs are bundled by `vite build --ssr` into the git-ignored `.tooling/` and run by Node, so no new runner dependency. Added `@types/node` 26.6.6 as a direct dev dependency (already in the lockfile and in `approved-deps.json`; `npm view` on 2026-11-11: latest, MIT) and `"node"` to `tsconfig` types.
- Redaction keeps the header labels (digit runs masked), dates, amounts and balances; replaces each distinct description with `MERCHANT_nn` through a map that persists between files (kept outside the repository, mode 600, so the same merchant has the same placeholder in every file); blanks every other column. It fails closed: a low-confidence mapping, free text in a date or amount column, or a result that reads back with a different mapping all refuse the file. `--description <n>` lets the owner name the merchant column after looking at the file.
- Checks (`fixtures:check`): no PDF outside `fixtures/synthetic/`, no run of nine or more digits, optional owner deny-list. Output is file, line and rule only, never the matched text. `fixture:dump` runs the same rules on its own output and deletes it if one fails.
- Review round 1 (opus, REQUEST_CHANGES, fixed): the source header row was copied verbatim, so a first row holding a name survived (now canonical labels are written); `--map` and `--deny-list` were not checked to be absolute and outside the repo (now both are, with `realpathSync` and a case-insensitive `isInside` in `tools/paths.ts`); the PDF rule only covered `fixtures/` (now `git ls-files '*.pdf'` is checked repo-wide, with `fixtures/synthetic/` and `src/demo/` allowed); a malformed merchant map is refused. Round 2 (blocking, fixed): the git pathspec was case-sensitive, so `statement.PDF` outside `fixtures/` passed; it is now `:(icase)*.pdf` (checked by hand with a force-added `docs/zz.PDF`; the git call itself has no unit test). Also: a malformed merchant map no longer prints a snippet, and the low-confidence refusal prints only the column count. Round 3 (blocking, fixed with the owner's go-ahead past the two-round limit): `.tooling/` (the build output of `fixtures:check` and `fixture:dump`) was not excluded from Biome, so a second `npm run verify` in the same tree failed lint; CI passed only because a fresh checkout has no `.tooling/`. Fixed with `"!.tooling"` in `biome.json`; `npm run verify` passes twice in a row. Round 4 review: APPROVE; merged as PR #16. Not covered by tests: the CLI wiring itself (overwrite refusal, the self-check that deletes its output).
- Verified: `npm run verify` passes; a throwaway synthetic file through both CLIs (redacted output as expected, planted digit run caught, input inside the repo refused). Not verified: anything on a real export.
- Limit: the output is always comma-delimited, whatever the input delimiter was. Merchant text that varies by store number gets a different placeholder per variant, so recurrence in redacted fixtures is weaker than in real data; the merchant normaliser (M2) will need hand-written realistic descriptors, as ARCHITECTURE section 6.7 already says.
- Next: the owner runs `fixture:dump` (see "Waiting on the owner").

### 2026-11-11 — M1 task 11: walking-skeleton UI

- Added `src/ui/analyze.ts` (read + map; a mapping goes to the user when it is low confidence or a lone signed amount has no balance), `src/ui/accounts.ts` (`summarize`: files grouped by account, one `buildLedger` per account, merged and date-sorted), `src/ui/Importer.tsx` (file picker and drop, confirm panel with date format and flip-sign, files table with status, transactions table, "how to verify nothing is uploaded" footer) and `e2e/import.spec.ts`. `App.tsx` renders the importer.
- Carried requirements met: files are grouped by account (user picks A to D per file, so two same-kind accounts no longer merge); a lone signed amount and any low mapping wait for confirmation; `unverifiable` and `mismatch` are shown with the reason or row; a non-transaction file gives "cannot read this file" in an alert, not an exception.
- Review round 1 (REQUEST_CHANGES, fixed): a signed amount with a balance went straight to "ready", so a card export showed a false Verified or a false mismatch and the flip control was unreachable; now every signed amount asks. The confirm panel labelled no columns and could not swap debit/credit; it now shows each column's role and has a swap. Confirmed files can now be adjusted or removed. Also fixed: duplicate ids from overlapping drops, a 10 MB file cap, duplicate React keys.
- Not done: no styling, no search, no CSV download, no sample-data button, no processing state (M3). Account letters are chosen by hand; nothing infers them.
- Verified: `npm run verify` passes (284 tests). Not verified locally: `npm run e2e` (sandbox blocks port binding); the CI `verify` job runs it.

### 2026-11-11 — End of session: status sync

- Brought this file to the real state: M1 tasks 1 to 7 and 10 are on `main` (PRs #5 to #12); added "Requirements carried into task 11 and later" and a backlog section; AC-1 to AC-3 marked Partial with evidence; the `gh` workaround recorded as a tooling note.
- Verified: `npm run verify` passes locally (269 tests) and CI `verify` was green on this PR. Memory and the cross-project ledger were updated outside the repository.
- Review (docs PR): one wrong pointer (page states are in ARCHITECTURE section 7, not 9) and five smaller points. All were fixed except a blank line in the owner list, which was left until the cleanup PR that followed.
- Cleanup PR (`chore/close-session-cleanup`): removed that blank line; made the synthetic "days above 12" test check every month; moved a success test out of the "fails closed" group in `mapColumns.test.ts`; pinned the blank-description behaviour in `toStatement.test.ts`.
- Next: M1 task 11 (UI), see "Next session".

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

### 2026-11-11 — M1 task 1: domain types, money, dates

- Added `src/core/types.ts` (the M1 subset of ARCHITECTURE §5), `money.ts` (`parseMoney` to integer cents without floats, bracketed and signed negatives, strict thousands grouping; `formatCents` via `Intl` en-CA CAD) and `plainDate.ts` (`parseDate` for the three `DateFormat`s with calendar validation; `daysBetween` by integer day numbers, no `Date`).
- Verified: `npm run verify` passes (114 tests); `src/core` line coverage 100%.
- Not decided: trailing-minus (`12.34-`) and `CR`/`DR` amounts are rejected for now; add them only if a real export shows them.
- Reviewer: APPROVE; fixed leading-zero thousands group (`0,001`), year 0000, and the `formatCents` comment. Open for task 3: `1,234` reads as thousands, so a decimal-comma export would misread by 1000x; `mapColumns` must not assume dot decimals silently.
- Next: M1 task 2 (`csv/read.ts`, PapaParse).

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
