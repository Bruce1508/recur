# Technical Research

**Research date:** 2026-11-10 (all versions, star counts and dates below are as of this day)

## 0. Method and limits

How each kind of fact was checked:

- **Repositories:** shallow-cloned and read directly (licence file, source, tests, last commit date). Star counts were read from the public repository pages, because the GitHub API was rate-limited from the research machine.
- **Packages:** `npm view <pkg>` against the public npm registry for version, licence, engines, peer dependencies and publish date.
- **Behaviour:** a throwaway spike ran `pdfjs-dist` and `papaparse` locally (§4, §8).
- **Docs:** official pages for Cloudflare Pages, PyMuPDF, Node.js and Claude Code.

Not done, and stated where relevant:

- No real bank statement was available, so nothing here proves behaviour on real Canadian statements.
- Closed-source web tools could not be tested.
- GitHub-wide code search was unavailable, so small or new repositories may have been missed.
- Market facts in §1 are carried over from the earlier gap analysis and were not re-checked today.

## 1. Problem context (carried over, not re-verified today)

From the November 2026 gap analysis: Rocket Money states it is available only to US users with US banks; Canadian subscription detectors rely on bank connections and are mostly paid or freemium; PDF-to-CSV statement converters are mostly paid SaaS that upload files. Re-verify each claim before using it in the README or any public post.

## 2. Existing open-source projects

