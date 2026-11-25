# Roadmap

**Date:** 2026-11-10 (re-ordered the same day by ADR-018) · Scope and criteria come from `docs/PRD.md`; design from `docs/ARCHITECTURE.md`.

## Overview

**Re-ordered by ADR-019 (2026-11-14): PDF first for the owner's banks.** TD chequing and CIBC credit card offer statement PDFs only, so M1's code is done and the next milestones are M5, M6, then M2, M3, M4 (M7, CIBC, was dropped by ADR-028). The CSV pipeline stays on `main` but gets no new work. The target weeks in the table below predate this change and are stale; re-plan them when M5 starts. Where M2 to M4 below say "stage 1", read "after the PDF milestones".

The earlier order was CSV first, PDF second (ADR-018). Stage 1 ships a useful product that works with most banks. Stage 2 adds verified PDF parsing for the history and accounts that CSV exports do not reach.

| #   | Milestone                                                 | Stage | Effort  | Target week  | Depends on |
| --- | --------------------------------------------------------- | ----- | ------- | ------------ | ---------- |
| M0  | Validation gate and project bootstrap                     | —     | done    | Nov 10       | —          |
| M1  | CSV import, ledger, fixture tooling, walking skeleton     | 1     | 12–15 h | Nov 11–17    | M0         |
| M2  | Transaction decoder and recurring-charge detection        | 1     | 18–22 h | Nov 18–24    | M6         |
| M3  | Product UI, demo mode, exports, trust features            | 1     | 14–17 h | Nov 25–Dec 1 | M2         |
| M4  | Hardening, deployment, small launch, validation           | 1     | 8–10 h  | Dec 2–8      | M3         |
| M5  | PDF extraction, line model, PDF fixture tooling           | 2     | 10–12 h | Dec 9–15     | M1         |
| M6  | First PDF format (TD chequing) with reconciliation        | 2     | 14–16 h | Dec 16–23    | M5         |
| M7  | ~~Second PDF format (CIBC credit card)~~ dropped, ADR-028 | 2     | —       | —            | —          |

**Stage 1 total: 52–64 hours (M2 and M3 grew with ADR-021). Stage 2 total: 24–28 hours (M7 dropped, ADR-028).** The owner reported more than 20 hours a week (2026-11-10). The dates are estimates, and mid-December exams will likely stretch stage 2.

**Cut order if behind** (first cut first):

1. Calendar (`.ics`) export.
2. Firefox and WebKit end-to-end runs (keep Chromium).
3. Evidence drill-down polish in the UI.
4. (M7, the second PDF format, is dropped: ADR-028.)

**Never cut:** the verification status on every import, the privacy tests, demo mode. They are the project's reason to exist.

**Stage gate after M4.** Superseded for TD by ADR-019: M5 and M6 start now (M7 dropped, ADR-028). The validation in M4 still decides whether to support other banks.

**Resume checkpoint.** After M6 the repository shows the hardest technical part (verified PDF table extraction with tests). After M4 there is also a live product with real users' feedback.

## Global Definition of Done

A milestone is done only when all of these are true:

- [ ] Its acceptance criteria pass, with the evidence noted in `docs/PROGRESS.md`.
- [ ] `npm run typecheck`, `npm run lint`, `npm test` and `npm run build` pass locally and in CI.
- [ ] New logic in `src/core/` has tests; core coverage is at or above 90% of lines.
- [ ] No real statement or export data is in the repository; the fixture privacy check passes.
- [ ] Docs are updated: `docs/PROGRESS.md` always; `docs/DECISIONS.md` if a decision changed; `docs/RESEARCH.md` if a dependency was added.
- [ ] Work is merged to `main` in small commits with clear messages.

---

## M0 — Validation gate and project bootstrap (done 2026-11-10)

Scaffold, CSP placeholder, CI job `verify`, privacy probe, and the gate decision **go**. Target formats then: TD chequing and CIBC credit card (CIBC dropped later, ADR-028). Details are in `docs/PROGRESS.md`. One item stays open and does not block anything: the owner's test of existing tools (open question 5).

---

## M1 — CSV import, ledger, fixture tooling, walking skeleton

**Objective.** Turn a bank's CSV export into a clean, checked ledger, and see it in a browser.

