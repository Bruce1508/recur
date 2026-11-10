# PRD — Recur (working name)

|             |                                                                                    |
| ----------- | ---------------------------------------------------------------------------------- |
| **Status**  | Draft v0.2 — re-scoped by ADR-018 (CSV first, PDF second)                          |
| **Owner**   | Bruce Vo                                                                           |
| **Date**    | 2026-11-10                                                                         |
| **Related** | `docs/RESEARCH.md`, `docs/ARCHITECTURE.md`, `docs/DECISIONS.md`, `docs/ROADMAP.md` |

"Recur" is a placeholder name. Rename freely before the first public commit.

## 1. Summary

A free, open-source web app that runs entirely in the browser. A user drops in the transaction file their Canadian bank lets them download (CSV first; PDF statements in stage 2) and gets two things: a list of recurring charges (subscriptions) with their yearly cost and price-change alerts, and one clean, merged CSV of every transaction. No bank login, no account, no upload. Every import is checked against the file's own balances where it has them, and the app says so plainly when an import cannot be verified.

The input order changed on 2026-11-10 (ADR-018): CSV import ships first because it works for most banks at once; verified PDF parsing follows for the history and accounts that CSV exports do not reach.

One-line pitch: _the "find my forgotten subscriptions" feature of Rocket Money, for Canadians, without handing over bank credentials._

## 2. Problem

1. Rocket Money, the best-known subscription finder, is US-only (carried over from the November 2026 gap analysis; re-verify before using it in public copy).
2. Canadian alternatives that detect subscriptions automatically require connecting a bank account through an aggregator. Many people will not do that.
3. Manual trackers do not find the subscriptions a user has forgotten, which is the whole point. The trackers that advertise "no bank link" are manual (`docs/RESEARCH.md` §12).
4. Open-source statement parsers that support Canadian banks exist, but they need Python and native libraries, or they run on a server that receives the PDF (see `docs/RESEARCH.md` §2).
5. Canada's consumer-driven banking framework had no confirmed launch date when checked on 2026-11-10, so automatic detection still means sharing bank credentials with an aggregator (`docs/RESEARCH.md` §12).

The gap: no tool found is (a) fully client-side, (b) usable with Canadian banks' own files, and (c) able to detect recurring charges automatically.

## 3. Users and use cases

| Persona                                                                            | Need                                                                          | Primary use case                                                                                                                     |
| ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| **P1 — Privacy-conscious Canadian** (student or early-career, Big-5 bank customer) | Find forgotten subscriptions without linking a bank                           | Downloads 12 months of transactions from online banking, drops the file in, reviews the recurring list, cancels what they do not use |
| **P2 — Spreadsheet budgeter / self-employed**                                      | Transactions as CSV for a spreadsheet or bookkeeping tool                     | Drops exports and statements from several accounts, downloads one merged CSV                                                         |
| **P3 — Evaluator** (recruiter, engineer, potential contributor)                    | Judge the project in under two minutes without owning a Canadian bank account | Clicks "Try with a sample statement", reads the README, skims the code                                                               |

P1 is the primary persona since ADR-018. P3 still matters: a recruiter, and a cautious first-time visitor, will not hand over their own file. A one-click demo with synthetic data is a requirement, not a nice-to-have.

## 4. Goals, non-goals and success metrics

**Goals (in priority order, changed by ADR-018)**

1. A product that is useful to the people who use it: someone with any Canadian bank can find their recurring charges in about a minute, at zero marginal cost.
2. A tool that is correct or says it is not. Wrong numbers presented confidently are the worst outcome for a finance tool.
3. A resume-grade project with one hard, explainable technical component: verified extraction of tabular financial data from PDFs, in the browser (stage 2).

**Non-goals**

- Budgeting, spending categories, net-worth tracking, bank connections.
- Cancelling subscriptions on the user's behalf.
- Any server, account system, or stored user data.
- Any LLM in the product path.
- Supporting every Canadian bank at launch.

