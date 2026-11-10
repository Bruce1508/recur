# Architecture Decision Records

**Date of all records:** 2026-11-10 · **Decider:** Bruce Vo · Evidence for each decision is in `docs/RESEARCH.md`.

A record is changed only by adding a new record that supersedes it. Statuses: Proposed, Accepted, Superseded.

| # | Decision | Status |
|---|---|---|
| 001 | Client-only static app; no backend, no telemetry | Proposed |
| 002 | `pdfjs-dist` for PDF text extraction | Proposed |
| 003 | Header-anchored column geometry for parsing | Proposed |
| 004 | Balance reconciliation is a hard gate; fail closed | Proposed |
| 005 | Redacted positioned-text fixtures; no real PDFs anywhere | Proposed |
| 006 | MIT licence; independent implementation; monopoly as a reference for facts only | Accepted (choice delegated by the owner, 2026-11-10) |
| 007 | React + Vite + TypeScript | Proposed |
| 008 | No custom Web Worker in the MVP | Proposed |
| 009 | Cloudflare Pages, with a host-independent CSP | Proposed |
| 010 | In-memory state only | Proposed |
| 011 | Integer cents and plain date strings | Proposed |
| 012 | TypeScript 7 + Biome + Vitest + Playwright, npm, Node 24 | Proposed |
| 013 | No LLM in the product path | Proposed |
| 014 | Rule-based recurring detection | Proposed |
| 015 | Autonomous PR workflow and Claude Code automation | Accepted |
| 016 | Real statements live outside the repository | Accepted |

All records become Accepted when Bruce signs off on the PRD.

---

## ADR-001 — Client-only static app; no backend, no telemetry

**Context.** The product asks people to hand over bank statements. Budget is $0. The differentiator against existing tools is that nothing is uploaded.

| Option | Cost | Privacy story | Effort |
|---|---|---|---|
| **A. Static app, all processing in the browser** | $0 | Strong and checkable by the user | Medium |
| B. Small backend that parses PDFs | Hosting cost; scales with users | "Trust us" | Lower for parsing (Python libraries exist) |
| C. Static app plus privacy-friendly analytics | $0 | Weakened: a third-party request exists | Low |

**Decision.** A. No server code, no analytics, no error reporting service.

**Consequences.** Marginal cost stays near zero and the privacy claim is testable. We cannot count users or see crashes; success is judged by proxy metrics and by issues people choose to file. PDF parsing must work in JavaScript.

**Revisit when** the lack of crash data blocks debugging. The first step would be a user-initiated "copy diagnostic report", not telemetry.

---

## ADR-002 — `pdfjs-dist` for PDF text extraction

**Context.** The parser needs each text fragment with its position, plus document metadata, in the browser.

| Option | Licence | Positions | Size / fit | Risk |
|---|---|---|---|---|
| **A. `pdfjs-dist` 6.5.438** | Apache-2.0 | Yes | 1.3 MB worker; runs in browser and Node | Low: Mozilla-maintained |
| B. `unpdf` 2.1.0 | MIT | Via its bundled pdf.js | Extra layer; Node ≥ 24 | Low |
| C. MuPDF.js 1.28.6 | AGPL-3.0-or-later | Yes | 14.3 MB package | Licence forces AGPL |
| D. Pyodide + Python parsers | Mixed | No | > 14 MB before PDF libraries; PyMuPDF's Pyodide build is experimental | High |
| E. `pdf-oxide-wasm` 0.3.77 | MIT/Apache-2.0 | Not evaluated | Unknown | Unverified claims |

**Decision.** A, used directly and isolated in `src/pdf/extract.ts`.

**Consequences.** The low-level API means we own line and column reconstruction. Swapping libraries later touches one file. pdf.js is called from the main thread and uses its own worker.

**Revisit when** a real statement extracts badly (missing spaces, garbled characters) and configuration cannot fix it. Evaluate option E first.

---

## ADR-003 — Header-anchored column geometry for parsing

**Context.** Statement transactions are tables. Three ways to recover them were considered.

