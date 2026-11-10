# Roadmap

**Date:** 2026-11-10 · Scope and criteria come from `docs/PRD.md`; design from `docs/ARCHITECTURE.md`.

## Overview

| #   | Milestone                                                | Effort  | Target week  | Depends on |
| --- | -------------------------------------------------------- | ------- | ------------ | ---------- |
| M0  | Validation gate and project bootstrap                    | 4–6 h   | Nov 10–13    | —          |
| M1  | Extraction, line model, fixture tooling                  | 10–12 h | Nov 14–20    | M0         |
| M2  | First statement format, reconciliation, walking skeleton | 14–16 h | Nov 21–27    | M1         |
| M3  | Recurring-charge detection                               | 12–15 h | Nov 28–Dec 4 | M2         |
| M4  | Second format, ledger merge, CSV export                  | 10–12 h | Dec 5–11     | M2         |
| M5  | Product UI, demo mode, trust features                    | 10–12 h | Dec 5–14     | M3, M4     |
| M6  | Hardening, deployment, launch                            | 6–8 h   | Dec 12–18    | M5         |

**Total: 66–81 hours.** That is four weeks only at about 20 hours a week. At 15 hours a week it is five to six weeks, and mid-December exams will likely push the launch. Plan on the honest number.

**Cut order if behind** (first cut first):

1. Second statement format (M4 keeps ledger merge and CSV only).
2. Firefox and WebKit end-to-end runs (keep Chromium).
3. Evidence drill-down polish in the UI.

**Never cut:** reconciliation, the privacy tests, demo mode. They are the project's reason to exist and its resume story.

**Fallback plan.** If by the end of M2 no real statement format reconciles, switch the input to bank CSV exports. The subscription finder (M3) and UI (M5) proceed unchanged, and PDF parsing becomes a follow-up.

**Resume checkpoint.** After M2 the repository already shows the hard part (verified PDF table extraction with tests). It can go on the resume as "in progress" then, with the live demo link added after M6.

## Global Definition of Done

A milestone is done only when all of these are true:

- [ ] Its acceptance criteria pass, with the evidence noted in `docs/PROGRESS.md`.
- [ ] `npm run typecheck`, `npm run lint`, `npm test` and `npm run build` pass locally and in CI.
- [ ] New logic in `src/core/` has tests; core coverage is at or above 90% of lines.
- [ ] No real statement data is in the repository; the fixture privacy check passes.
- [ ] Docs are updated: `docs/PROGRESS.md` always; `docs/DECISIONS.md` if a decision changed; `docs/RESEARCH.md` if a dependency was added.
- [ ] Work is merged to `main` in small commits with clear messages.

---

## M0 — Validation gate and project bootstrap

**Objective.** Confirm the project is viable before writing product code, and stand up an empty, fully tooled repository.

**Scope.** Decisions, checks and scaffolding only. No parsing code.

**Split.** M0a is the owner's tasks 1–3; it blocks M1, not the scaffold. M0b is tasks 4–8, done by Claude through pull requests (ADR-015).

**Tasks**

1. Bruce answers the PRD's open questions: banks and account types available, weekly hours, licence, name.
2. Bruce tries one of his own statements in existing tools (Digital ToolPad in the browser; StatementSensei if convenient) and records what each got right and wrong. Do not paste statement contents into any AI tool.
3. Check what CSV export the bank offers and how far back it goes (input for the fallback plan).
4. Scaffold: Vite + React + TypeScript (strict), Biome, Vitest, Playwright, Tailwind. Pin exact versions from `docs/RESEARCH.md` §5.
5. `.gitignore`, Claude Code deny rules, sandbox and guard hook: done in the bootstrap commit (ADR-015, ADR-016). M0b proves them with a probe (Read, `cat` and `node` all blocked on a dummy file in `private/`).
6. Add the CSP `<meta>` tag and a placeholder page.
7. CI workflow: typecheck, lint, test, build.
8. Add the licence file and a stub README.

**Acceptance criteria**

