# Architecture Decision Records

**Date of all records:** 2026-11-10 · **Decider:** Bruce Vo · Evidence for each decision is in `docs/RESEARCH.md`.

A record is changed only by adding a new record that supersedes it. Statuses: Proposed, Accepted, Superseded.

| #   | Decision                                                                                | Status                                                                 |
| --- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| 001 | Client-only static app; no backend, no telemetry                                        | Proposed                                                               |
| 002 | `pdfjs-dist` for PDF text extraction                                                    | Proposed                                                               |
| 003 | Header-anchored column geometry for parsing                                             | Proposed                                                               |
| 004 | Balance reconciliation is a hard gate; fail closed                                      | Proposed                                                               |
| 005 | Redacted positioned-text fixtures; no real PDFs anywhere                                | Proposed                                                               |
| 006 | MIT licence; independent implementation; monopoly as a reference for facts only         | Accepted (choice delegated by the owner, 2026-11-10)                   |
| 007 | React + Vite + TypeScript                                                               | Proposed                                                               |
| 008 | No custom Web Worker in the MVP                                                         | Proposed                                                               |
| 009 | Cloudflare Pages, with a host-independent CSP                                           | Proposed                                                               |
| 010 | In-memory state only                                                                    | Proposed                                                               |
| 011 | Integer cents and plain date strings                                                    | Proposed                                                               |
| 012 | TypeScript 7 + Biome + Vitest + Playwright, npm, Node 24                                | Proposed                                                               |
| 013 | No LLM in the product path                                                              | Proposed                                                               |
| 014 | Rule-based recurring detection                                                          | Proposed                                                               |
| 015 | Autonomous PR workflow and Claude Code automation                                       | Accepted                                                               |
| 016 | Real statements live outside the repository                                             | Accepted                                                               |
| 017 | Run `gh` and `git push/fetch/pull` as standalone commands                               | Accepted                                                               |
| 018 | CSV import first, PDF parsing second; usefulness is the first goal                      | Accepted (owner's decision, 2026-11-10); stage order superseded by 019 |
| 019 | PDF first for the owner's banks; no further CSV work                                    | Accepted (owner's decision, 2026-11-14)                                |
| 020 | Checkpoint and totals reconciliation; amount columns found from the amounts             | Accepted (owner delegated the design, 2026-11-14)                      |
| 021 | Reframe: help the user read their transactions; verified numbers stay on device         | Accepted (owner delegated the details, 2026-11-25)                     |
| 022 | Prose rules become lint and coverage checks                                             | Accepted (2026-11-20)                                                  |
| 023 | One routing page for installed skill packs                                              | Accepted (2026-11-20)                                                  |
| 024 | Close the skill-routing loophole with a required step and a template                    | Accepted (2026-11-20)                                                  |
| 025 | Statement chaining: closing balance against the next opening balance                    | Accepted (2026-11-20)                                                  |
| 026 | TD page totals and overdrawn-balance suffix; per-page totals sum to the statement total | Accepted (owner delegated, 2026-11-25)                                 |

All records become Accepted when Bruce signs off on the PRD.

---

## ADR-001 — Client-only static app; no backend, no telemetry

**Context.** The product asks people to hand over bank statements. Budget is $0. The differentiator against existing tools is that nothing is uploaded.

| Option                                           | Cost                            | Privacy story                          | Effort                                     |
| ------------------------------------------------ | ------------------------------- | -------------------------------------- | ------------------------------------------ |
| **A. Static app, all processing in the browser** | $0                              | Strong and checkable by the user       | Medium                                     |
| B. Small backend that parses PDFs                | Hosting cost; scales with users | "Trust us"                             | Lower for parsing (Python libraries exist) |
| C. Static app plus privacy-friendly analytics    | $0                              | Weakened: a third-party request exists | Low                                        |

**Decision.** A. No server code, no analytics, no error reporting service.

**Consequences.** Marginal cost stays near zero and the privacy claim is testable. We cannot count users or see crashes; success is judged by proxy metrics and by issues people choose to file. PDF parsing must work in JavaScript.

**Revisit when** the lack of crash data blocks debugging. The first step would be a user-initiated "copy diagnostic report", not telemetry.

---

## ADR-002 — `pdfjs-dist` for PDF text extraction

**Context.** The parser needs each text fragment with its position, plus document metadata, in the browser.

| Option                      | Licence           | Positions              | Size / fit                                                            | Risk                    |
| --------------------------- | ----------------- | ---------------------- | --------------------------------------------------------------------- | ----------------------- |
| **A. `pdfjs-dist` 6.5.438** | Apache-2.0        | Yes                    | 1.3 MB worker; runs in browser and Node                               | Low: Mozilla-maintained |
| B. `unpdf` 2.1.0            | MIT               | Via its bundled pdf.js | Extra layer; Node ≥ 24                                                | Low                     |
| C. MuPDF.js 1.28.6          | AGPL-3.0-or-later | Yes                    | 14.3 MB package                                                       | Licence forces AGPL     |
| D. Pyodide + Python parsers | Mixed             | No                     | > 14 MB before PDF libraries; PyMuPDF's Pyodide build is experimental | High                    |
| E. `pdf-oxide-wasm` 0.3.77  | MIT/Apache-2.0    | Not evaluated          | Unknown                                                               | Unverified claims       |

**Decision.** A, used directly and isolated in `src/pdf/extract.ts`.

**Consequences.** The low-level API means we own line and column reconstruction. Swapping libraries later touches one file. pdf.js is called from the main thread and uses its own worker.

**Revisit when** a real statement extracts badly (missing spaces, garbled characters) and configuration cannot fix it. Evaluate option E first.

---

## ADR-003 — Header-anchored column geometry for parsing

**Context.** Statement transactions are tables. Three ways to recover them were considered.