**Success metrics** (measured 4 weeks after launch)

| Metric                                                   | Target | How measured                           |
| -------------------------------------------------------- | ------ | -------------------------------------- |
| Fixture corpus fully reconciled                          | 100%   | CI                                     |
| Outside testers who tried it on their own export (AC-15) | ≥ 5    | Validation notes in `docs/PROGRESS.md` |
| Of those testers, imports that worked without help       | ≥ 80%  | Same notes                             |
| Real export layouts backed by redacted fixtures          | ≥ 2    | Supported-files table                  |
| GitHub stars                                             | ≥ 25   | GitHub                                 |
| Fixtures or bug reports from people Bruce does not know  | ≥ 3    | GitHub issues                          |
| Resume bullet backed by a live demo URL                  | Yes    | —                                      |

The product has no telemetry by design (it would undercut the privacy claim), so usage cannot be measured directly. That is an accepted cost; see ADR-001.

## 5. Assumptions

| ID  | Assumption                                                                                                                                                              | Status                                                                                                                                   | How to validate                                           | If false                                                                            |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| A1  | Bruce can obtain ≥ 3 consecutive monthly PDF statements for at least one chequing account and one credit card at a Big-5 bank                                           | **Confirmed 2026-11-10: TD chequing + CIBC credit card**                                                                                 | Bruce checks his online banking                           | Start with whatever formats he has; if none, the project is not viable as specified |
| A2  | Statements are digital PDFs with a real text layer, not scans                                                                                                           | Unconfirmed                                                                                                                              | Select text in the PDF viewer                             | OCR is out of scope; those statements are unsupported                               |
| A3  | A bank's layout is stable enough that one profile covers at least 12 months of statements                                                                               | Unconfirmed; prior art warns that banks tweak formats                                                                                    | Parse statements from different months                    | Profiles need variants; more maintenance                                            |
| A4  | Friends will share redacted fixtures for other banks                                                                                                                    | Unconfirmed                                                                                                                              | Ask 2–3 people during M4                                  | Bank coverage stays at what Bruce owns                                              |
| A5  | No existing client-side tool already parses Canadian statements well                                                                                                    | Partly verified: two were inspected and neither supports Canadian banks. Digital ToolPad is closed-source and untested                   | M0: Bruce tries it on one of his own statements           | The differentiator narrows to the subscription finder; still viable                 |
| A6  | Three months of data is enough to detect monthly subscriptions                                                                                                          | Reasonable; matches the 3-occurrence approach in Actual Budget                                                                           | Labelled test suite in M3                                 | Require more statements; say so in the UI                                           |
| A7  | Bruce has roughly 15–20 hours a week for this through mid-December                                                                                                      | **Confirmed 2026-11-10: more than 20 hours a week**                                                                                      | Bruce confirms                                            | Timeline stretches; cut order is in `docs/ROADMAP.md`                               |
| A8  | Canadian banks let customers download transactions as CSV, with enough history (≥ 12 months) and enough columns (date, description, amount) to detect recurring charges | Partly confirmed: the owner's bank offers 12 months or more. Other banks unverified; one vendor guide says BMO has no full-statement CSV | M1 fixtures from TD and CIBC; M4 testers from other banks | Those banks need PDF support (stage 2) or stay unsupported                          |
| A9  | People are willing to download a file from online banking and drop it into a web page                                                                                   | Unconfirmed                                                                                                                              | M4 validation with ≥ 5 outside testers                    | Re-plan at the stage gate (ADR-018)                                                 |

## 6. Constraints

- **Budget:** $0. Static hosting only; no paid APIs.
- **Marginal cost per user:** ≈ $0. All computation happens on the user's device.
- **Team:** one developer, part-time.
- **Time:** stage 1 in about 4 weeks (≈ 44–54 hours); stage 2 about 3 more weeks (≈ 32–38 hours).
- **Privacy:** real statements are personal financial data. They never enter the repository, CI, or an AI assistant's context.
- **Legal:** bank names are used descriptively only, with no logos. The app gives no financial advice. This is not legal advice either; see ADR-006 for licensing.