| Option | Robustness | Reuse of prior art | Effort |
|---|---|---|---|
| **A. Use item x-positions; derive columns from the header row on each page** | Survives spacing changes; fails visibly if the header moves | Technique validated in the spike | Medium |
| B. Rebuild fixed-width layout text and apply regular expressions (monopoly's approach) | Sensitive to exact whitespace, which we would be approximating | Could mirror monopoly's patterns, but that would make this project AGPL | Medium |
| C. Generic table detection with no bank knowledge | Works on unknown banks, unreliable on details like signs and multi-line rows | None | High |

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

| Option | Realism | Privacy | Notes |
|---|---|---|---|
| A. Commit real PDFs | Highest | Unacceptable | — |
| B. Commit only synthetic PDFs | Low: misses real quirks | Safe | Useful for end-to-end tests |
| **C. Commit redacted extraction output (JSON of positioned text) from real PDFs, plus synthetic PDFs for end-to-end** | High for parsing logic | Safe after review | Idea adapted from monopoly's contributor guide |

**Decision.** C. A local CLI turns a PDF into a redacted fixture: dates, amounts and structural labels are kept; each distinct description becomes a stable placeholder; other digit runs are masked. Real PDFs live in a gitignored `private/` folder that AI tools are denied from reading.

**Consequences.** Contributors can add a bank without sharing a statement. Fixtures do not exercise pdf.js itself; synthetic PDFs and manual checks cover that seam. Redaction needs human review before every commit.

**Revisit when** a bug depends on raw PDF structure that the JSON cannot capture.

---

## ADR-006 — MIT licence; independent implementation; monopoly as a reference for facts only

**Context.** monopoly (AGPL-3.0) already encodes rules for the five big Canadian banks. Copying or porting its code would make this project a derivative work and therefore AGPL. This record is an engineering judgement, not legal advice.

| Option | Speed | Freedom for others to reuse | Legal clarity |
|---|---|---|---|
| **A. MIT; write parsers independently; consult monopoly, bankstate and Teller only for facts about formats** | Slower than copying; but the chosen technique (ADR-003) is different anyway, so little is lost | Maximum | Clear if the no-copy rule is followed |
| B. AGPL-3.0; port monopoly's patterns freely | Faster in theory; in practice the patterns target poppler's layout text and are untested for Canadian banks | Limited | Clear |
| C. MIT while porting code anyway | — | — | A licence violation |

**Decision.** A. The repository rule is: never copy code or regular expressions from AGPL, GPL or unlicensed projects. Reading them to learn how a statement is laid out is fine. Credit them in the README. Code from MIT projects (bankstate, Actual Budget) may be adapted with attribution.

**Consequences.** Others can reuse the parsers freely. The rule must be explicit in `CLAUDE.md`, because an AI assistant shown AGPL code may reproduce it. While Bruce is the sole copyright holder he can still relicense to AGPL later if he decides direct porting is worth it; that door closes once outside contributions arrive.

**Decided 2026-11-10:** MIT. The owner delegated the choice; status Accepted.

---

## ADR-007 — React + Vite + TypeScript

**Context.** The UI is small: a drop zone, three result views, a few panels.

| Option | Bundle | Familiarity | Signal to reviewers |
|---|---|---|---|
| **A. React 19 + Vite 8** | Larger framework, negligible next to pdf.js | Bruce already uses React | Widely recognised |
| B. Preact or Svelte | Smaller | New to learn | Fine, less common in target employers |
| C. No framework | Smallest | — | More hand-written DOM code |

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

| Option | Works today | Tools to manage |
|---|---|---|
| **A. TypeScript 7.0.x + Biome 2.6** | Yes | One tool for lint and format |
| B. TypeScript 6.0.x + ESLint + Prettier | Yes | Three tools; older compiler |

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

| Option | Explainable | Data needed | Effort |
|---|---|---|---|
| **A. Group by normalised merchant, classify the median gap into cadence buckets, score consistency** | Yes | 3+ occurrences | Medium |
| B. Port Actual Budget's candidate-pattern matcher | Yes | 3 occurrences | Medium–high: must replace its query layer and recurrence library |
| C. Statistical or learned model | No | Labelled data we do not have | High |

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
