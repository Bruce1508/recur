# Roadmap

**Date:** 2026-11-10 (re-ordered the same day by ADR-018) · Scope and criteria come from `docs/PRD.md`; design from `docs/ARCHITECTURE.md`.

## Overview

The order is CSV first, PDF second (ADR-018). Stage 1 ships a useful product that works with most banks. Stage 2 adds verified PDF parsing for the history and accounts that CSV exports do not reach.

| #   | Milestone                                             | Stage | Effort  | Target week  | Depends on |
| --- | ----------------------------------------------------- | ----- | ------- | ------------ | ---------- |
| M0  | Validation gate and project bootstrap                 | —     | done    | Nov 10       | —          |
| M1  | CSV import, ledger, fixture tooling, walking skeleton | 1     | 12–15 h | Nov 11–17    | M0         |
| M2  | Recurring-charge detection                            | 1     | 12–15 h | Nov 18–24    | M1         |
| M3  | Product UI, demo mode, exports, trust features        | 1     | 12–14 h | Nov 25–Dec 1 | M2         |
| M4  | Hardening, deployment, small launch, validation       | 1     | 8–10 h  | Dec 2–8      | M3         |
| M5  | PDF extraction, line model, PDF fixture tooling       | 2     | 10–12 h | Dec 9–15     | M4 gate    |
| M6  | First PDF format (TD chequing) with reconciliation    | 2     | 14–16 h | Dec 16–23    | M5         |
| M7  | Second PDF format (CIBC credit card)                  | 2     | 8–10 h  | Dec 24–30    | M6         |

**Stage 1 total: 44–54 hours. Stage 2 total: 32–38 hours.** The owner reported more than 20 hours a week (2026-11-10). The dates are estimates, and mid-December exams will likely stretch stage 2.

**Cut order if behind** (first cut first):

1. Calendar (`.ics`) export.
2. Firefox and WebKit end-to-end runs (keep Chromium).
3. Evidence drill-down polish in the UI.
4. The second PDF format (M7).

**Never cut:** the verification status on every import, the privacy tests, demo mode. They are the project's reason to exist.

**Stage gate after M4.** Stage 2 starts only after the validation in M4 is recorded. If the people who tried the product did not find it useful, re-plan before building PDF parsers.

**Resume checkpoint.** After M4 there is a live product with real users' feedback. After M6 the repository also shows the hardest technical part (verified PDF table extraction with tests).

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

Scaffold, CSP placeholder, CI job `verify`, privacy probe, and the gate decision **go**. Target formats: TD chequing and CIBC credit card. Details are in `docs/PROGRESS.md`. One item stays open and does not block anything: the owner's test of existing tools (open question 5).

---

## M1 — CSV import, ledger, fixture tooling, walking skeleton

**Objective.** Turn a bank's CSV export into a clean, checked ledger, and see it in a browser.

**Dependencies.** M0. For tasks 8 and 9: the owner's own CSV exports from TD and CIBC, saved in `~/Statements/`.

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

- AC-1 and AC-2 hold for the synthetic CSV layouts and for the redacted fixtures.
- AC-3: redacted fixtures from two real export layouts (TD and CIBC), at least two files each, committed after the owner's review.
- A file that is not a transaction export yields a clear "cannot read this file" state, not an exception.
- Dropping a real export in the local dev build shows the right row count and status (checked by the owner on his own machine; counts only in `docs/PROGRESS.md`).

**Verification.** CI test report; the owner's manual check recorded without file contents.

**Done when** two real export layouts import correctly and the pipeline up to the ledger is tested.

---

## M2 — Recurring-charge detection

**Objective.** Find recurring charges in a ledger and explain each finding.

**Dependencies.** M1.

**Tasks**