| Project                                                                                    | Stack                                             | Licence         | Stars  | Last commit                         | Canadian banks                                                                                   | Client-side?                                       | Finds subscriptions?                                |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------- | --------------- | ------ | ----------------------------------- | ------------------------------------------------------------------------------------------------ | -------------------------------------------------- | --------------------------------------------------- |
| [benjamin-awd/monopoly](https://github.com/benjamin-awd/monopoly) (`monopoly-core` 0.23.6) | Python, PyMuPDF, poppler `pdftotext`              | AGPL-3.0        | 437    | 2026-11-02                          | RBC, TD, Scotiabank, BMO, CIBC (credit and debit); Canadian Tire and Capital One Canada (credit) | No                                                 | No                                                  |
| [benjamin-awd/StatementSensei](https://github.com/benjamin-awd/StatementSensei) (0.10.11)  | Streamlit UI over monopoly; Tauri desktop wrapper | AGPL-3.0        | 202    | 2026-11-03                          | Same as monopoly                                                                                 | No (server-hosted Streamlit, or a desktop install) | No                                                  |
| [jeremysquires/bankstate](https://github.com/jeremysquires/bankstate) (0.3.0)              | Python, pypdf, PyMuPDF                            | MIT             | 6      | 2026-11-09                          | BMO and RBC (account and card)                                                                   | No                                                 | No                                                  |
| [Bizzaro/Teller](https://github.com/Bizzaro/Teller)                                        | Python → SQLite/CSV                               | None detected   | 69     | Oct 2023 (per GitHub topic listing) | Credit cards: BMO, TD, RBC, Manulife, Amex                                                       | No                                                 | No                                                  |
| [mwallis45/Bank-PDF-To-CSV](https://github.com/mwallis45/Bank-PDF-To-CSV)                  | Pyodide 0.25.0 + pypdf in the browser             | No licence file | 0      | 2026-10-29                          | **None** (Monzo, Lloyds, Barclays)                                                               | Yes                                                | No                                                  |
| [ardalann/statement2csv](https://github.com/ardalann/statement2csv)                        | Create React App, `pdfjs-dist` ^2.1               | GPL-3.0         | 33     | 2020-09-14                          | None found in source                                                                             | Yes                                                | No                                                  |
| [actualbudget/actual](https://github.com/actualbudget/actual)                              | TypeScript budgeting app                          | MIT             | 30,132 | Active                              | n/a (no PDF statement import examined)                                                           | Local-first app                                    | Detects recurring "schedules" from its own database |
| [ellite/Wallos](https://github.com/ellite/Wallos)                                          | Self-hosted subscription tracker                  | GPL-3.0         | 8,820  | Not checked                         | n/a                                                                                              | No (self-hosted server)                            | Manual entry (per the earlier analysis)             |

### 2.1 monopoly and StatementSensei — the closest prior art

- **What it is:** a per-bank configuration (regular expressions over text extracted with poppler's layout mode) plus a "safety check" that validates totals.
- **Advantages:** mature, actively released, covers all five big Canadian banks on paper, good contributor workflow.
- **Disadvantages for this project:**
  - Python with native dependencies (`pdftotext` needs poppler headers). StatementSensei's own README says the Windows offline build does not currently work because of upstream `pdftotext` build issues, and that macOS shows an "app is damaged" warning because binaries are unsigned.
  - The hosted version is a Streamlit app, so the PDF is processed on a server.
  - **No fixtures are committed for any Canadian bank.** `tests/integration/banks/` has directories for amex, bank_of_america, chase, citibank, dbs, hsbc, maybank, ocbc, standard_chartered, trust, uob, zkb and capital_one_us, and nothing for rbc, td_canada_trust, bmo, cibc or scotiabank. Canadian support cannot be regression-tested from the repository, and there are no sample inputs to borrow.
  - The TD configuration disables the safety check, with a source comment that totals are per page rather than overall.
- **Integration difficulty:** high. Running it in the browser would mean Pyodide plus a custom-built PyMuPDF wheel plus a poppler binding that has no known Pyodide build. PyMuPDF's own docs call its Pyodide build experimental and note that `micropip.install()` does not work for it ([docs](https://pymupdf.readthedocs.io/en/latest/pyodide.html)).
- **Maintenance and security:** well maintained. AGPL-3.0 means any copied code makes this project AGPL.
- **Verdict: reuse ideas, not code.** Three ideas are worth adopting: (1) a totals/balance safety check, (2) redacted _text_ fixtures instead of real PDFs, with dates and amounts preserved so the check still passes, (3) identifying the bank from PDF metadata plus text markers. Facts learned about formats (per-page totals at TD, dates printed once per day, multi-line descriptions, credit-card text that sometimes extracts without spaces) are leads to confirm against real statements. See ADR-006.

### 2.2 bankstate

- **Advantages:** MIT, active, written by someone handling BMO and RBC statements for years.
- **Disadvantages:** Python scripts with a per-format command-line switch; no browser path.
- **Verdict: reference only.** MIT permits adapting logic with attribution if a BMO or RBC detail is needed.

### 2.3 Teller

- **Verdict: reference only, do not copy.** No licence was detected, which means all rights reserved. Its README makes one point worth designing around: banks change statement formats slightly between statements, so regex-only parsing is never fully reliable. That supports the reconciliation gate.

### 2.4 Bank-PDF-To-CSV and statement2csv — client-side prior art

- **Bank-PDF-To-CSV** proves the "runs in your browser" pitch is feasible via Pyodide, but supports only three UK banks and has no licence file. **Verdict: not reusable.**
- **statement2csv** is the same idea in JavaScript, abandoned since 2020 on a six-year-old `pdfjs-dist` major. **Verdict: not reusable.**
- Neither covers Canada, which answers part of the open question from the earlier gap analysis. _Digital ToolPad_ is closed-source and remains untested; it is an M0 task for Bruce.

### 2.5 Actual Budget — recurring detection prior art

Source read: `packages/loot-core/src/server/schedules/find-schedules.ts` (391 lines, MIT).

- **How it works:** generates candidate recurrence patterns (weekly, every two weeks, monthly, last day of month, and a few others), looks for transactions within ±2 days of each expected date, requires the same payee, and accepts amounts within 7.5% of each other (`getApproxNumberThreshold`). It works from three expected occurrences.
- **Disadvantages:** tightly coupled to Actual's database query layer and its recurrence-rule library; requires an exact payee match, which Actual gets from user-curated payees. Raw statement descriptions are much noisier.
- **Integration difficulty:** high to lift as code; low to borrow the approach.
- **Verdict: adapt the approach, write our own.** The ±2 day window, the 7.5% amount tolerance and the three-occurrence minimum are sensible starting parameters. Credit Actual in the README.

### 2.6 Found 2026-11-10, not yet assessed

From one developer-index search. Check each licence before reading any code.

- `banksheet` (dev.to write-up): local-only statement parser with a plugin system. Language, licence and bank coverage unknown.
- [spencerki/credit-card-statement-parser](https://github.com/spencerki/credit-card-statement-parser): scripts for TD, RBC, CIBC and Neo credit-card PDFs.
- [riebart/bmostatementparsers](https://github.com/riebart/bmostatementparsers): Python + `pdftotext` regular expressions for BMO statements.

None appears to be client-side TypeScript.

## 3. PDF text extraction libraries

| Library                                                | Version (published)  | Licence               | Positions available?                                                      | Notes                                                                                                                  | Verdict                                                                |
| ------------------------------------------------------ | -------------------- | --------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| [`pdfjs-dist`](https://github.com/mozilla/pdf.js)      | 6.5.438 (2026-11-01) | Apache-2.0            | Yes: `str`, `transform`, `width`, `height`, `fontName`, `hasEOL` per item | Mozilla-maintained, 54,120 stars. Engines: Node ≥ 22.13 or ≥ 24. Minified library 464 kB, worker 1.3 MB (uncompressed) | **Use**                                                                |
| [`unpdf`](https://github.com/unjs/unpdf)               | 2.1.0 (2026-10-30)   | MIT                   | Via the underlying pdf.js proxy                                           | Convenience wrapper that bundles its own pdf.js build; engines Node ≥ 24                                               | Skip: adds a layer without removing work                               |
| `mupdf` (MuPDF.js)                                     | 1.28.6 (2026-11-09)  | **AGPL-3.0-or-later** | Yes (structured text)                                                     | 14.3 MB unpacked WASM package                                                                                          | Reject: licence and size                                               |
| `pdf-oxide-wasm`                                       | 0.3.77               | MIT OR Apache-2.0     | Not evaluated                                                             | Rust/WASM; its PyPI page claims speed and pass-rate advantages that were **not** independently verified                | Not evaluated further; revisit only if pdf.js fails on real statements |
| `pdf-parse` 2.4.5, `pdf2json` 4.1.1, `pdfreader` 3.0.8 | —                    | Apache-2.0 / MIT      | Varies                                                                    | Registry metadata only; Node-oriented wrappers                                                                         | Skip                                                                   |
| Pyodide (314.0.7) + Python libraries                   | —                    | MPL-2.0               | —                                                                         | 13.9 MB package before any PDF library; see §2.1 for the PyMuPDF caveat                                                | Reject for MVP                                                         |

### `pdfjs-dist` assessment

- **Advantages:** the reference implementation used in Firefox; positioned text is exactly what a column-geometry parser needs; exposes PDF metadata (Producer, Creator, Title) for bank detection; runs its parsing in its own Web Worker in browsers; works in Node for tests and tooling.
- **Disadvantages:** large worker file; text items can be fragmented or merged unpredictably depending on how the bank generated the PDF; the API is low-level.
- **Integration difficulty:** medium. The library call is simple; turning items into reliable table rows is the real work and is ours to build.
- **Maintenance and security:** very actively maintained. The package includes WASM image decoders and an optional native canvas dependency (`@napi-rs/canvas`) that text extraction does not need. PDFs are untrusted input, so pin the version and keep the worker on the same origin.
- **Known constraint:** do not run pdf.js _inside_ another worker. Its display layer expects to create its own worker, and nesting has a long history of problems (see [mozilla/pdf.js#10319](https://github.com/mozilla/pdf.js/issues/10319)). Call it from the main thread and let it use its built-in worker.

## 4. Feasibility spike

Throwaway code, not kept in the repository.

- **Setup:** a synthetic two-page, 58-transaction statement-like PDF generated with ReportLab. Features: right-aligned amount columns, the date printed only once per day, multi-line descriptions, a repeated header on page 2, opening and closing balance lines.
- **Method:** `pdfjs-dist` 6.5.438 (legacy build) on Node 22.23.4 → `getTextContent()` → group items into lines by y-coordinate → assign numbers to columns by right-edge position → reconcile in integer cents.
- **Result:** 58 of 58 transactions recovered; opening − withdrawals + deposits equalled the closing balance; all 58 per-row running balances matched; multi-line descriptions joined correctly; total run time about 170 ms including library start-up. `getMetadata()` returned Producer and Creator.
- **What this proves:** the API shape in the current version, and that geometry-based row reconstruction plus reconciliation is workable.
- **What it does not prove:** anything about real bank PDFs. Real statements may fragment text per glyph, omit spaces, include hidden text, or use fonts that need character maps. The first real statement must go through extraction in M1 before any parser is written.

## 5. Front-end stack and tooling

| Tool                               | Version                                                | Licence           | Compatibility facts checked                                          | Verdict                                                                                             |
| ---------------------------------- | ------------------------------------------------------ | ----------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Node.js                            | 24.22.2 "Krypton" (LTS); 26.13.0 "Lithium" is also LTS | —                 | Satisfies `pdfjs-dist` (≥ 22.13), Vite 8, Vitest 5                   | **Node 24 LTS**                                                                                     |
| Vite                               | 8.3.7                                                  | MIT               | Engines `^20.19.0 \|\| >=22.12.0`                                    | **Use**                                                                                             |
| `@vitejs/plugin-react`             | 6.3.0                                                  | MIT               | Peer `vite ^8.0.0`                                                   | **Use**                                                                                             |
| `@types/react`, `@types/react-dom` | 19.3.0                                                 | MIT               | Types for React 19                                                   | **Use** (pinned; in approved-deps.json)                                                             |
| React / React DOM                  | 19.3.1                                                 | MIT               | —                                                                    | **Use** (ADR-007)                                                                                   |
| TypeScript                         | 7.0.2                                                  | Apache-2.0        | See the finding below                                                | **Use, with a fallback**                                                                            |
| Biome                              | 2.6.6                                                  | MIT OR Apache-2.0 | No dependency on the TypeScript package                              | **Use** for lint and format                                                                         |
| ESLint + `typescript-eslint`       | 10.14.0 / 8.72.2                                       | MIT               | `typescript-eslint` peer range is `typescript >=4.8.4 <6.1.0`        | Reject for now: incompatible with TypeScript 7                                                      |
| Vitest                             | 5.1.0                                                  | MIT               | Peer `vite ^6.4.0 \|\| ^7 \|\| ^8`; Node `^22.12 \|\| ^24 \|\| >=26` | **Use**                                                                                             |
| `@playwright/test`                 | 1.65.0                                                 | Apache-2.0        | Node ≥ 20                                                            | **Use** for end-to-end and network assertions                                                       |
| `fast-check`                       | 4.10.2                                                 | MIT               | —                                                                    | **Use** for property tests                                                                          |
| `@vitest/coverage-v8`              | 5.1.0                                                  | MIT               | Same version as Vitest                                               | **Use** for the 90% core coverage target                                                            |
| `@axe-core/playwright`             | 4.14.0                                                 | MPL-2.0           | Dev-only; file-level copyleft does not affect the app's licence      | **Use** in M5                                                                                       |
| `pdf-lib`                          | 1.17.1 (last published 2022-05-12)                     | MIT               | Unmaintained since 2022                                              | Candidate PDF writer for `tools/make-synthetic.ts`; decide in M1 against a hand-written minimal PDF |
| Tailwind CSS + `@tailwindcss/vite` | 4.3.5                                                  | MIT               | Peer includes `vite ^8`                                              | **Use**                                                                                             |
| PapaParse                          | 5.7.0 (2026-08-24)                                     | MIT               | See §8                                                               | **Use for CSV output**, with our own sanitising                                                     |
| `vite-plugin-pwa`                  | 2.0.0                                                  | MIT               | Peer includes `vite ^8`                                              | Post-MVP                                                                                            |
| Comlink                            | 4.4.2 (last published 2024-11-07)                      | Apache-2.0        | —                                                                    | Not needed in MVP (ADR-008)                                                                         |
| Zod 4.6.7 / Valibot 1.5.0          | —                                                      | MIT               | —                                                                    | Not needed in MVP; profiles are typed TypeScript objects                                            |
| `date-fns` 4.4.0, `rrule` 2.8.1    | —                                                      | MIT / BSD-3       | —                                                                    | Not needed; plain-date helpers are about 30 lines                                                   |
| Preact 11.2.0 / Svelte 5.57.3      | —                                                      | MIT               | —                                                                    | Considered and not chosen (ADR-007)                                                                 |

**Finding — TypeScript 7 and linting.** `typescript@latest` is 7.0.2, and `typescript-eslint` 8.72.2 does not accept it. Biome avoids the conflict because it does not use the TypeScript package. If any other tool turns out to need the TypeScript 6 API, pin TypeScript to the 6.0.x line; nothing else in the stack changes. Verifying `tsc --noEmit` runs clean is an M0 acceptance item.

## 6. Hosting

| Option                                                                             | Cost                                                                                                                | Custom response headers                                                                                  | Verdict                                                        |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| [Cloudflare Pages](https://developers.cloudflare.com/pages/configuration/headers/) | Free plan: up to 20,000 files, 25 MiB per file ([limits](https://developers.cloudflare.com/pages/platform/limits/)) | Yes, through a `_headers` file; the official docs show a `Content-Security-Policy` example               | **Primary**                                                    |
| GitHub Pages                                                                       | Free                                                                                                                | No documented way to set custom headers; a `<meta>` CSP still works but cannot express `frame-ancestors` | **Fallback** — the app must not depend on header-only features |
| Vercel / Netlify                                                                   | Free tiers                                                                                                          | Yes                                                                                                      | Not needed                                                     |

The build output is plain static files, so switching hosts is a configuration change, not a code change.

## 7. Claude Code configuration guidance (for `CLAUDE.md`)

From the official docs ([memory](https://code.claude.com/docs/en/memory.md), [best practices](https://code.claude.com/docs/en/best-practices.md)):

- A project `CLAUDE.md` lives at `./CLAUDE.md` or `./.claude/CLAUDE.md` and loads every session.
- Target under 200 lines; write instructions concrete enough to verify.
- `@path` imports load the imported file into context every session. Paths written inside backticks are not imported. The project file therefore references the `docs/` files in backticks so they are read on demand.
- `deny` rules hold in every permission mode. **Correction (2026-11-10):** a `Read` deny rule covers Claude's file tools and shell commands that name the file (`cat`, `head`, `tail`, `sed`, redirects), but not `grep -r` from a parent directory or scripts that open files themselves (Node, Python) ([permissions](https://code.claude.com/docs/en/permissions.md)). OS-level enforcement needs `sandbox.filesystem.denyRead`, which covers child processes but not MCP servers, hooks or the Read tool ([sandboxing](https://code.claude.com/docs/en/sandboxing.md)). MCP tool calls are covered only by a `PreToolUse` hook, which also fires for subagents ([hooks](https://code.claude.com/docs/en/hooks.md)).
- On macOS, Go-based CLIs such as `gh` can fail TLS inside the sandbox; the docs recommend `sandbox.excludedCommands`.
- An `allow` rule in `settings.local.json` does not override an `ask` rule in `settings.json`; permission arrays merge across scopes ([settings](https://code.claude.com/docs/en/settings.md)).

## 8. Small but consequential findings

1. **CSV formula escaping breaks negative amounts.** `Papa.unparse(rows, { escapeFormulae: true })` correctly neutralised a description beginning with `=`, but it also turned the amount `-12.50` into `'-12.50`, which is no longer a number. Decision: sanitise text fields ourselves and leave numeric fields untouched.
2. **`unpdf` needs Node ≥ 24** by its engines field; `pdfjs-dist` works from 22.13. One more reason to use `pdfjs-dist` directly.
3. **pdf.js ships WASM image decoders** (JPEG 2000, JBIG2, colour management). Text extraction should not need them, which would let the CSP omit `'wasm-unsafe-eval'`. Confirm in M1 with a real statement.

## 9. Build, adapt or reuse

| Component                                           | Decision                                                                     | Basis                                                                      |
| --------------------------------------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| PDF text and metadata extraction                    | **Reuse** `pdfjs-dist`                                                       | §3                                                                         |
| Line and column reconstruction from positioned text | **Build**                                                                    | No suitable browser library found; this is the core technical contribution |
| Bank profiles (Canadian formats)                    | **Build**, informed by facts from monopoly and bankstate                     | §2.1, §2.2, ADR-006                                                        |
| Balance reconciliation                              | **Build** (idea adapted from monopoly's safety check)                        | §2.1                                                                       |
| Redacted fixture workflow                           | **Adapt the idea** from monopoly's contributor guide to positioned-text JSON | §2.1                                                                       |
| Recurring-charge detection                          | **Build**, parameters adapted from Actual Budget                             | §2.5                                                                       |
| Merchant name normalisation                         | **Build** (rules plus a small alias table)                                   | Third-party enrichment APIs would send data off-device                     |
| CSV writing                                         | **Reuse** PapaParse, plus our own text sanitiser                             | §8                                                                         |
| UI framework, build, tests, lint                    | **Reuse** (React, Vite, Vitest, Playwright, Biome)                           | §5                                                                         |
| Hosting and security headers                        | **Reuse** Cloudflare Pages                                                   | §6                                                                         |
| Backend, database, auth, analytics                  | **None**                                                                     | ADR-001                                                                    |

## 10. Corrections to the earlier gap analysis

- monopoly has 437 stars today (the earlier report recorded about 426).
- Bank-PDF-To-CSV was described as a generic client-side converter with unknown Canadian support. Reading the source shows it supports three UK banks only.
- New and material: monopoly's Canadian bank support has no committed fixtures. The sample-statement problem is not solved anywhere upstream, which makes assumption A1 in the PRD the single biggest project risk.

## 11. Still unverified

- Behaviour of `pdfjs-dist` on real statements from each bank.
- Whether Digital ToolPad or other closed tools handle Canadian statements.
- Minimum browser versions for `pdfjs-dist` 6.x.
- Whether Cloudflare's dashboard exposes aggregate request counts for a Pages project without client-side scripts.
- What CSV export each bank offers and how far back it goes (relevant to the fallback plan).
- All market and pricing claims in §1.