## 7. Requirements challenged

| Original idea                          | Problem                                                                                                                                                                                                           | Decision                                                                                                                                                                  |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Support all five big banks in 4 weeks  | No committed sample statements exist anywhere to test against (even the leading open-source parser ships none for Canadian banks). Unverified parsers for five banks are worth less than verified parsers for two | **MVP = 2 verified formats.** More banks arrive through redacted fixtures after launch                                                                                    |
| Run all parsing in a custom Web Worker | pdf.js already parses PDFs in its own worker. Our own logic handles a few thousand text items in milliseconds (spike: 2 pages end-to-end in ~170 ms)                                                              | **No custom worker in MVP.** Add one only if measurement shows a problem                                                                                                  |
| Offline PWA at launch                  | Useful for trust, but not needed: once the page is loaded it already works with the network off                                                                                                                   | **Post-MVP**                                                                                                                                                              |
| Port the bank rules from monopoly      | AGPL-3.0, written for a different extraction model, and untested by fixtures for Canadian banks                                                                                                                   | **Independent implementation**; use it as a source of facts about formats (ADR-006)                                                                                       |
| PDFs as the only input                 | Collecting monthly PDFs is tedious for users                                                                                                                                                                      | **Changed by ADR-018: CSV import is the first input**, because it serves most banks at once. PDF parsing is stage 2                                                       |
| Detect all subscriptions               | Annual subscriptions cannot be detected from under 13 months of data                                                                                                                                              | **Weekly, bi-weekly and monthly are the measured targets.** Annual is confirmed when the history holds two charges about a year apart, and "possible" otherwise (ADR-018) |
| Measure user counts                    | Requires telemetry, which contradicts the trust model                                                                                                                                                             | **No telemetry**; proxy metrics in §4                                                                                                                                     |

## 8. MVP scope

**In**

**Stage 1 — the launch (M1–M4)**

- Drag-and-drop one or many CSV transaction exports, from any bank.
- Automatic column detection, with a confirmation screen when the app is not sure. Tested layouts: TD and CIBC exports.
- A verification status for every file: checked against its running balance where the file has one, labelled "Cannot verify" where it does not.
- Merged, de-duplicated ledger across files; CSV export.
- Recurring-charge detection with cadence (weekly to annual), typical amount, monthly and yearly cost, price-change flag, confidence, and the evidence rows.
- Clear labels on charges whose real service cannot be known from the description (app-store and payment-processor charges).
- Take the result away: download the recurring list, and a calendar file with the next renewal dates.
- "How to download your transactions" help for the tested banks.
- "Try with sample data" demo using synthetic data.
- A "How to verify nothing is uploaded" panel.
- English UI.

**Stage 2 — after the launch gate (M5–M7)**

- PDF statements as a second input, for history older than the CSV export reaches and for accounts with no export.
- Two verified PDF formats: TD chequing and CIBC credit card, with balance reconciliation.

**Out (post-MVP backlog)**

More PDF formats, French-language files, scanned PDFs (OCR), password-protected PDFs, offline PWA, saved sessions, categories and budgets, OFX/QIF import and export, mobile-optimised layout beyond basic responsiveness.

## 9. Functional requirements