**Dependencies.** M0. (Tasks 8 and 9 originally needed the owner's real CSV exports; ADR-019 dropped that, see below.)

**Tasks**

1. Domain types, `money.ts`, `plainDate.ts` with unit tests (date formats, negative and bracketed amounts, thousands separators).
2. `src/core/csv/read.ts`: CSV text → rows. PapaParse for parsing; handle a missing header row, a byte-order mark, quoted fields and trailing blank lines.
3. `src/core/csv/mapColumns.ts`: guess which column is the date, description, amount (or separate debit and credit), and balance. Return a mapping with a confidence, never a silent guess: a low-confidence mapping goes to the user for confirmation.
4. `src/core/csv/toStatement.ts`: rows plus a mapping → `ParsedStatement`. Sign convention from the mapping.
5. `reconcile.ts`, running-balance method: when the file has a balance column, every row must agree with the one before it. No balance column means `unverifiable`, shown as "Cannot verify: this file has no balances".
6. `ledger.ts`: merge files, remove duplicates from overlapping date ranges, report gaps.
7. `tools/make-synthetic.ts`: generate synthetic CSV exports in several layouts (with and without a header, one amount column or two, with and without balances) for tests and the demo.
8. `tools/fixture-dump.ts`: local CLI that reads a real CSV and writes a redacted fixture (stable merchant placeholders, masked digit runs, dates and amounts preserved). Run by the owner only.
9. Fixture privacy check script. In CI: no PDFs outside `fixtures/synthetic/`, no long digit runs in fixtures. Locally before committing: the same script also checks fixtures against a personal deny-list kept in `private/`.
10. Import-boundary rule: `src/core/` cannot import from `src/ui/`, `src/pdf/` or `pdfjs-dist`.
11. Walking-skeleton UI: drop a CSV, confirm the column mapping when asked, see a plain table and the verification status. No styling effort.

**Acceptance criteria**

- AC-1 and AC-2 hold for the synthetic CSV layouts.
- AC-3: synthetic CSV layouts only. The real TD and CIBC CSV fixtures were dropped by ADR-019 (both banks offer PDF only).
- A file that is not a transaction export yields a clear "cannot read this file" state, not an exception.

**Verification.** CI test report.

**Done when** the pipeline up to the ledger is tested on synthetic layouts. Met on 2026-11-13 (tasks 1 to 11 merged); the real-export criteria were dropped by ADR-019.

---

## M2 — Transaction decoder and recurring-charge detection

**Objective.** Say what each line probably is, or that it is unknown (ADR-021); find recurring charges in a ledger and explain each finding; total where the money went.

**Dependencies.** M6 (M7 was dropped, ADR-028); the ledger it reads is M1 code, fed by PDF statements.

**Tasks** (re-ordered by ADR-021, 2026-11-25: decoder first, then its evaluation, then recurring detection, which groups by the decoder's key)

1. Before reading any detector output, the owner writes down the subscriptions he believes he has (ground truth for AC-7).
2. `merchant/` types and cleaning rules: bank-code tail, processor prefix (FR-14), leading asterisk, glued amount, store numbers, reference codes, city and province; `merchantKey`. `bankCodes` field on the bank profile, empty for TD.
3. Brand table: a `tools/` script that filters the name-suggestion-index to Canada and a few shop kinds and writes `src/core/merchant/brands.ts` with the BSD notice; README credit; measure the added bundle size. A small hand-written alias table for online services, each entry with a public source.
4. Reading by precedence (label, brand, cleaned text, unknown) and user labels in core: apply by key, label-file parse and serialise, fail closed on a malformed file (FR-18 core part).
5. Behaviour hints per key: count, cadence bucket, amount stability, dates, verified flag.
6. Descriptor evaluation suite (AC-16): ≥ 100 invented descriptions in the census mix with expected readings, the printed correct/wrong/unknown report per source, and fast-check properties (order independence; hints never yield a name; no name on an expected-unknown line).
7. `recurring/`: grouping by `merchantKey`, cadence bucketing, consistency scoring, amount stability, price-change detection, confidence, next expected date, monthly and annual cost.
8. Annual cadence: two charges from the same merchant about a year apart are a confirmed annual series; a single large charge stays "possible". This needs 13 months or more of history, and the UI says so when the history is shorter.
9. Labelled scenario suite (≥ 30): fixed monthly, price increase, weekly, bi-weekly, annual, variable bills, groceries and coffee as negatives, refunds, missed month, duplicate merchants.
10. Precision and recall report printed by the test run.
11. Property tests: results do not depend on input order; no series from fewer than two occurrences.
12. Readout aggregation in core (FR-17, AC-17): totals by reading that partition the ledger to the cent, unknown as its own group, new this period, unusual against earlier lines, verification status carried through.

**Acceptance criteria**

- AC-6: precision ≥ 0.90 and recall ≥ 0.80 on the labelled suite.
- AC-7: at least 80% of the owner's hand-listed subscriptions are found in his own data.
- AC-16: the decoder meets its limits on the descriptor suite; AC-17 and AC-18 for the core parts (aggregation, labels).
- Every series exposes its evidence transactions.

**Verification.** Test output with the confusion matrix and the decoder report; the AC-7 result recorded as counts only.

**Done when** AC-6, AC-7 and AC-16 pass, or the shortfall and its cause are documented with a tuning plan.

---

## M3 — Product UI, demo mode, exports, trust features

**Objective.** Make it usable by someone who has never seen the code, and convincing to someone who is wary of giving a web page their bank data.

**Dependencies.** M2.

**Tasks**

ADR-021: the main results screen is the readout (FR-17): where the money went by decoded name, unknown lines as their own group, each reading with its source and behaviour hint, naming a line (FR-18) and label-file download and load. The recurring list is one section of it. Tasks already merged stay as they are; the readout screen, the label UI and AC-17 and AC-18's Playwright parts are added here and need the routed `frontend-ui-engineering` skill.

1. Empty, processing, results and error states; Subscriptions, Transactions and Files views.
2. "How to download your transactions" help: short steps per supported bank, written from the owner's own experience; generic steps for other banks.
3. Column-mapping confirmation screen for files the app is not sure about.
4. Demo mode with bundled synthetic exports that include clear subscriptions, one price increase and one annual charge.
5. Verification badges with plain-language explanations for each status.
6. `exportCsv.ts`: merged ledger as CSV. PapaParse for quoting; our own sanitiser for text fields; numeric fields untouched. Round-trip test.
7. Summary download (FR-13): the recurring list as CSV and as a printable page.
8. `exportIcs.ts` (FR-12): a calendar file with the next expected date of each recurring charge. Hand-written; no dependency.
9. "How to verify nothing is uploaded" panel; "Report a problem with my file" flow that builds a redacted fixture locally.
10. Dismiss a false positive for the session.
11. Keyboard access, focus states, non-colour status cues, basic responsive layout.
12. End-to-end tests: demo flow, upload flow with synthetic files, network assertions, offline run, timing, axe scan.

**Acceptance criteria**

- AC-4, AC-5, AC-8, AC-9, AC-10, AC-14; the UI parts of AC-17 and AC-18.
- No serious issues in the automated accessibility scan.
- A person unfamiliar with the project completes the demo flow unaided (one hallway test).

**Verification.** Playwright report; notes from the hallway test.

**Done when** the acceptance criteria pass in CI on Chromium at minimum.

---

## M4 — Hardening, deployment, small launch, validation

**Objective.** Ship stage 1 and find out whether real people find it useful.

**Dependencies.** M3.

**Tasks**

1. Deploy to Cloudflare Pages with the `_headers` file; verify headers with `curl -I`.
2. README: what and why, demo GIF, supported-files table, privacy verification steps, how it works, limitations, credits to prior art.
3. `CONTRIBUTING.md`: how to add a bank layout using redacted fixtures.
4. Re-verify every public claim about other products before publishing.
5. Dependency review: versions, licences, `npm audit`.
6. Small launch first: friends and classmates, then one community post written as "free, open source, nothing uploaded"; check each community's self-promotion rules first.
7. Validation (AC-15): at least five people outside the project try it on their own exports. Record for each: bank, whether the import worked, whether the recurring list was right, what they wanted next. No financial details.
8. Resume bullet and portfolio entry with the live link.

**Acceptance criteria**

- AC-11, AC-12 and AC-15.
- All stage 1 acceptance criteria pass on the deployed build.

**Verification.** Release checklist and the validation notes in `docs/PROGRESS.md`.

**Done when** the site is live and the validation result (support more banks, change scope, or stop) is recorded. PDF stage 2 already ran before M4 (ADR-019).

---

## M5 — PDF extraction, line model, PDF fixture tooling

**Objective.** Turn a PDF into a clean, positioned line model, and make it possible to create privacy-safe fixtures from real statements.

**Dependencies.** M1 (ADR-019 replaces the M4 stage gate); at least one real statement available locally, which only the owner reads.

**Tasks**

1. `src/pdf/extract.ts`: PDF bytes → `RawDocument` (metadata plus positioned items). Self-host the pdf.js worker; load it lazily.
2. `src/core/normalize/`: items → lines (tolerance by font height, fragment merging, ordering).
3. Extend `tools/make-synthetic.ts` to generate synthetic statement PDFs with known contents.
4. `tools/pdf-dump.ts` (new owner-run CLI, ADR-019; not an extension of `fixture-dump.ts`): real PDF → masked positioned-text JSON outside the repository. Turning a reviewed dump into a committed fixture comes after the first real dump.
5. Run the first real statement through extraction and the dump tool. Inspect the output by eye. Record quirks: fragmented or squashed text, hidden text, fonts, whether character maps or WebAssembly were needed.

**Acceptance criteria**

- A synthetic PDF round-trips: generated rows equal the lines recovered, in order.
- One redacted fixture from a real statement is committed, after manual review.
- The CSP question from `docs/RESEARCH.md` §8 is answered and the policy updated: is `connect-src 'none'` possible, and is `'wasm-unsafe-eval'` needed?
- Minimum supported browser versions are recorded.

**Verification.** Unit tests for `normalize`; the round-trip test; a short written note of real-PDF quirks in `docs/PROGRESS.md`.

**Done when** a real statement's text is available as a reviewed, redacted fixture and the pipeline up to `LineDocument` is tested.

---

## M6 — First PDF format (TD chequing) with reconciliation

**Objective.** Parse one real statement format end to end and prove it with reconciliation.

**Dependencies.** M5.

**Tasks**

1. Profile schema and registry; `detect.ts`.
2. `parse/`: header-anchored columns, right-edge amount matching, multi-line descriptions, date carry-forward, year inference, sign handling.
3. `reconcile.ts`: add the checkpoint and totals methods (ADR-020; `ParsedStatement.printedTotals`, method `checkpoints`) with mutation tests, then statement chaining. This is its own PR, before the profile.
4. First profile, written against the redacted fixtures. Collect three or more statements of this format as fixtures.
5. Golden tests and mutation tests. Property test: random ledger → synthetic `LineDocument` → parse → equal.
6. UI: accept PDFs as the main input (the existing CSV path stays for anyone who has a CSV); merge both into one ledger without double-counting the overlap.

**Acceptance criteria**

- AC-1 and AC-2 hold for the first PDF format (≥ 3 fixtures).
- An unknown PDF yields the "unsupported format" state, not an exception.
- Dropping a real statement in the local dev build shows a **Verified** status (checked by the owner on his own machine).

**Verification.** CI test report; a manual check by the owner recorded without statement contents.

**Done when** one PDF format is verified end to end. If no format reconciles by the end of this milestone, stop and revisit ADR-019 with the owner: the owner has no CSV to fall back on, so there is no automatic CSV-only fallback.

---

## M7 — Second PDF format (CIBC credit card): DROPPED (ADR-028, 2026-11-25)

The owner removed the CIBC credit card from the plan. Nothing below is scheduled. A second bank returns only through a new ADR. The notes are kept so the idea is not lost.

**Objective.** Prove that a bank format is data, not code.

**Dependencies.** M6.

**Tasks**

1. Second profile with ≥ 3 fixtures, golden and mutation tests.
2. Supported-files table and README updated.

**Acceptance criteria**

- AC-13 (one PDF format after ADR-028, three fixtures).
- The profile was added without modifying `parse/` or `reconcile.ts`. If it needed core changes, note what and why.

**Verification.** CI.

**Done when** (dropped, ADR-028) two PDF formats are verified.

---

## Post-MVP backlog (unordered)

More bank layouts through contributed fixtures · French-language files · offline PWA · dedicated worker for large batches · opt-in local persistence · password-protected PDFs · scanned PDFs (OCR) · OFX/QIF import and export · spending categories · a small published parser package for other developers.
