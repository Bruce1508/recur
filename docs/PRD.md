# PRD — Recur (working name)

|             |                                                                                    |
| ----------- | ---------------------------------------------------------------------------------- |
| **Status**  | Draft v0.1 — awaiting owner sign-off on open questions (§13)                       |
| **Owner**   | Bruce Vo                                                                           |
| **Date**    | 2026-11-10                                                                         |
| **Related** | `docs/RESEARCH.md`, `docs/ARCHITECTURE.md`, `docs/DECISIONS.md`, `docs/ROADMAP.md` |

"Recur" is a placeholder name. Rename freely before the first public commit.

## 1. Summary

A free, open-source web app that runs entirely in the browser. A user drops in PDF statements from a Canadian bank and gets two things: a clean CSV of every transaction, and a list of recurring charges (subscriptions) with price-change alerts. No bank login, no account, no upload. Every parsed statement is checked against the statement's own balances, and the app says so plainly when a parse cannot be verified.

One-line pitch: _the "find my forgotten subscriptions" feature of Rocket Money, for Canadians, without handing over bank credentials._

## 2. Problem

1. Rocket Money, the best-known subscription finder, is US-only (carried over from the November 2026 gap analysis; re-verify before using it in public copy).
2. Canadian alternatives that detect subscriptions automatically require connecting a bank account through an aggregator. Many people will not do that.
3. Manual trackers do not find the subscriptions a user has forgotten, which is the whole point.
4. Open-source statement parsers that support Canadian banks exist, but they need Python and native libraries, or they run on a server that receives the PDF (see `docs/RESEARCH.md` §2).

The gap: no tool is (a) fully client-side, (b) built for Canadian statement layouts, and (c) able to detect recurring charges.

## 3. Users and use cases

| Persona                                                                            | Need                                                                          | Primary use case                                                                        |
| ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| **P1 — Privacy-conscious Canadian** (student or early-career, Big-5 bank customer) | Find forgotten subscriptions without linking a bank                           | Drops 3–12 monthly statements, reviews the recurring list, cancels what they do not use |
| **P2 — Spreadsheet budgeter / self-employed**                                      | Transactions as CSV for a spreadsheet or bookkeeping tool                     | Drops statements, downloads one merged CSV                                              |
| **P3 — Evaluator** (recruiter, engineer, potential contributor)                    | Judge the project in under two minutes without owning a Canadian bank account | Clicks "Try with a sample statement", reads the README, skims the code                  |

P3 matters. The project's first goal is a strong resume piece, and a recruiter will never upload their own statement. A one-click demo with synthetic data is a requirement, not a nice-to-have.

## 4. Goals, non-goals and success metrics

**Goals (in priority order)**

1. A resume-grade project with one genuinely hard, explainable technical component: verified extraction of tabular financial data from PDFs, in the browser.
2. A tool that is correct or says it is not. Wrong numbers presented confidently are the worst outcome for a finance tool.
3. Real users, if achievable at zero marginal cost.

**Non-goals**

- Budgeting, spending categories, net-worth tracking, bank connections.
- Cancelling subscriptions on the user's behalf.
- Any server, account system, or stored user data.
- Any LLM in the product path.
- Supporting every Canadian bank at launch.

**Success metrics** (measured 4 weeks after launch)

| Metric                                                  | Target | How measured                               |
| ------------------------------------------------------- | ------ | ------------------------------------------ |
| Fixture corpus fully reconciled                         | 100%   | CI                                         |
| Statement formats supported and verified                | ≥ 2    | Supported-formats table backed by fixtures |
| GitHub stars                                            | ≥ 25   | GitHub                                     |
| Fixtures or bug reports from people Bruce does not know | ≥ 3    | GitHub issues                              |
| Resume bullet backed by a live demo URL                 | Yes    | —                                          |

The product has no telemetry by design (it would undercut the privacy claim), so usage cannot be measured directly. That is an accepted cost; see ADR-001.

## 5. Assumptions

| ID  | Assumption                                                                                                                    | Status                                                                                                                 | How to validate                                 | If false                                                                            |
| --- | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | ----------------------------------------------------------------------------------- |
| A1  | Bruce can obtain ≥ 3 consecutive monthly PDF statements for at least one chequing account and one credit card at a Big-5 bank | **Confirmed 2026-11-10: TD chequing + CIBC credit card**                                                               | Bruce checks his online banking                 | Start with whatever formats he has; if none, the project is not viable as specified |
| A2  | Statements are digital PDFs with a real text layer, not scans                                                                 | Unconfirmed                                                                                                            | Select text in the PDF viewer                   | OCR is out of scope; those statements are unsupported                               |
| A3  | A bank's layout is stable enough that one profile covers at least 12 months of statements                                     | Unconfirmed; prior art warns that banks tweak formats                                                                  | Parse statements from different months          | Profiles need variants; more maintenance                                            |
| A4  | Friends will share redacted fixtures for other banks                                                                          | Unconfirmed                                                                                                            | Ask 2–3 people during M2                        | Bank coverage stays at what Bruce owns                                              |
| A5  | No existing client-side tool already parses Canadian statements well                                                          | Partly verified: two were inspected and neither supports Canadian banks. Digital ToolPad is closed-source and untested | M0: Bruce tries it on one of his own statements | The differentiator narrows to the subscription finder; still viable                 |
| A6  | Three months of data is enough to detect monthly subscriptions                                                                | Reasonable; matches the 3-occurrence approach in Actual Budget                                                         | Labelled test suite in M3                       | Require more statements; say so in the UI                                           |
| A7  | Bruce has roughly 15–20 hours a week for this through mid-December                                                            | **Unconfirmed**                                                                                                        | Bruce confirms                                  | Timeline stretches to 5–6 weeks; cut order is in `docs/ROADMAP.md`                  |