1. Before reading any detector output, the owner writes down the subscriptions he believes he has (ground truth for AC-7).
2. `merchant/`: normalisation rules and alias table, tested against a hand-written list of realistic descriptors. Mark descriptors that hide the real service (app-store and payment-processor charges) as ambiguous (FR-14).
3. `recurring/`: grouping, cadence bucketing, consistency scoring, amount stability, price-change detection, confidence, next expected date, monthly and annual cost.
4. Annual cadence: two charges from the same merchant about a year apart are a confirmed annual series; a single large charge stays "possible". This needs 13 months or more of history, and the UI says so when the history is shorter.
5. Labelled scenario suite (≥ 30): fixed monthly, price increase, weekly, bi-weekly, annual, variable bills, groceries and coffee as negatives, refunds, missed month, duplicate merchants.
6. Precision and recall report printed by the test run.
7. Property tests: results do not depend on input order; no series from fewer than two occurrences.

**Acceptance criteria**

- AC-6: precision ≥ 0.90 and recall ≥ 0.80 on the labelled suite.
- AC-7: at least 80% of the owner's hand-listed subscriptions are found in his own data.
- Every series exposes its evidence transactions.

**Verification.** Test output with the confusion matrix; the AC-7 result recorded as counts only.

**Done when** both criteria pass, or the shortfall and its cause are documented with a tuning plan.

---

## M3 — Product UI, demo mode, exports, trust features

**Objective.** Make it usable by someone who has never seen the code, and convincing to someone who is wary of giving a web page their bank data.

**Dependencies.** M2.

**Tasks**

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

- AC-4, AC-5, AC-8, AC-9, AC-10, AC-14.
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

**Done when** the site is live and the stage gate decision (continue to stage 2, change scope, or stop) is recorded.

---

## M5 — PDF extraction, line model, PDF fixture tooling

**Objective.** Turn a PDF into a clean, positioned line model, and make it possible to create privacy-safe fixtures from real statements.

**Dependencies.** The M4 stage gate; at least one real statement available locally.

**Tasks**

1. `src/pdf/extract.ts`: PDF bytes → `RawDocument` (metadata plus positioned items). Self-host the pdf.js worker; load it lazily.
2. `src/core/normalize/`: items → lines (tolerance by font height, fragment merging, ordering).
3. Extend `tools/make-synthetic.ts` to generate synthetic statement PDFs with known contents.
4. Extend `tools/fixture-dump.ts` to write a redacted positioned-text `input.json` from a real PDF.
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
3. `reconcile.ts`: add the totals method and statement chaining.
4. First profile, written against the redacted fixtures. Collect three or more statements of this format as fixtures.
5. Golden tests and mutation tests. Property test: random ledger → synthetic `LineDocument` → parse → equal.
6. UI: accept PDFs alongside CSVs; merge both into one ledger without double-counting the overlap.

**Acceptance criteria**

- AC-1 and AC-2 hold for the first PDF format (≥ 3 fixtures).
- An unknown PDF yields the "unsupported format" state, not an exception.
- Dropping a real statement in the local dev build shows a **Verified** status (checked by the owner on his own machine).

**Verification.** CI test report; a manual check by the owner recorded without statement contents.

**Done when** one PDF format is verified end to end. If no format reconciles by the end of this milestone, PDF support stays out and the product remains CSV-only.

---

## M7 — Second PDF format (CIBC credit card)

**Objective.** Prove that a bank format is data, not code.

**Dependencies.** M6.

**Tasks**

1. Second profile with ≥ 3 fixtures, golden and mutation tests.
2. Supported-files table and README updated.

**Acceptance criteria**

- AC-13 (two PDF formats, three fixtures each).
- The profile was added without modifying `parse/` or `reconcile.ts`. If it needed core changes, note what and why.

**Verification.** CI.

**Done when** two PDF formats are verified.

---

## Post-MVP backlog (unordered)

More bank layouts through contributed fixtures · French-language files · offline PWA · dedicated worker for large batches · opt-in local persistence · password-protected PDFs · scanned PDFs (OCR) · OFX/QIF import and export · spending categories · a small published parser package for other developers.