| Option                                                                                 | Robustness                                                                   | Reuse of prior art                                                      | Effort |
| -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ------ |
| **A. Use item x-positions; derive columns from the header row on each page**           | Survives spacing changes; fails visibly if the header moves                  | Technique validated in the spike                                        | Medium |
| B. Rebuild fixed-width layout text and apply regular expressions (monopoly's approach) | Sensitive to exact whitespace, which we would be approximating               | Could mirror monopoly's patterns, but that would make this project AGPL | Medium |
| C. Generic table detection with no bank knowledge                                      | Works on unknown banks, unreliable on details like signs and multi-line rows | None                                                                    | High   |

**Decision.** A. Each bank format is a declarative profile: identifiers, header labels, column roles and alignment, date format, sign convention, and reconciliation method.

**Consequences.** Adding a bank is mostly data. A layout change that moves the header is detected as "header not found", not silently mis-parsed. Statements without a recognisable header row need a different strategy.

**Revisit when** a bank's statements defeat geometry (for example, text with no usable positions). Allow that profile to opt into a pattern-based row parser.

---

## ADR-004 — Balance reconciliation is a hard gate; fail closed

**Context.** A parser that drops one transaction looks fine and is wrong. Prior art notes that banks tweak formats between statements, so silent failures are expected over time.

**Decision.** Every statement is reconciled in integer cents, by per-row running balance where the statement prints one, otherwise by opening balance plus transactions equals closing balance. The result is `verified`, `mismatch` or `unverifiable`, shown to the user on every statement. Tests include mutations that must flip the status to `mismatch`.

**Consequences.** Parser bugs and layout changes surface immediately, including for users. Some formats cannot be fully verified (for example, where totals are per page); they are labelled, not hidden. Each profile needs opening and closing balance extraction.

**Revisit when** a common format turns out to be unverifiable. Look for another invariant it prints, such as total debits and credits.

---

## ADR-005 — Redacted positioned-text fixtures; no real PDFs anywhere

**Context.** Tests need real statement structure. Real statements are personal financial data. No public fixtures exist for Canadian banks.

| Option                                                                                                                | Realism                 | Privacy           | Notes                                          |
| --------------------------------------------------------------------------------------------------------------------- | ----------------------- | ----------------- | ---------------------------------------------- |
| A. Commit real PDFs                                                                                                   | Highest                 | Unacceptable      | —                                              |
| B. Commit only synthetic PDFs                                                                                         | Low: misses real quirks | Safe              | Useful for end-to-end tests                    |
| **C. Commit redacted extraction output (JSON of positioned text) from real PDFs, plus synthetic PDFs for end-to-end** | High for parsing logic  | Safe after review | Idea adapted from monopoly's contributor guide |

**Decision.** C. A local CLI turns a PDF into a redacted fixture: dates, amounts and structural labels are kept; each distinct description becomes a stable placeholder; other digit runs are masked. Real PDFs live in a gitignored `private/` folder that AI tools are denied from reading.

**Consequences.** Contributors can add a bank without sharing a statement. Fixtures do not exercise pdf.js itself; synthetic PDFs and manual checks cover that seam. Redaction needs human review before every commit.

**Revisit when** a bug depends on raw PDF structure that the JSON cannot capture.

---

## ADR-006 — MIT licence; independent implementation; monopoly as a reference for facts only

**Context.** monopoly (AGPL-3.0) already encodes rules for the five big Canadian banks. Copying or porting its code would make this project a derivative work and therefore AGPL. This record is an engineering judgement, not legal advice.

| Option                                                                                                       | Speed                                                                                                       | Freedom for others to reuse | Legal clarity                         |
| ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- | --------------------------- | ------------------------------------- |
| **A. MIT; write parsers independently; consult monopoly, bankstate and Teller only for facts about formats** | Slower than copying; but the chosen technique (ADR-003) is different anyway, so little is lost              | Maximum                     | Clear if the no-copy rule is followed |
| B. AGPL-3.0; port monopoly's patterns freely                                                                 | Faster in theory; in practice the patterns target poppler's layout text and are untested for Canadian banks | Limited                     | Clear                                 |
| C. MIT while porting code anyway                                                                             | —                                                                                                           | —                           | A licence violation                   |

**Decision.** A. The repository rule is: never copy code or regular expressions from AGPL, GPL or unlicensed projects. Reading them to learn how a statement is laid out is fine. Credit them in the README. Code from MIT projects (bankstate, Actual Budget) may be adapted with attribution.

**Consequences.** Others can reuse the parsers freely. The rule must be explicit in `CLAUDE.md`, because an AI assistant shown AGPL code may reproduce it. While Bruce is the sole copyright holder he can still relicense to AGPL later if he decides direct porting is worth it; that door closes once outside contributions arrive.

**Decided 2026-11-10:** MIT. The owner delegated the choice; status Accepted.

---

## ADR-007 — React + Vite + TypeScript

**Context.** The UI is small: a drop zone, three result views, a few panels.

| Option                   | Bundle                                      | Familiarity              | Signal to reviewers                   |
| ------------------------ | ------------------------------------------- | ------------------------ | ------------------------------------- |
| **A. React 19 + Vite 8** | Larger framework, negligible next to pdf.js | Bruce already uses React | Widely recognised                     |
| B. Preact or Svelte      | Smaller                                     | New to learn             | Fine, less common in target employers |
| C. No framework          | Smallest                                    | —                        | More hand-written DOM code            |

**Decision.** A.

**Consequences.** No learning cost; a common hiring stack. The pure core does not depend on React, so the choice is cheap to reverse.

---

## ADR-008 — No custom Web Worker in the MVP

**Context.** An earlier plan listed "run parsing in a Web Worker". pdf.js already parses in its own worker. Our stages processed a two-page statement in well under 200 ms in the spike. Running pdf.js inside another worker is a known source of trouble.

**Decision.** Call pdf.js from the main thread; run our pipeline on the main thread; measure.

**Consequences.** Less code, no message-passing layer, one fewer dependency. Very large batches could cause jank.

**Revisit when** a main-thread task exceeds 200 ms in the performance test. The pipeline is pure functions, so moving it into a worker is mechanical.

---

## ADR-009 — Cloudflare Pages, with a host-independent CSP

**Context.** The trust model benefits from real security response headers. GitHub Pages cannot set them.

**Decision.** Deploy to Cloudflare Pages using a `_headers` file for the CSP and related headers. Also emit the same policy in a `<meta>` tag so the app keeps most of its protection on any static host. Keep GitHub Pages as a documented fallback.

**Consequences.** Free; adds a Cloudflare account as a dependency. `frame-ancestors` only works as a header, so the fallback host loses clickjacking protection.

**Revisit when** hosting terms change or a host with a better trust story appears.

---

## ADR-010 — In-memory state only

**Context.** Persisting transactions would let users return later, at the cost of leaving financial data in browser storage on shared or lost devices.

**Decision.** Nothing about the user's statements is written to `localStorage`, `IndexedDB` or cookies. Reloading clears everything.

**Consequences.** The privacy statement is simple and true. Users must re-drop files each visit.

**Revisit when** users ask for persistence. Make it opt-in and clearly labelled.

---

## ADR-011 — Integer cents and plain date strings

**Context.** Floating-point dollars cause off-by-a-cent reconciliation failures. JavaScript `Date` brings time-zone shifts that can move a transaction to the previous day.

**Decision.** Amounts are integer cents. Dates are `YYYY-MM-DD` strings handled by a small helper module. No date library.

**Consequences.** Reconciliation is exact. A few date utilities must be written and tested, including year rollover.

---

## ADR-012 — TypeScript 7 + Biome + Vitest + Playwright, npm, Node 24

**Context.** `typescript@latest` is 7.0.2. `typescript-eslint` 8.72.2 declares a peer range of `<6.1.0`, so ESLint with type-aware rules cannot be used with TypeScript 7 today.

| Option                                  | Works today | Tools to manage              |
| --------------------------------------- | ----------- | ---------------------------- |
| **A. TypeScript 7.0.x + Biome 2.6**     | Yes         | One tool for lint and format |
| B. TypeScript 6.0.x + ESLint + Prettier | Yes         | Three tools; older compiler  |

**Decision.** A, with Vitest 5.1, fast-check 4.10, Playwright 1.65, npm and Node 24 LTS. Exact version pins and a committed lockfile.

**Consequences.** Simple toolchain. Biome's rules are not identical to typescript-eslint's. If any tool requires the older TypeScript API, switch to the 6.0.x line; nothing else changes.

**Revisit when** `typescript-eslint` supports TypeScript 7 and a specific rule is missed.

---

## ADR-013 — No LLM in the product path

**Context.** A language model could parse arbitrary statements. It would also cost money per use or require a multi-gigabyte in-browser model, produce non-deterministic output for financial data, and, if hosted, send statements to a third party.

**Decision.** No LLM calls at runtime, local or remote.

**Consequences.** Deterministic, testable, free to run. Unknown banks are unsupported until someone writes a profile.

---

## ADR-014 — Rule-based recurring detection

**Context.** The detector must be explainable to users ("why was this flagged?") and testable. Actual Budget's detector is the closest prior art but is bound to its database.

| Option                                                                                               | Explainable | Data needed                  | Effort                                                           |
| ---------------------------------------------------------------------------------------------------- | ----------- | ---------------------------- | ---------------------------------------------------------------- |
| **A. Group by normalised merchant, classify the median gap into cadence buckets, score consistency** | Yes         | 3+ occurrences               | Medium                                                           |
| B. Port Actual Budget's candidate-pattern matcher                                                    | Yes         | 3 occurrences                | Medium–high: must replace its query layer and recurrence library |
| C. Statistical or learned model                                                                      | No          | Labelled data we do not have | High                                                             |

**Decision.** A. Starting parameters borrowed from Actual Budget: ±2 days of date jitter, 7.5% amount tolerance, a minimum of three occurrences for a confident result.

**Consequences.** Simple, fast, and each result can show its evidence. Quality depends heavily on merchant normalisation. Annual charges are out of reach for typical inputs and are only hinted at.

**Revisit when** the labelled suite shows precision or recall below the AC-6 targets after tuning.

---

## ADR-015 — Autonomous PR workflow and Claude Code automation

**Context.** The owner wants Claude to ship tasks without prompting: open pull requests, review them, merge them and continue to the next task. The earlier rule (no skills, subagents, hooks or MCP servers; one deny rule) is superseded. The 2026-11-10 audit also found that a `Read` deny rule does not stop scripts from reading files and that neither deny rules nor the sandbox cover MCP tools.

**Decision.**

- `main` changes only by squash-merged pull request. Branch protection requires the CI check `verify`, linear history, no force pushes and no deletion, enforced for administrators.
- Every task follows the `ship-task` skill. A PR merges only when CI is green and the `reviewer` subagent (fresh context, read-only) returns APPROVE. At most two fix rounds, then stop.
- Orchestration: one Workflow run per milestone (or per group of tasks), at most ten agents per run. Implementers use Sonnet. The reviewer uses Sonnet, or Opus for `parse/`, `reconcile.ts`, CSP, file handling and `.claude/`.
- Protection in layers: permission deny rules; the OS sandbox (`sandbox.filesystem.denyRead`, which also covers child processes); a `PreToolUse` guard hook on every tool, including MCP tools and subagents, that blocks private paths, pushes to `main`, force pushes, `--admin` merges, branch-protection changes and dependency installs outside `.claude/hooks/approved-deps.json`; Biome's focused- and skipped-test rules from M0b.
- The sandbox excludes `gh`, `git push/fetch/pull` and Playwright runs (macOS TLS and local-server constraints). These run with full access, so the guard hook is their only check.
- The pre-approved dependency list equals the "Use" rows of `docs/RESEARCH.md` §5. Anything else needs the owner.
- The claude-mem plugin is disabled for this project because it sends tool output to a third-party inference service. The ECC GateGuard hook is turned off with `ECC_GATEGUARD=off` to remove per-call gates.
- Tasks that need the owner are queued in `docs/PROGRESS.md`.

**Consequences.** Faster delivery with no human in the merge loop. A model reviewing a model is weaker than a human reviewer; CI, golden and mutation tests and the fresh-context reviewer carry the weight. Each PR costs roughly two or three agent runs. Hooks run outside the sandbox and are a text heuristic.

**Revisit when** a merged PR causes a regression that review should have caught. First step: require Opus review or owner approval for that path.

---

## ADR-016 — Real statements live outside the repository

**Context.** ADR-005 kept real PDFs in a gitignored `private/` folder inside the working tree. A file there can still be staged by `git add -A`, read by a script, or opened by a browser automation tool.

**Decision.** Real statements live in `~/Statements/` (mode 700). `private/` holds only the owner's personal deny-list for the fixture privacy check. Both paths are denied by permission rules, the sandbox and the guard hook. `.gitignore` ignores every `*.pdf` except under `fixtures/synthetic/` and `src/demo/`. `tools/fixture-dump.ts` takes an absolute path and is run by the owner.

**Consequences.** This supersedes ADR-005 only for where real statements are stored; the rest of ADR-005 stands.

---

## ADR-017 — Run `gh` and `git push/fetch/pull` as standalone commands

**Context.** `sandbox.excludedCommands` matches the start of a command. A piped, chained (`&&`, `;`) or subshell form of `gh` or `git push/fetch/pull` is not matched, so it runs inside the sandbox and fails on network or TLS access.

**Decision.** The `ship-task` skill (steps 7 and 10) requires these commands to run one at a time, never piped, chained or in subshells. This extends ADR-015 and changes only `.claude/skills/ship-task/SKILL.md`.

**Consequences.** No change to permissions or the sandbox; a few more tool calls per task.

---

## ADR-018 — CSV import first, PDF parsing second; usefulness is the first goal

**Context.** The original plan made PDF parsing the only input and a resume piece the first goal. On 2026-11-10 the owner changed the first goal to a product that is useful to the people who use it. Each PDF format needs its own profile and real fixtures, so a PDF-only MVP would serve customers of two banks. Most banks let customers download transactions as CSV, and the owner confirmed that his bank offers 12 months or more. A market re-check the same day (`docs/RESEARCH.md` §12) found no tool that detects recurring charges automatically without a bank connection.

| Option                                      | Banks served at launch             | Time to a usable product | Hard technical piece |
| ------------------------------------------- | ---------------------------------- | ------------------------ | -------------------- |
| A. PDF first, CSV in the backlog (old plan) | 2 formats                          | About 6 weeks            | Shown early          |
| **B. CSV first, PDF second**                | Any bank with a transaction export | About 4 weeks            | Deferred to stage 2  |
| C. CSV only; drop PDF parsing               | Any bank with a transaction export | About 4 weeks            | Lost                 |

**Decision.** B.

- Goal order in `docs/PRD.md` §4 becomes: useful to real users; correct or says it is not; a resume-grade technical piece.
- Stage 1 (M1–M4) ships CSV import with a column mapper, the recurring finder, exports and the trust features, then a small launch with at least five outside testers.
- Stage 2 (M5–M7) adds verified PDF parsing for TD chequing and CIBC credit card. It starts only after the stage gate in M4.
- A CSV import is checked with the running-balance method when the file has a balance column. Without one, the result is `unverifiable` and the UI says so. ADR-004 still holds: nothing unverified is shown as verified.
- Annual charges are detected when the history holds two occurrences about a year apart. This extends ADR-014, whose rule-based approach is unchanged.
- A real CSV export is treated exactly like a real statement: it stays in `~/Statements/`, is never read by Claude, and reaches the repository only as a redacted fixture reviewed by the owner (ADR-005, ADR-016).

**Consequences.** The product is usable by far more people from day one, and feedback arrives before the expensive parser work. The resume piece moves later and depends on the stage gate. CSV layouts differ between banks and some carry no balance, so some imports cannot be verified. The old fallback plan ("switch to CSV if PDF fails") is gone because CSV is now the main path; if PDF parsing fails in M6 the product stays CSV-only.

**Revisit when** the M4 validation shows that people cannot or will not download a CSV from their bank. Then PDF, or another input, moves up.

---

## ADR-019 — PDF first for the owner's banks; no further CSV work

**Context.** ADR-018 put CSV first because the owner said his bank offers a CSV export (open question 6). On 2026-11-14 he checked both target accounts: TD chequing offers statement PDFs only, and CIBC credit card is also PDF only. The owner therefore has no real CSV to build a fixture from, and the product would not work on his own data. ADR-018's fallback ("if PDF parsing fails the product stays CSV-only") would leave him with nothing.

| Option                                                             | Works on the owner's accounts | Cost                                     |
| ------------------------------------------------------------------ | ----------------------------- | ---------------------------------------- |
| A. Keep CSV first, wait for a CSV from another bank                | No                            | Stalls with no real fixture              |
| **B. PDF first for TD and CIBC; keep the CSV code, stop CSV work** | Yes                           | Parser work comes before M2              |
| C. Delete the CSV pipeline                                         | Yes                           | Throws away tested, merged, working code |

**Decision.** B.

- The CSV pipeline on `main` (M1 tasks 1 to 11, 312 tests) stays as it is. No new CSV tasks. The real-CSV fixtures for TD and CIBC (the real part of AC-3) are dropped; the synthetic CSV layouts keep AC-3's synthetic part.
- Milestone order becomes M1 (code done), M5, M6, M7, then M2, M3, M4. Milestone numbers do not change. The M4 stage gate no longer blocks PDF work, because PDF is now the owner's only input; M4 still ends with the small launch and outside testers.
- ADR-016 is unchanged. Real PDFs stay in the statements folder outside the repository, Claude never reads them, and they never enter the repository. Layout facts reach Claude only through `tools/pdf-dump.ts` (M5 task 4), which the owner runs. It writes positioned text in which every text run is replaced by a mask that keeps its shape (digits, letters, punctuation), except dates, amounts and a short list of structural labels. The owner reads the output before sharing it.
- ADR-004 and ADR-005 stand: reconciliation is a hard gate, and fixtures are redacted positioned text.

**Consequences.** The hard technical piece comes first and the owner can use the product on his own accounts. Recurring-charge detection (M2) waits on a working PDF format, so the first usable demo moves later. If the PDFs turn out to have no text layer (scanned images), parsing is out of scope and this decision is revisited.

**Revisit when** the first real dump shows no text layer, or a bank format cannot be reconciled in M6.

---

## ADR-020 — Checkpoint and totals reconciliation; amount columns found from the amounts

**Context.** The first real layout dump (TD chequing, 2026-11-14, see `docs/PROGRESS.md`) showed two facts that the design in ADR-003 and ADR-004 did not foresee.

1. A balance is printed only on the last row of each day, plus on the opening row, not on every row. `reconcile` returns `unverifiable` as soon as one row lacks a balance, so this statement could never be Verified. By hand, every printed balance equals the previous printed balance plus the deposits minus the withdrawals of the rows between them, and the total row equals the sums, so the data does support a check.
2. The header labels are centred over their columns while the amounts are right-aligned, 16 to 24 points further right. Matching an amount to the header whose right edge is nearest picks the wrong column.

| Option for the check                                          | Verifies this layout | Pinpoints a bad row           | Cost                                                            |
| ------------------------------------------------------------- | -------------------- | ----------------------------- | --------------------------------------------------------------- |
| A. Keep running-balance only                                  | No                   | n/a                           | The owner's statements stay unverified                          |
| **B. Checkpoints plus printed totals, extending `reconcile`** | Yes                  | To the day (the segment)      | One new method; the profile supplies opening balance and totals |
| C. Totals only (opening plus sums equals closing)             | Yes                  | No: only "this file is wrong" | Weakest; an error anywhere gives the same answer                |

**Decision.** B, and amount columns are found from the amounts.

- **What a row is.** A row that only carries a balance (the starting balance, a balance brought forward at the top of a page) is not a `Transaction`. A balance-only row that comes before any transaction becomes `ParsedStatement.openingBalance`. Any other balance-only row is ignored: it is not a checkpoint and has no place in `ParsedStatement`; a lost page is caught by the printed totals instead. A checkpoint is a transaction with `balanceAfter`, or the opening balance. The total row and the closing-balance line are not transactions either.
- **Checkpoint method.** Transactions are read in printed order and each printed balance is checked against the previous checkpoint (the opening balance, or the last printed balance) plus the signed amounts of the segment: the rows after the previous checkpoint up to and including the checkpoint row. A broken segment gives `mismatch` naming the checkpoint row (a `Transaction.source` for a PDF). Credit accounts use the same sign rule as `reconcile` does today (a purchase raises the balance). The profile states that rows are printed oldest first, because the dates inside one day cannot show the order; dates that go backwards give `unverifiable`.
- **End anchor.** The checkpoints alone prove only that what was read is consistent, not that all of it was read. So the checkpoint method gives `verified` only when an anchor that does not come from the rows is also present and agrees: `printedTotals` (the withdrawals and deposits the statement prints, which must equal the sums of the parsed rows) or `closingBalance` (which must equal the last printed balance when the last row carries one, and otherwise the opening balance plus the net movement of all rows). `printedTotals` and `closingBalance` must be read from a labelled line of the statement (a total row, a closing-balance line), never copied from a row's own balance cell, or the check is true by construction; the profile's tests include a case that proves it. A statement has exactly one total row: finding several (page subtotals, another table's total) gives `unverifiable`. A page between table pages that the profile does not recognise counts as a dropped page and adds a warning. A profile declares which anchors it requires (TD chequing: opening balance, at least one checkpoint, printed totals); a missing required anchor gives `unverifiable`, never `verified`, so losing the total row or a whole last page cannot turn a failing check into a skipped one.
- **Warnings.** Any entry in `statement.warnings` gives `unverifiable` on this path, as it does for `running-balance` today. A page the parser drops (for example when the column rule below fails closed) must therefore add a warning.
- **Totals method.** A PDF statement with an opening balance and no row balances reports method `totals` (the existing meaning: opening plus net movement equals closing, and the printed totals equal the row sums); it needs a closing balance or printed totals as its anchor, and it cannot pinpoint a row.
- **Method selection** is one ordered rule on what the statement carries, and `running-balance` is for CSV only: (1) a PDF statement with an opening balance and at least one transaction with a balance gives `checkpoints`; (2) a PDF statement with an opening balance and no row balances gives `totals`; (3) a CSV whose every transaction has a balance gives `running-balance` (unchanged, used by every CSV in the tests; a CSV has no opening balance and no anchors); (4) anything else, including a PDF statement with no parsed opening balance, gives `unverifiable`. The profile does not choose the method. `running-balance` never reads anchors, which is why no PDF statement may use it.
- **Date order** is checked only when some row carries a balance (the checkpoint method). A `totals` statement whose dates are out of order can still be `verified`, because the printed totals do not depend on order (added after the review of the `reconcile` PR).
- **Verified** requires every check the method has, and every anchor the profile requires, to pass.
- **Stated limits** (anything that keeps a segment's sum goes undetected): two amounts swapped between rows of the same day; amounts paired with the wrong descriptions inside a day (a continuation line shifting the pairing by one); a same-day charge and its reversal both dropped or both added; a wrong row date (only the order of dates is checked). AC-2 (one row removed or altered) is still met. The recurring-charge finder reads descriptions and dates, so the parser needs its own tests for description-to-amount pairing; reconciliation does not cover it.
- **Amount columns.** The amount header labels give the names and the order, and each label's left edge starts its span: a span runs from its label's left edge to the next label's left edge (the last one has no end). In the table body, each amount-shaped item is assigned to the span that contains its **right** edge. The body runs from the header row down to the total row, or on a page without one to the last line that has an amount in a span (not the last dated line: rows that inherit the previous date are undated); amounts below it, such as a fees block, are not read. Items that lie left of the first amount label belong to the description and are never amounts, so an amount-like token inside a description is text. A span with no items is allowed (a page with withdrawals only is fine). The parse of a page fails closed, with a warning and no rows, when the right edges inside one span differ by more than 1 point (the column is not right-aligned). The dump shows right edges equal to within 0.1 point. This replaces "right-edge matching to the nearest header" in ARCHITECTURE §6.4.

**Consequences.** TD chequing statements can be Verified, with a bad row pinpointed to a day, which is what AC-1 and AC-2 need; the profile needs more fields (opening balance row, total row, row order). The types `Reconciliation` (method `checkpoints`, and a place for a PDF source in a mismatch) and `ParsedStatement` (`printedTotals`, and a profile-declared list of required anchors) change in the next PR, with tests including mutation tests (a removed, altered or added row inside a segment must give `mismatch`). Credit-card statements (CIBC, M7) are expected to print a balance differently; this ADR covers only what the TD dump showed.

**Revisit when** the other pages of the TD statements, or the CIBC dump, show a layout this method cannot verify.

---

## ADR-021 — Reframe: help the user read their transactions; verified numbers that stay on the device

**Status.** Accepted (2026-11-25; the owner delegated the design details). The direction is the owner's (2026-11-20). Proposed on 2026-11-20 with the details left until the description census; the census numbers and the details are below, under "Census result" and "Decoder design".

**Context.** The owner described a second persona who matters as much as the privacy-minded one: someone who spends freely, loses track of the total, and will not keep books because opening a statement shows lines they cannot read ("what is this charge?"). For this person, a recurring-charge list and a verified CSV answer questions they are not asking. Their question is "where did my money go, and what is this line?".

Two facts constrain the answer.

1. A chatbot can already read an uploaded statement and explain it, often better than rules can. So "smarter explanations" is not a position this project can hold. What a chatbot does not give: figures checked against the statement's own balances (it can drop or invent rows without saying so), no upload of the whole statement to a third party, and the same result every time. That is what ADR-004, ADR-001 and ADR-020 already provide.
2. Some descriptions cannot be decoded by anyone. A string with no merchant name in it carries no name to recover. The honest output for those is "unknown", plus what the surrounding data does show.

| Option                                                                                        | Helps the persona | Keeps ADR-001, ADR-013 | Cost                                                                       |
| --------------------------------------------------------------------------------------------- | ----------------- | ---------------------- | -------------------------------------------------------------------------- |
| A. Keep the plan: recurring charges and a CSV only                                            | Little            | Yes                    | None; the persona uses a chatbot instead                                   |
| **B. A rule-based decoder plus behaviour hints plus user labels, on top of verified numbers** | Yes               | Yes                    | A brand list and rules to build and test; honest "unknown" for the rest    |
| C. Train a model from scratch on transaction descriptions                                     | In theory         | Depends                | No labelled data exists to train on; synthetic data teaches only its rules |
| D. Call an LLM at runtime                                                                     | Yes               | **No**                 | Breaks ADR-013 and the privacy claim                                       |

**Decision.** B. The product gains a readout: drop in statements, see where the money went and what each line probably is.

- **What the decoder does.** (1) Rules strip payment-processor prefixes, store numbers, cities and reference codes. (2) A bank-code table explains the bank's own suffixes (the first TD dump shows one-letter suffixes such as `_V`); each meaning must be verified from the bank's public documentation before it is written down. (3) Fuzzy matching against a public brand list, only if a list with a suitable licence is found and recorded in `docs/RESEARCH.md`. (4) Behaviour hints from the verified ledger: how often a description repeats, its cadence, whether the amount is stable ("seen 6 times, monthly, always the same amount"). (5) Labels the user sets once ("this is my gym"), applied to every matching line in the session.
- **Unknown stays unknown.** A description with no match gets no guessed name. Each result carries its source (rule, bank code, brand list, behaviour, user label) and a confidence. Nothing is presented as fact that is a guess.
- **No runtime model, no training.** ADR-013 stands. Fuzzy matching and the rules are classic, deterministic code. A small embedded model may be reconsidered only through a new ADR, if a measurement shows the rules are not enough; it would add a dependency and download size.
- **Labels and privacy.** Labels live in memory (ADR-010). The user can download them as a file and load it next time. Nothing is stored by the app and nothing is sent anywhere.
- **Position.** The claim is verified numbers that never leave the device, plus a readable summary. It is not "better explanations than a chatbot". Public copy and the README must say so.
- **Not in scope.** Budgets, goals and spending categories stay out (PRD non-goals): that is where this persona gives up and where larger apps already compete.

**Measurement before design.** The owner runs `npm run census` (PR #26) on his real statements and shares the counts only: the share of descriptions that are readable text, carry a processor prefix, or are opaque codes, and how many repeat. The census heuristics are rough (a word with a vowel counts as readable, so the readable share is an upper bound). If most descriptions are opaque codes, behaviour hints, bank-code meanings and labels carry the feature and the brand list matters less; if most are readable names, the brand list and cleaning rules matter most. This ADR moves to Accepted, with the details filled in, after those numbers.

**Evaluation.** A hand-written descriptor suite with expected readings (invented strings shaped like real ones, never copied from a statement) and a printed report of how many each method decodes correctly, wrongly, or leaves unknown. A wrong decode counts worse than an unknown one.

**Census result (2026-11-25).** The owner ran the census on two consecutive real TD chequing statements of one account and shared counts only: 148 transactions, 104 distinct descriptions.

| Class (census heuristic)         | Transactions | Distinct | In descriptions seen 3+ times |
| -------------------------------- | ------------ | -------- | ----------------------------- |
| Readable-looking (upper bound)   | 131 (89%)    | 90       | 40                            |
| Code-like                        | 11 (7%)      | 11       | 0                             |
| Processor prefix                 | 6 (4%)       | 3        | 0                             |
| With a one-letter bank-code tail | 91 (61%)     |          |                               |
| With a run of 6+ digits          | 10           |          |                               |

ADR-026 later recovered two overdrawn-balance rows the parser had dropped (150 transactions); the census ran before that fix, and two rows do not change any conclusion. The shapes the owner described, given here only as invented stand-ins: a brand followed by an asterisk, an amount and a `_V` tail (`NAME* 31.64_V`); a transfer with a reference (`WO232 TFR-FR 6988562`); a processor prefix (`SP NAME ... _V`); a leading asterisk (`*PARKING ...`).

What the numbers say:

1. Most lines are readable text with noise around it. Cleaning rules decide most of the result; a brand list adds a canonical name on top of the cleaned text.
2. The one-letter tail is on 61% of lines. It must be stripped before grouping, or one merchant splits into several keys. Its meaning is a separate question (below).
3. Code-like lines are few (7%) and none repeats in two months, so behaviour hints rarely rescue them in a short window. They stay unknown, with the hints shown when there are any.
4. Only 27% of transactions belong to a description seen 3+ times. Behaviour hints and recurring detection need more months; two statements are a small sample.

**Decoder design.** All of it lives in `src/core/merchant/`: pure TypeScript, no DOM, no I/O, no randomness, no dependency on time. The same descriptions, bank-code table, brand table and labels always give the same readings.

1. **Normalise.** Upper-case, collapse whitespace, drop punctuation that does not separate words (`'`, `.`). The printed description stays untouched on the transaction; the decoder works on a copy.
2. **Bank-code tail.** A trailing `_X` (underscore and one letter, at the end) is cut off and kept as `bankCode`. Its meaning comes only from the bank profile's `bankCodes` table, and an entry may be added only with a public source from the bank recorded in `docs/RESEARCH.md` §13. No such source was found for TD (§13), so TD's table is empty and the readout shows the raw letter with "meaning not known". Cutting it off changes grouping only, never the reading.
3. **Cleaning rules, in this order.** Each rule records what it removed, so the UI can show why a reading looks the way it does. (a) Processor prefix (`SQ *`, `TST*`, `PAYPAL *`, `SP ` and the like, a hand-written list): removed and kept as `processor`, which also drives FR-14's ambiguous flag. (b) A leading `*`. (c) An amount glued to the name after an asterisk (`NAME* 31.64`). (d) Store numbers (`#1234`, `STORE 1234`). (e) Runs of 5 or more digits and mixed letter-digit reference codes (`WO232`, `6988562`). (f) A trailing Canadian city or province word from a short list. What is left is the `merchantKey`, which recurring detection groups by and labels match on. Bank words such as `TFR-FR` stay in the key: they are not decoded, because their meaning is not verified either, but removing the reference after them lets repeated transfers group.
4. **Reading, by fixed precedence, not by weights.** User label, then brand table, then cleaned text, then unknown. The first one that applies is the reading, and it names its one source. There is no blended score: a weighted sum of rule scores has no meaning a user can check, and it invites tuning the weights to the evaluation suite. Confidence follows the source: `user` (the user said so), `high` (exact brand-table match), `medium` (cleaned text that still looks like a name: a word of four or more letters with a vowel, the census test). Cleaned text that fails that test is `unknown`.
5. **Brand table.** Exact match only, on whole words: the key equals a brand's match form, or starts with it followed by a space. No edit-distance fuzzy matching in the first version; a near miss stays medium-confidence cleaned text, which is a smaller error than a wrong brand. Fuzzy matching may be added only when the evaluation shows misses it would fix and the wrong count does not rise. Source: the OpenStreetMap name-suggestion-index (BSD-3-Clause, `docs/RESEARCH.md` §13), filtered at build time by a script in `tools/` to entries whose location set includes Canada, and to shop, restaurant, café, fuel and pharmacy kinds. The output is a generated, committed `src/core/merchant/brands.ts` that carries the BSD notice; the README credits it. It is data, not an npm dependency. Online services (streaming, app stores, software) are not in that index; a hand-written alias table covers them, and each alias needs a public source that shows the descriptor (the merchant's own billing help page), never the owner's statements.
6. **Behaviour hints.** Computed from the verified ledger per `merchantKey`: how many times it appears, its cadence (the same buckets as `recurring/`), whether the amount is stable (7.5% or $1, as ADR-014), first and last date. A hint is shown next to the reading ("seen 6 times, monthly, same amount") and is never turned into a name, including for unknown lines. Hints from a statement that is not `verified` say so.
7. **User labels.** A label maps one `merchantKey` to a name the user typed and applies to every line with that key in the session. Labels live in memory (ADR-010). The user can download them as a JSON file and load the file next time; loading validates the whole file and applies nothing if any part is malformed. A label file holds only keys and names, no amounts or dates.

**Data shapes.** In `src/core/merchant/types.ts`:

```ts
type ReadingSource = "user" | "brand" | "rule";
type Reading =
  | {
      kind: "name";
      name: string;
      source: ReadingSource;
      confidence: "user" | "high" | "medium";
    }
  | { kind: "unknown" };
interface Decoded {
  merchantKey: string; // cleaned key; grouping and label key
  reading: Reading;
  processor?: string; // from the prefix rule; FR-14
  bankCode?: { code: string; meaning?: string }; // meaning only from a sourced table entry
  removed: string[]; // what the cleaning rules cut, in order
}
interface BehaviourHint {
  merchantKey: string;
  count: number;
  cadence?: "weekly" | "biweekly" | "monthly" | "quarterly";
  amountStable: boolean;
  first: PlainDate;
  last: PlainDate;
  verified: boolean; // every occurrence came from a verified statement
}
interface Brand {
  name: string;
  match: string[];
} // generated brands.ts
interface LabelFile {
  version: 1;
  labels: { key: string; name: string }[];
}
```

The bank-code table is a field of the bank profile (`bankCodes: Record<string, { meaning: string; source: string }>`, empty for TD), so adding a bank still needs no change to `merchant/`. `src/ui/` holds the label state and does the file download and the file picker; `src/core/merchant/labels.ts` only parses and serialises.

**Evaluation (details).** The descriptor suite is a committed list of at least 100 invented descriptions in the census mix (about 85 readable, 10 code-like, 5 processor-prefixed; most with a one-letter tail), each with its expected reading or `unknown`. The test prints, per source, how many are correct, wrong and unknown. A wrong reading is a shown name that differs from the expected one, or any name on a line expected to stay unknown. The thresholds are in `docs/PRD.md` AC-16.

**No embedded model by default.** The answer to "a small embedded model" is no. The census shows the problem is mostly cleaning readable text, which rules do deterministically; the 7% of code-like lines carry no name for a model to recover either. A model would add download size, a dependency and output that cannot be explained per line. Reconsider only through a new ADR, and only if AC-16 cannot be met by rules.

**Consequences.** M2 grows from "recurring detection" to "decoder plus recurring detection plus where the money went"; the `merchant/` stage in ARCHITECTURE §6.7 becomes the decoder. M3's main screen becomes the readout, with the recurring list as one section. M5 to M7 (PDF parsing and verification) are unchanged and still come first: the decoder needs correctly read transactions. ADR-013 and ADR-001 are unchanged.

**Revisit when** the census shows that nearly all descriptions are opaque and no behaviour hint or label route is usable, or a licence-compatible brand list cannot be found, or a measurement shows the rules decode too few lines to be useful.

---

## ADR-022 — Prose rules become lint and coverage checks

**Status.** Accepted (2026-11-20).

**Context.** An audit found rules that lived only in prose (CLAUDE.md, ADR-001, ADR-010, ADR-011, ADR-015) with nothing checking them. ADR-015 said `noSkippedTests` was on; it is not in Biome's recommended preset. A rule an agent can break without a red build is a suggestion.

**Decision.** Enforce them in `biome.json` and `vite.config.ts`, so `npm run verify` fails on a violation. Each message names the fix.

| Was prose                                                                                    | Now                                                                                                                                                                                                                                                                                                                                                                                       |
| -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Never skip a test (ADR-015)                                                                  | `suspicious/noSkippedTests`                                                                                                                                                                                                                                                                                                                                                               |
| No network calls, no browser storage; statement data stays in the browser (ADR-001, ADR-010) | `style/noRestrictedGlobals` in `src/**`: `fetch`, `XMLHttpRequest`, `WebSocket`, `localStorage`, `sessionStorage`, `indexedDB`                                                                                                                                                                                                                                                            |
| No `Date` for transaction dates (ADR-011)                                                    | `noRestrictedGlobals` adds `Date` in `src/core/**`, tests excepted (they use `Date.UTC` as an oracle)                                                                                                                                                                                                                                                                                     |
| No effects or timers in product code                                                         | `noRestrictedImports` bans `useEffect` and `useLayoutEffect` from `react` outside `src/core/`; `noRestrictedGlobals` bans `setTimeout`, `setInterval`, `requestAnimationFrame`, `requestIdleCallback`. A deferral hides an ordering bug: fix the ordering, derive during render, or use an event handler. If a helper layer is ever needed, add it as a narrow override through a new ADR |
| `reconcile.ts` must not know a bank (NFR-6)                                                  | `noRestrictedImports` on `src/core/reconcile.ts` for `profiles/`                                                                                                                                                                                                                                                                                                                          |
| Core line coverage at least 90%                                                              | `test.coverage.thresholds.lines: 90` for `src/core/**`; `npm test` runs with coverage, so `verify` enforces it                                                                                                                                                                                                                                                                            |

**Not enforced yet.** `src/core/parse/parse.ts` imports the `BankProfile` type from `profiles/types`. Biome cannot allow type-only imports in a pattern, so a rule on `parse/**` would fail today. Whether that type should move to `src/core/types.ts` is a separate decision.

**Consequences.** A real need for one of the banned APIs means changing `biome.json` through a PR, which is the point. Branch coverage (93%) is reported but not gated.

---

## ADR-023 — One routing page for installed skill packs

**Status.** Accepted (2026-11-20).

**Context.** Two skill packs are installed at user scope (`agent-skills:`, `ecc:`), plus others. Their descriptions overlap, a session-start hook says to invoke any skill with a 1% chance of applying, and several skills contradict this repo: `observability-and-instrumentation` (ADR-001), `documentation-and-adrs` (the `DECISIONS.md` format), examples with `useEffect`, `networkidle`, `test.skip` and per-slice commits (ADR-022, ADR-015). Left alone, each session picks differently and spends tokens on skills that fight the checks.

**Decision.** `.claude/rules/skill-selection.md` maps task types to at most one skill, lists the skills that are manual only or not used (with the reason), names the review agents, and says repo checks and `CLAUDE.md` beat skill examples. Every name in it was checked on disk and the check date is in the file.

**What it replaces.** Nothing in the repo: no check enforces skill choice, so this stays prose by design (judgment, not a lint rule). It does not weaken ADR-022: where a skill's example would break a lint rule, the page says to drop that part. A skill that misleads twice is removed from the page or fixed by a check, not annotated.

**Consequences.** Adding or upgrading a pack means re-checking the names and the date. The file is under `.claude/`, so changes go through a PR with the `reviewer` on `opus`.

---

## ADR-024 — Close the skill-routing loophole with a required step and a template

**Status.** Accepted (2026-11-20).

**Context.** A fresh session answered that for the PDF-upload UI (#28) it would not invoke the routed `frontend-ui-engineering` and `security-and-hardening` skills, citing ADR-023 policy 2 ("only if it would materially change the work"). The policy was a judgment call, so skipping always looked defensible. The same audit found `ship-task` lacked a statement of intended behaviour, property tests for invariants, UI run evidence, a doubt pass on parse and reconcile, and any outcome tracking.

**Decision.** Policy 2 now makes the two routed skills required for file handling, CSP, pdf.js, CSV export and `src/ui/`. `ship-task` gains five steps: state intended behaviour first; a fast-check property test for logic with invariants; a Playwright screenshot of each affected UI state (synthetic data only); `agent-skills:doubt-driven-development` for `reconcile.ts` and `parse/`; and a session-log line per PR with review rounds and first-run CI result. The PR template gains "Skills used" and "Evidence" sections, so a skipped skill or missing screenshot is visible to the reviewer. Tasks stay sequential until about five consecutive PRs merge after one review round.

**Why not more prose.** No lint can see whether a skill was invoked, so the next best thing is a field the author must fill and the `reviewer` can check. The steps are procedure, not new absolute rules.

**Consequences.** The `reviewer` checklist checks the new PR fields. `ship-task` was renumbered: ADR-017's "steps 7 and 10" are now steps 10 and 13. `fast-check` is approved in `.claude/hooks/approved-deps.json` but not yet in `package.json`; the first property test adds it. The change is under `.claude/`, so it goes through a PR with the `reviewer` on `opus`.

---

## ADR-025 — Statement chaining: each statement's closing balance against the next one's opening balance

**Status.** Accepted (2026-11-20).

**Context.** One CSV file has no opening balance, so `running-balance` cannot check the first row's amount or see a row removed from either end of the file (pinned in `reconcile.test.ts`). AC-2 therefore holds for CSV only for middle rows. A verified PDF covers its own ends (opening balance, printed totals; ADR-020), but nothing notices a missing statement between two PDFs whose periods do not leave a whole empty month. `ledger.ts` and `reconcile.ts` both point to a chain check that does not exist yet.

| Option                                                                                  | Covers CSV ends    | Missing statement       | Cost                                                     |
| --------------------------------------------------------------------------------------- | ------------------ | ----------------------- | -------------------------------------------------------- |
| A. Do nothing; reword AC-2 to "middle rows"                                             | No                 | Only whole empty months | None                                                     |
| **B. Chain adjacent statements of one account, in core, from verified statements only** | Yes, between files | Yes, by balance         | One pure function and its tests                          |
| C. Re-run `running-balance` over the merged, de-duplicated ledger                       | Yes                | Yes for CSV             | Breaks with PDFs (checkpoints) and depends on dedup luck |

**Decision.** B.

- **What the balance fields mean.** `ParsedStatement.openingBalance` and `closingBalance` hold only figures printed on the statement (PDF). They are never derived and a CSV never sets them; that keeps ADR-020's "anchors are not read from the rows" true. The chain uses each statement's **ends**, computed inside the chain module and only from a statement whose `reconcile` is `verified` (any other status: no ends, fail closed):
  - PDF: opening = `openingBalance`; closing = opening + step × (sum of amounts), step −1 for credit as in `reconcile`. For a verified statement this equals the printed closing balance when one was read, and the last printed balance when the last row carries one.
  - CSV: rows in time order (the date direction `running-balance` already uses; reversed for a newest-first file). Opening = first row's `balanceAfter` − step × its amount; closing = last row's `balanceAfter`. Every date the same: no ends ("the order of the rows, and so the file's first and last row, is unknown").
  - The derived CSV opening is not trusted on its own. Agreement with the previous statement's closing is the evidence, and it is exactly the check that covers the first row.
- **Accounts.** The chain runs on the statements of one account; grouping is the caller's job and the key is the account the user chose in the UI (`ImportedFile.account`, as `summarize` does today). Core does not infer, merge or split accounts, and never reads an account number. A balance that chains is not evidence that two files are one account, and a break never moves a file. Inside a group, a pair whose `kind` differs, or whose `bankId`s are both known and differ, is `unchainable`. Statements with the same `id` count once.
- **Order and pairs.** Sort by `period.start`, then `period.end`, then `id`. Walk in order, keeping `prev` = the statement with the latest end so far (as `missingMonths` does), and judge each next statement against `prev`. Set `prev = next` when `next.end >= prev.end`. Each pair gets one outcome:
  1. `unchainable` when the pair is mixed (above), when either side has no ends (reason names which and why), or when they overlap. Overlap: `next.start < prev.end`, or the two share their boundary day and either is a CSV. A PDF period is printed and banks share the boundary day (SEP 01 to OCT 01, then OCT 01 to NOV 01), so for two PDFs a shared day is adjacency. A CSV period is its first and last row date, so a shared day may mean the same rows are in both files.
  2. `chained` when `prev` closing equals `next` opening, exactly in cents.
  3. `gap` when they differ and `daysBetween(prev.end, next.start) > 1`: money moved that neither file shows, probably a missing statement.
  4. `mismatch` when they differ and the periods touch: a row at the end of one or the start of the other is missing or wrong.
- **Effect on verified rows.** `reconcile` and `Reconciliation` do not change; a boundary never changes a statement's own status. Each statement gets `ends: { start, end }`, true when that end is checked. A verified PDF: both true (its own anchors). A verified CSV: `start` is true when a boundary with it as `after` is `chained`, and `end` is true when a boundary with it as `before` is `chained`. Anything not verified: both false. The UI shows "Verified" for a CSV only when both are true, and otherwise "Verified, except the start (or end) of the file: no adjacent statement of this account to check it against". Each non-`chained` boundary is listed under its account with both file names. For `gap` and `mismatch` it also shows `expected` (prev closing) and `actual` (next opening), and for `unchainable` the reason. Statement text goes through React only.
- **Code.** A new file `src/core/chain.ts`, pure, importing only `./reconcile`, `./plainDate` and `./types` (no `profiles/`, `parse/`, `pdf/`, `ui/`). `buildLedger` adds `chain: chainStatements(statements)` to `Ledger`; `summarize` passes it through per account. `ledger.ts` stays the merge, `chain.ts` the balance check, and `missingMonths` is unchanged.

```ts
export type BoundaryOutcome =
  | { readonly status: "chained" }
  | {
      readonly status: "gap" | "mismatch";
      readonly expected: Cents;
      readonly actual: Cents;
    }
  | { readonly status: "unchainable"; readonly reason: string };

export interface Boundary {
  /** Statement ids; `before` is the earlier period. */
  readonly before: string;
  readonly after: string;
  readonly outcome: BoundaryOutcome;
}

export interface AccountChain {
  /** In period order. */
  readonly boundaries: readonly Boundary[];
  /** Per statement id: whether its start and end are covered, by its own anchors or a chained neighbour. */
  readonly ends: Readonly<
    Record<string, { readonly start: boolean; readonly end: boolean }>
  >;
}

/** One account's statements, any order. Pure; the caller groups by account. */
export function chainStatements(
  statements: readonly ParsedStatement[],
): AccountChain;
```

- **Tests** (`src/core/chain.test.ts`, invented data only, ParsedStatements built in the test, no real statement):
  - Examples: two adjacent CSVs chain. Each mutation below gives `mismatch` at that boundary while each file's own `reconcile` stays `verified` (which pins that the chain is what catches it): the first row of the later file removed, the last row of the earlier file removed, the first row's amount of the later file altered by one cent. The earliest file's first row removed: still verified, `ends.start` false (the stated limit). A newest-first CSV uses its time-order ends. Every date the same: `unchainable`. Two PDFs sharing the boundary day chain, and with the middle one dropped give `gap`. A CSV pair sharing a day, or overlapping: `unchainable`. A contained statement is judged against the containing one, and the next statement against the latest end. An unverified middle statement makes both of its boundaries `unchainable`. Mixed kind, or two known banks, gives `unchainable`. The same id twice counts once. The credit sign works.
  - fast-check properties (generator: a random account history of signed cents, split into 2 to 6 contiguous statements, each built as a CSV with balances or a PDF with opening balance and printed totals): (1) unmutated: every boundary `chained`, and every `ends` true except the earliest CSV's start and the latest CSV's end; (2) the result does not depend on input order; (3) removing any single row, or altering its amount or balance by one cent, leaves some statement not `verified` or some boundary not `chained`. The only exceptions are the earliest CSV's first row (removed, or its amount altered) and the latest CSV's last row (removed), and the property asserts that those exact cases stay undetected, so a later change to them is seen. Each statement has at least three rows, so one removal never leaves a file too short to check; (4) dropping a middle statement with non-zero net movement never leaves its replacement boundary `chained`.
- **Stated limits.** A missing stretch whose net movement is zero (a charge and its refund) chains. The outer ends of an account (the earliest CSV's start, the latest CSV's end) cannot be checked, and they are labelled. Overlapping CSV exports are de-duplicated by the ledger but not chained. If a CSV user hits this, the fix is to export non-overlapping ranges, not to guess.

**Consequences.** AC-2 holds for every CSV row that has a verified, adjacent statement of the same account on that side, and the rest is labelled. Missing PDF statements surface as `gap` even when no whole month is empty. The UI change (status wording and boundary list) is part of #31 and needs the routed `frontend-ui-engineering` skill. `doubt-driven-development` applies because the chain extends reconciliation (`.claude/rules/skill-selection.md`). The comments in `ledger.ts` and `reconcile.ts` that call the chain future work are updated in the same PR.

**Revisit when** a real export or statement shows ends this rule cannot use: overlapping monthly CSVs that are common in practice, or a bank whose next opening balance is not the previous closing.

## ADR-026 — TD chequing prints a total row on every page, and overdrawn balances with a suffix

**Status.** Accepted (2026-11-25; the owner delegated the decision). Supersedes, for this profile, ADR-020's rule that "a statement has exactly one total row".

**Context.** The parser ran on real statements for the first time (two TD chequing statements of the same account, 2026-11-25; masked structure only, no contents seen). Both parsed (148 rows in all) and both came out `unverifiable`. The masked line structure showed why:

1. **Every table page ends with a `Total` row** at the same place on the page, giving that page's withdrawals and deposits. It is not a running total: on one statement the deposits on page 2's total are smaller than on page 1's. On every page but the last, the row is drawn twice at the same spot (the overdraw `normalize` already merges). On the last page it is drawn once right after the last row and once more at the usual spot, with the same figures, so it shows as two lines. `parse` counted every one of these, found more than one total row, and dropped the totals as ADR-020 requires; the required anchor was then missing.
2. **A balance can carry a two-letter suffix** after the amount (masked as `99.99XX`; the mask keeps a `CR` or `DR` suffix, so it is neither). It appeared on a starting balance and on a last row of a day. It is almost certainly `OD`, overdrawn, but this is not confirmed: the letters are masked. `parse` treats any non-amount in the amount area as text it cannot place, so it warned, and for the statement whose starting balance carried it the opening balance was not read either.

Other facts from the same structure: every table page repeats the column header at the same height; pages 2 and later start with a balance-only row (a balance brought forward), which ADR-020 already ignores; a summary block with amounts sits below each page's total and is not part of the table; descriptions may carry a short second item to their right (already read as description).

| Option                                                                                                                  | Verifies these statements | Missing last page                      | Cost                                   |
| ----------------------------------------------------------------------------------------------------------------------- | ------------------------- | -------------------------------------- | -------------------------------------- |
| A. Keep "exactly one total row"                                                                                         | No                        | n/a                                    | The owner's statements stay unverified |
| **B. Read one total per page; the statement total is their sum; the last page is the one whose total is printed twice** | Yes, if the guesses hold  | Caught: no page carries the end marker | Parse and profile change, no new types |
| C. Per-page totals checked page by page in `reconcile`                                                                  | Yes, and names the page   | Same as B                              | New `ParsedStatement` field and checks |

**Decision.** B, with C left for later if a page needs to be named in a mismatch.

- **Page totals.** On a profile with `pageTotals: true`, each table page's `Total` rows are that page's subtotal. Every `Total` line on one page must read the same withdrawals and deposits; if they differ, or one cannot be read, the page adds a warning. A table page with transactions and no total adds a warning. `printedTotals` is the sum, over the table pages, of each page's total: figures printed on labelled rows, added up, never computed from the transaction rows, so ADR-020's anchor rule still holds. The body of a page still ends at its first `Total` line.
- **End marker.** A truncated file that lost its last page would still have matching page totals, so per-page totals alone cannot be the end anchor ADR-020 asks for. On TD the last page is the only one whose total appears on two separate lines (`lastPageRepeatsTotal: true`). `printedTotals` is set only when the last table page has that repeat and no earlier page does; otherwise a warning ("the last page of the statement was not found"). Both statements show the pattern, so it is an observation from two samples, not a documented rule: a statement without it fails closed.
- **Overdrawn suffix.** A profile may name a suffix that marks a negative balance (`overdrawnSuffix: "OD"` for TD). Only in the balance column, and only as an amount followed directly by the suffix: the value is the negated amount. The same token in the withdrawals or deposits column, or any other suffix, is still text that cannot be placed (warning). Such an item is left out of the right-alignment check, because the suffix moves its right edge; it still belongs to the balance span, which is the last span and has no right end.
- **Why a wrong guess cannot show a false Verified.** If the suffix does not mean negative, the checkpoint after that row breaks and the statement gives `mismatch`. If the letters are not `OD`, the item stays unplaced and the statement gives `unverifiable`. If the totals were running totals rather than page subtotals, their sum would exceed the row sums and give `mismatch`. If the last page were not marked by a repeated total, no statement would be verified (`unverifiable`), never wrongly verified.
- **Generator.** `tools/makeTdStatement.ts` draws the real layout: a total on every page at a fixed height, the last page's total repeated, a balance-forward row at the top of pages 2 and later, a summary block with amounts below each total, and optionally an `OD` balance. Golden, mutation and property tests run on it.

**Consequences.** The two real statements should verify, or fail on a named, smaller problem; the owner re-checks them on his machine (statements never reach Claude). `parse` gains two profile switches; `reconcile` and the types do not change. A future profile that prints one total at the end leaves `pageTotals` off and keeps ADR-020's single-total rule.

**Stated limit (found in review).** A page missing from the middle of the extracted document is caught only through the balances: its rows' net change breaks the next checkpoint. A missing middle page whose rows net to exactly zero still verifies, because the page totals cover only the pages that were read and the end marker proves only that the end is there. The real dumps show no page-number line to check `1..n` against. A single end-of-statement total would have caught it; TD does not print one. The opening balance is read only from the row the profile labels (`openingLabel`, TD: `STARTING BALANCE`), so a lost first page cannot pass a balance brought forward off as the opening.

**Revisit when** a TD statement fails on the end marker or the suffix, when a page-number or statement-total line is found in a dump, or when a page needs to be named in a totals mismatch (option C).