## 6. Constraints

- **Budget:** $0. Static hosting only; no paid APIs.
- **Marginal cost per user:** ≈ $0. All computation happens on the user's device.
- **Team:** one developer, part-time.
- **Time:** MVP in about 4 weeks of part-time work (≈ 65–80 hours).
- **Privacy:** real statements are personal financial data. They never enter the repository, CI, or an AI assistant's context.
- **Legal:** bank names are used descriptively only, with no logos. The app gives no financial advice. This is not legal advice either; see ADR-006 for licensing.

## 7. Requirements challenged

| Original idea                          | Problem                                                                                                                                                                                                           | Decision                                                                                                                                                                    |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Support all five big banks in 4 weeks  | No committed sample statements exist anywhere to test against (even the leading open-source parser ships none for Canadian banks). Unverified parsers for five banks are worth less than verified parsers for two | **MVP = 2 verified formats.** More banks arrive through redacted fixtures after launch                                                                                      |
| Run all parsing in a custom Web Worker | pdf.js already parses PDFs in its own worker. Our own logic handles a few thousand text items in milliseconds (spike: 2 pages end-to-end in ~170 ms)                                                              | **No custom worker in MVP.** Add one only if measurement shows a problem                                                                                                    |
| Offline PWA at launch                  | Useful for trust, but not needed: once the page is loaded it already works with the network off                                                                                                                   | **Post-MVP**                                                                                                                                                                |
| Port the bank rules from monopoly      | AGPL-3.0, written for a different extraction model, and untested by fixtures for Canadian banks                                                                                                                   | **Independent implementation**; use it as a source of facts about formats (ADR-006)                                                                                         |
| PDFs as the only input                 | Collecting monthly PDFs is tedious for users                                                                                                                                                                      | **Keep PDF as the MVP input** because it is the hard technical piece. Add bank CSV import as the fallback plan if PDF parsing slips; it still ships the subscription finder |
| Detect all subscriptions               | Annual subscriptions cannot be detected from under 13 months of data                                                                                                                                              | **MVP targets weekly, bi-weekly and monthly.** Annual is flagged as "possible" only                                                                                         |
| Measure user counts                    | Requires telemetry, which contradicts the trust model                                                                                                                                                             | **No telemetry**; proxy metrics in §4                                                                                                                                       |

## 8. MVP scope

**In**

- Drag-and-drop one or many PDF statements.
- Two statement formats: one chequing or savings account and one credit card, from the bank(s) Bruce holds statements for. Planning assumption until A1 is answered: one Big-5 bank, both account types.
- Automatic bank and statement-type detection.
- Balance reconciliation for every statement with a visible status.
- Merged, de-duplicated ledger across statements; CSV export.
- Recurring-charge detection with cadence, typical amount, monthly and yearly cost, price-change flag, confidence, and the evidence rows.
- "Try with a sample statement" demo using synthetic data.
- A "How to verify nothing is uploaded" panel.
- English UI.

**Out (post-MVP backlog)**

More banks and account types, French-language statements, scanned PDFs (OCR), password-protected PDFs, bank CSV import (fallback plan), offline PWA, saved sessions, categories and budgets, OFX/QIF export, mobile-optimised layout beyond basic responsiveness.

## 9. Functional requirements

| ID    | Requirement                                                                                                                                                         |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR-1  | Accept one or more PDF files by drag-and-drop or file picker. Reject non-PDFs with a clear message                                                                  |
| FR-2  | Detect the bank and statement type. If unknown, say so and link to "request support for this format"                                                                |
| FR-3  | Extract every transaction: date (with correct year), description, amount, direction, and running balance where the statement prints one                             |
| FR-4  | Reconcile each statement and show one of three states: **Verified**, **Mismatch** (with the difference), or **Cannot verify**                                       |
| FR-5  | Merge statements into one ledger, remove duplicates from overlapping periods, and warn about missing months                                                         |
| FR-6  | Export the ledger as CSV that opens correctly in Excel and Google Sheets and is safe from formula injection                                                         |
| FR-7  | List recurring charges with cadence, typical amount, monthly-equivalent and annual cost, last and next expected date, confidence, and the underlying transactions   |
| FR-8  | Flag price changes in a recurring series                                                                                                                            |
| FR-9  | Let the user dismiss a false positive for the current session                                                                                                       |
| FR-10 | Provide a demo mode that loads a bundled synthetic statement set                                                                                                    |
| FR-11 | Offer "Report a parsing problem", which produces a redacted fixture file locally for the user to attach to a GitHub issue themselves. Nothing is sent automatically |