- Assumption A1 is confirmed, with two target formats named in `docs/PROGRESS.md`. **If it cannot be confirmed, stop and re-plan.**
- Results of the existing-tool test are written down.
- `npm run typecheck && npm run lint && npm test && npm run build` pass on a clean clone and in CI.
- `tsc --noEmit` works with TypeScript 7; if not, TypeScript is pinned to 6.0.x and ADR-012 is updated.

**Verification.** CI run link; a clean-clone check; the PROGRESS entry.

**Done when** the gate decision (go, go with changed scope, or stop) is recorded.

---

## M1 — Extraction, line model, fixture tooling

**Objective.** Turn a PDF into a clean, positioned line model, and make it possible to create privacy-safe fixtures from real statements.

**Dependencies.** M0; at least one real statement available locally.

**Tasks**

1. `src/pdf/extract.ts`: PDF bytes → `RawDocument` (metadata plus positioned items). Self-host the pdf.js worker; load it lazily.
2. `src/core/normalize/`: items → lines (tolerance by font height, fragment merging, ordering).
3. `tools/make-synthetic.ts`: generate synthetic statement PDFs with known contents for tests and the demo.
4. `tools/fixture-dump.ts`: local CLI that writes a redacted `input.json` (stable merchant placeholders, masked digit runs, dates and amounts preserved).
5. Run the first real statement through extraction and the dump tool. Inspect the output by eye. Record quirks: fragmented or squashed text, hidden text, fonts, whether character maps or WebAssembly were needed.
6. Fixture privacy check script. In CI: no PDFs outside `fixtures/synthetic/`, no long digit runs in fixtures. Locally before committing: the same script also checks fixtures against a personal deny-list (name, address, employer) kept in `private/`.
7. Import-boundary rule: `src/core/` cannot import `pdfjs-dist`, `src/pdf/` or `src/ui/`.

**Acceptance criteria**

- A synthetic PDF round-trips: generated rows equal the lines recovered, in order.
- One redacted fixture from a real statement is committed, after manual review.
- The CSP question from `docs/RESEARCH.md` §8 is answered and the policy updated: is `connect-src 'none'` possible, and is `'wasm-unsafe-eval'` needed?
- Minimum supported browser versions are recorded.

**Verification.** Unit tests for `normalize`; the round-trip test; the privacy check in CI; a short written note of real-PDF quirks in `docs/PROGRESS.md`.

**Done when** a real statement's text is available as a reviewed, redacted fixture and the pipeline up to `LineDocument` is tested.

---

## M2 — First statement format, reconciliation, walking skeleton

**Objective.** Parse one real statement format end to end, prove it with reconciliation, and see it in a browser.

**Dependencies.** M1.

**Tasks**

1. Domain types, `money.ts`, `plainDate.ts` with unit tests (including December–January rollover).
2. Profile schema and registry; `detect.ts`.
3. `parse/`: header-anchored columns, right-edge amount matching, multi-line descriptions, date carry-forward, year inference, sign handling.
4. `reconcile.ts`: running-balance and totals methods; statement chaining.
5. First profile, written against the redacted fixtures. Collect three or more statements of this format as fixtures.
6. Golden tests and mutation tests. Property test: random ledger → synthetic `LineDocument` → parse → equal.
7. Walking-skeleton UI: drop a file, see a plain table and the reconciliation status. No styling effort.
8. Ask two or three friends whether they would contribute redacted fixtures for other banks (assumption A4).

**Acceptance criteria**

- AC-1 and AC-2 hold for the first format (≥ 3 fixtures).
- An unknown PDF yields the "unsupported format" state, not an exception.
- Dropping a real statement in the local dev build shows a **Verified** status (checked by Bruce on his own machine).

**Verification.** CI test report; a manual check by Bruce recorded in PROGRESS without statement contents.

**Done when** one format is verified end to end. **Fallback trigger:** if no format reconciles by the end of this milestone, switch to the CSV-input plan.

---

## M3 — Recurring-charge detection

**Objective.** Find recurring charges in a ledger and explain each finding.

**Dependencies.** M2 (needs the `Transaction` type; does not need more bank formats).

**Tasks**