| ID    | Requirement                                                                                                                                                                   |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR-1  | Accept one or more CSV files (stage 1) and PDF files (stage 2) by drag-and-drop or file picker. Reject other files with a clear message                                       |
| FR-2  | CSV: detect the columns; when unsure, ask the user to confirm them. PDF: detect the bank and statement type; if unknown, say so and link to "request support for this format" |
| FR-3  | Extract every transaction: date (with correct year), description, amount, direction, and running balance where the statement prints one                                       |
| FR-4  | Check each file and show one of three states: **Verified**, **Mismatch** (with the difference), or **Cannot verify** (for example a CSV with no balance column)               |
| FR-5  | Merge statements into one ledger, remove duplicates from overlapping periods, and warn about missing months                                                                   |
| FR-6  | Export the ledger as CSV that opens correctly in Excel and Google Sheets and is safe from formula injection                                                                   |
| FR-7  | List recurring charges with cadence, typical amount, monthly-equivalent and annual cost, last and next expected date, confidence, and the underlying transactions             |
| FR-8  | Flag price changes in a recurring series                                                                                                                                      |
| FR-9  | Let the user dismiss a false positive for the current session                                                                                                                 |
| FR-10 | Provide a demo mode that loads a bundled synthetic statement set                                                                                                              |
| FR-11 | Offer "Report a parsing problem", which produces a redacted fixture file locally for the user to attach to a GitHub issue themselves. Nothing is sent automatically           |
| FR-12 | Export a calendar file (`.ics`) with the next expected date of each recurring charge                                                                                          |
| FR-13 | Download the recurring list as CSV and as a printable page, because nothing is stored between visits                                                                          |
| FR-14 | Label a charge as ambiguous when its description names only an app store or a payment processor                                                                               |
| FR-15 | Detect annual charges when the history holds two occurrences about a year apart; say how much history is needed when it is shorter                                            |

## 10. Non-functional requirements

| ID                    | Requirement                                                                                                                     |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| NFR-1 Privacy         | No statement content leaves the device. No third-party requests at all. No analytics. No persistent storage of transactions     |
| NFR-2 Correctness     | Fail closed. Unverified data is always labelled as such                                                                         |
| NFR-3 Performance     | 12 statements processed in under 5 seconds on the CI runner; the UI never freezes for more than 200 ms                          |
| NFR-4 Compatibility   | Current Chrome, Edge, Firefox and Safari on desktop. The minimum versions are whatever `pdfjs-dist` supports; record them in M5 |
| NFR-5 Accessibility   | Keyboard-operable; status never conveyed by colour alone; passes an automated axe check with no serious issues                  |
| NFR-6 Maintainability | Adding a bank format requires a profile and fixtures, and no changes to the core pipeline                                       |
| NFR-7 Supply chain    | Exact-pinned dependencies with a lockfile; fewer than 10 runtime dependencies                                                   |

## 11. Acceptance criteria

Stage 1 is done when AC-1 to AC-12, AC-14 and AC-15 hold. Stage 2 adds AC-13. The thresholds in AC-6 and AC-7 did not change in ADR-018.

| ID    | Criterion                                                                                                                                                                               | Verified by                                 |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| AC-1  | Every fixture (CSV and PDF) parses to exactly its golden transaction list, and every fixture that carries balances reconciles as **Verified**                                           | Golden tests in CI                          |
| AC-2  | Removing or altering any one transaction in a fixture flips the result to **Mismatch**                                                                                                  | Mutation tests in CI                        |
| AC-3  | ≥ 2 real CSV export layouts (TD and CIBC), each backed by ≥ 2 redacted fixtures, plus synthetic layouts with and without a header, one or two amount columns, with and without balances | Fixture count                               |
| AC-4  | During an end-to-end run in a real browser, zero requests go to any origin other than the app's own, and no request carries a body                                                      | Playwright network assertion                |
| AC-5  | The app parses a statement with the network disabled after page load                                                                                                                    | Playwright offline test                     |
| AC-6  | On a labelled synthetic suite of ≥ 30 scenarios, recurring detection reaches precision ≥ 0.90 and recall ≥ 0.80 for weekly, bi-weekly and monthly cadences                              | Unit tests with a reported confusion matrix |
| AC-7  | On Bruce's own data, the detector finds at least 80% of the subscriptions he lists by hand beforehand                                                                                   | Manual check recorded in `docs/PROGRESS.md` |
| AC-8  | Exported CSV re-imports to an identical ledger, and a description starting with `=`, `+`, `-` or `@` is neutralised while amounts stay numeric                                          | Unit tests                                  |
| AC-9  | 12 synthetic files (about 12 months of transactions each) process in under 5 s in CI                                                                                                    | Playwright timing                           |
| AC-10 | The demo loads and shows recurring charges without the user supplying a file                                                                                                            | Playwright                                  |
| AC-11 | The deployed site sends the Content-Security-Policy defined in `docs/ARCHITECTURE.md` §8                                                                                                | `curl -I` check in the release checklist    |
| AC-12 | The README has a demo GIF, a supported-files table, privacy verification steps, and fixture contribution steps                                                                          | Review                                      |