## 10. Non-functional requirements

| ID                    | Requirement                                                                                                                     |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| NFR-1 Privacy         | No statement content leaves the device. No third-party requests at all. No analytics. No persistent storage of transactions     |
| NFR-2 Correctness     | Fail closed. Unverified data is always labelled as such                                                                         |
| NFR-3 Performance     | 12 statements processed in under 5 seconds on the CI runner; the UI never freezes for more than 200 ms                          |
| NFR-4 Compatibility   | Current Chrome, Edge, Firefox and Safari on desktop. The minimum versions are whatever `pdfjs-dist` supports; record them in M1 |
| NFR-5 Accessibility   | Keyboard-operable; status never conveyed by colour alone; passes an automated axe check with no serious issues                  |
| NFR-6 Maintainability | Adding a bank format requires a profile and fixtures, and no changes to the core pipeline                                       |
| NFR-7 Supply chain    | Exact-pinned dependencies with a lockfile; fewer than 10 runtime dependencies                                                   |

## 11. Acceptance criteria

The MVP is done when all of these hold.

| ID    | Criterion                                                                                                                                                  | Verified by                                 |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| AC-1  | Every fixture parses to exactly its golden transaction list and reconciles as **Verified**                                                                 | Golden tests in CI                          |
| AC-2  | Removing or altering any one transaction in a fixture flips the result to **Mismatch**                                                                     | Mutation tests in CI                        |
| AC-3  | ≥ 2 statement formats, each backed by ≥ 3 redacted fixtures from real statements                                                                           | Fixture count                               |
| AC-4  | During an end-to-end run in a real browser, zero requests go to any origin other than the app's own, and no request carries a body                         | Playwright network assertion                |
| AC-5  | The app parses a statement with the network disabled after page load                                                                                       | Playwright offline test                     |
| AC-6  | On a labelled synthetic suite of ≥ 30 scenarios, recurring detection reaches precision ≥ 0.90 and recall ≥ 0.80 for weekly, bi-weekly and monthly cadences | Unit tests with a reported confusion matrix |
| AC-7  | On Bruce's own data, the detector finds at least 80% of the subscriptions he lists by hand beforehand                                                      | Manual check recorded in `docs/PROGRESS.md` |
| AC-8  | Exported CSV re-imports to an identical ledger, and a description starting with `=`, `+`, `-` or `@` is neutralised while amounts stay numeric             | Unit tests                                  |
| AC-9  | 12 synthetic statements process in under 5 s in CI                                                                                                         | Playwright timing                           |
| AC-10 | The demo loads and shows recurring charges without the user supplying a file                                                                               | Playwright                                  |
| AC-11 | The deployed site sends the Content-Security-Policy defined in `docs/ARCHITECTURE.md` §8                                                                   | `curl -I` check in the release checklist    |
| AC-12 | The README has a demo GIF, a supported-formats table, privacy verification steps, and fixture contribution steps                                           | Review                                      |

## 12. Top risks

| Risk                                                                                   | Likelihood | Impact              | Mitigation                                                                                     |
| -------------------------------------------------------------------------------------- | ---------- | ------------------- | ---------------------------------------------------------------------------------------------- |
| Not enough real statements to build and test parsers (A1, A4)                          | High       | Blocks the core     | M0 gate; MVP limited to formats Bruce owns; fixture tooling built early                        |
| Real PDFs behave unlike the synthetic spike (fragmented or squashed text, hidden text) | Medium     | Schedule            | First real statement goes through extraction in M1, before any parser code                     |
| Users do not trust a web page with bank statements                                     | High       | Adoption            | Open source, CSP, offline test, demo mode, plain-language verification steps                   |
| Bank changes its layout                                                                | Medium     | Silent wrong output | Reconciliation gate makes failures loud; header-anchored columns rather than fixed coordinates |
| Scope creep into a budgeting app                                                       | Medium     | Never ships         | Non-goals in §4; backlog parked in `docs/ROADMAP.md`                                           |
| Fall exams and the internship search compete for time (A7)                             | High       | Slip                | Hour-based milestones with a stated cut order                                                  |

## 13. Open questions for the owner

1. **Which banks and account types do you have ≥ 3 months of PDF statements for?** This decides the two MVP formats. (Blocks M1.)
2. How many hours a week can you commit through mid-December?
3. Licence: MIT as recommended in ADR-006, or AGPL-3.0?
4. Final project name and whether to buy a domain (optional; about $10–15 a year would be the only cost).