1. Before reading any detector output, Bruce writes down the subscriptions he believes he has (ground truth for AC-7).
2. `merchant/`: normalisation rules and alias table, tested against a hand-written list of realistic descriptors.
3. `recurring/`: grouping, cadence bucketing, consistency scoring, amount stability, price-change detection, confidence, next expected date, monthly and annual cost.
4. Labelled scenario suite (≥ 30): fixed monthly, price increase, weekly, bi-weekly, variable bills, groceries and coffee as negatives, refunds, one-off annual charge, missed month, duplicate merchants.
5. Precision and recall report printed by the test run.
6. Property tests: results do not depend on input order; no series from fewer than two occurrences.

**Acceptance criteria**

- AC-6: precision ≥ 0.90 and recall ≥ 0.80 on the labelled suite.
- AC-7: at least 80% of Bruce's hand-listed subscriptions are found in his own data.
- Every series exposes its evidence transactions.

**Verification.** Test output with the confusion matrix; the AC-7 result recorded as counts only.

**Done when** both criteria pass, or the shortfall and its cause are documented with a tuning plan.

---

## M4 — Second format, ledger merge, CSV export

**Objective.** Support a second statement type and produce a trustworthy merged export.

**Dependencies.** M2.

**Tasks**

1. Second profile (the other account type) with ≥ 3 fixtures, golden and mutation tests.
2. `ledger.ts`: merge, duplicate removal for overlapping periods, gap detection.
3. `exportCsv.ts`: PapaParse for quoting; our own sanitiser for text fields; numeric fields untouched.
4. Round-trip test: export → parse → identical ledger.

**Acceptance criteria**

- AC-3 (two formats, three fixtures each) and AC-8 (CSV round-trip and injection safety).
- A profile was added without modifying `parse/` or `reconcile.ts`. If it needed core changes, note what and why.

**Verification.** CI; a manual open of the CSV in Excel and Google Sheets.

**Done when** two formats are verified and the CSV opens cleanly in both spreadsheets.

---

## M5 — Product UI, demo mode, trust features

**Objective.** Make it usable by someone who has never seen the code, and convincing to someone who will not upload a statement.

**Dependencies.** M3, M4.

**Tasks**

1. Empty, processing, results and error states; Subscriptions, Transactions and Statements views.
2. Demo mode with bundled synthetic statements that include clear subscriptions and one price increase.
3. Reconciliation badges with plain-language explanations for each status.
4. "How to verify nothing is uploaded" panel; "Report a parsing problem" flow that builds a redacted fixture locally.
5. Dismiss a false positive for the session.
6. Keyboard access, focus states, non-colour status cues, basic responsive layout.
7. End-to-end tests: demo flow, upload flow with synthetic PDFs, network assertions, offline run, 12-statement timing, axe scan.

**Acceptance criteria**

- AC-4, AC-5, AC-9, AC-10.
- No serious issues in the automated accessibility scan.
- A person unfamiliar with the project completes the demo flow unaided (one hallway test).

**Verification.** Playwright report; notes from the hallway test.

**Done when** the acceptance criteria pass in CI on Chromium at minimum.

---

## M6 — Hardening, deployment, launch

**Objective.** Ship it, and make the repository speak for itself.

**Dependencies.** M5.

**Tasks**

1. Deploy to Cloudflare Pages with the `_headers` file; verify headers with `curl -I`.
2. README: what and why, demo GIF, supported-formats table, privacy verification steps, how it works, limitations, credits to prior art.
3. `CONTRIBUTING.md`: how to add a bank using redacted fixtures.
4. Re-verify every public claim about other products before publishing.
5. Dependency review: versions, licences, `npm audit`.
6. Launch posts, written as "free, open source, nothing uploaded" rather than as promotion; check each community's self-promotion rules first.
7. Resume bullet and portfolio entry with the live link.

**Acceptance criteria**

- AC-11 and AC-12.
- All PRD acceptance criteria pass on the deployed build.
- Launch posts published; feedback triage started.

**Verification.** Release checklist in `docs/PROGRESS.md` with the header output and links.

**Done when** the site is live and the launch checklist is complete.

---

## Post-MVP backlog (unordered)

More banks through contributed fixtures · bank CSV import · French-language statements · offline PWA · dedicated worker for large batches · opt-in local persistence · password-protected PDFs · annual-charge detection with longer history · OFX/QIF export · a small published parser package for other developers.