Added by ADR-018:

| ID    | Criterion                                                                                                                                                                                                                                        | Verified by                            |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------- |
| AC-13 | Stage 2: ≥ 2 PDF statement formats, each backed by ≥ 3 redacted fixtures from real statements, all reconciling as **Verified**                                                                                                                   | Fixture count and golden tests in CI   |
| AC-14 | The calendar file parses back to the same dates and names it was built from, and the recurring-list download matches what is on screen                                                                                                           | Unit tests and Playwright              |
| AC-15 | At least five people outside the project tried the deployed app on their own bank export; for each, the bank, whether the import worked, whether the recurring list was right, and what they wanted next are recorded, with no financial details | Validation notes in `docs/PROGRESS.md` |

## 12. Top risks

| Risk                                                                                   | Likelihood | Impact                                                  | Mitigation                                                                                                        |
| -------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Not enough real statements to build and test parsers (A1, A4)                          | High       | Blocks the core                                         | M0 gate; MVP limited to formats Bruce owns; fixture tooling built early                                           |
| Real PDFs behave unlike the synthetic spike (fragmented or squashed text, hidden text) | Medium     | Schedule                                                | First real statement goes through extraction in M5, before any parser code                                        |
| Users do not trust a web page with bank statements                                     | High       | Adoption                                                | Open source, CSP, offline test, demo mode, plain-language verification steps                                      |
| Bank changes its layout                                                                | Medium     | Silent wrong output                                     | Reconciliation gate makes failures loud; header-anchored columns rather than fixed coordinates                    |
| CSV exports differ between banks, and some carry no balance (A8)                       | High       | Some imports cannot be verified; some banks unsupported | Column mapper with user confirmation; "Cannot verify" shown plainly; PDF support in stage 2                       |
| People will not download a file and drop it into a web page (A9)                       | Medium     | Adoption                                                | Per-bank download steps; demo mode; M4 validation before stage 2                                                  |
| The tool is used once and forgotten                                                    | High       | Low repeat use                                          | Calendar file and summary download give lasting value without storing data; accepted as the nature of the product |
| Scope creep into a budgeting app                                                       | Medium     | Never ships                                             | Non-goals in §4; backlog parked in `docs/ROADMAP.md`                                                              |
| Fall exams and the internship search compete for time (A7)                             | High       | Slip                                                    | Hour-based milestones with a stated cut order                                                                     |

## 13. Open questions for the owner

1. **Which banks and account types do you have ≥ 3 months of PDF statements for?** Answered 2026-11-10: TD chequing and CIBC credit card.
2. How many hours a week can you commit through mid-December? Answered 2026-11-10: more than 20.
3. Licence: MIT as recommended in ADR-006, or AGPL-3.0?
4. Final project name and whether to buy a domain (optional; about $10–15 a year would be the only cost).
5. **For M1:** download a CSV of transactions from TD (chequing) and from CIBC (credit card), as far back as each allows, and save them in `~/Statements/`. How far back does each go, and does each file have a balance column? (Blocks the M1 fixtures.)
