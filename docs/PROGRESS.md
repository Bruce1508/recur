# Progress

Living document. Update it at the end of every working session. Never record statement contents, merchant names from real statements, or account details here; counts and pass/fail only.

**Last updated:** 2026-11-10

## Current status

**Phase:** M0 gate closed: **GO** (2026-11-10). M0b done (scaffold, CSP placeholder, CI job `verify`, privacy probe). **Next:** M1.

**Target formats (A1 confirmed):** TD chequing account and CIBC credit card, each with ≥ 3 months of PDF statements. Real statements stay in `~/Statements/`.

**Blocked on the owner:** M1 needs one real statement available locally in `~/Statements/` and the owner to review the first redacted fixture. Open question 5 (existing-tool test) does not block M1.

## Milestones

| #   | Milestone                                      | Status      | Started    | Finished   | Notes                              |
| --- | ---------------------------------------------- | ----------- | ---------- | ---------- | ---------------------------------- |
| —   | Discovery, research, architecture, planning    | Done        | 2026-11-10 | 2026-11-10 | Seven planning documents written   |
| M0  | Validation gate and bootstrap                  | Done        | 2026-11-10 | 2026-11-10 | Gate: GO; A1 confirmed (TD + CIBC) |
| M1  | Extraction, line model, fixture tooling        | Not started |            |            |                                    |
| M2  | First format, reconciliation, walking skeleton | Not started |            |            |                                    |
| M3  | Recurring-charge detection                     | Not started |            |            |                                    |
| M4  | Second format, ledger merge, CSV export        | Not started |            |            |                                    |
| M5  | Product UI, demo mode, trust features          | Not started |            |            |                                    |
| M6  | Hardening, deployment, launch                  | Not started |            |            |                                    |

## What the planning phase established

- Five related open-source projects were cloned and read; versions and licences of about 30 packages were checked against the npm registry (`docs/RESEARCH.md`).
- A throwaway spike confirmed that `pdfjs-dist` 6.5.438 returns positioned text and metadata, and that column-geometry parsing with balance reconciliation works on a synthetic two-page statement. Nothing has been tested on a real statement.
- No existing project is client-side, Canadian and subscription-aware at the same time.
- The leading open-source parser commits no fixtures for Canadian banks, so sample statements are this project's main risk.

## Open questions

| #   | Question                                                                                  | Owner | Blocks        | Answer                                                                                |
| --- | ----------------------------------------------------------------------------------------- | ----- | ------------- | ------------------------------------------------------------------------------------- |
| 1   | Banks and account types with ≥ 3 months of PDF statements?                                | Bruce | M1            | TD chequing and CIBC credit card, ≥ 3 months of PDFs each (2026-11-10)                |
| 2   | Hours per week through mid-December?                                                      | Bruce | Schedule      | More than 20 hours per week (2026-11-10)                                              |
| 3   | Licence: MIT (recommended) or AGPL-3.0?                                                   | Bruce | First commit  | MIT (choice delegated to Claude, 2026-11-10; ADR-006)                                 |
| 4   | Project name; buy a domain?                                                               | Bruce | M6            | Working name `recur`; public repo `Bruce1508/recur`. Final name and domain still open |
| 5   | Does Digital ToolPad (or any other browser tool) already parse your statements correctly? | Bruce | Positioning   |                                                                                       |
| 6   | What CSV export does your bank offer, and how far back?                                   | Bruce | Fallback plan | Bank offers CSV export, 12 months or more back (2026-11-10)                           |

## Decisions pending sign-off

ADR-006 (MIT), ADR-015 and ADR-016 are Accepted. The rest stay Proposed until the owner signs off on the PRD.

## Waiting on the owner

Queued by the autonomous workflow. Claude does not attempt these.

- [ ] Open question 5: try one of your own statements in Digital ToolPad (and StatementSensei if convenient) and write down what each got right and wrong. Do not paste statement contents into any AI tool. Positioning only; does not block M1.
- [ ] M0b-1: run `npm run e2e` once outside the sandbox (the sandbox blocks the preview server's port binding, `listen EPERM`; the unsandboxed retry was denied). Or set `sandbox.network.allowLocalBinding: true`.
- [ ] Keep real statements in `~/Statements/` only (created, mode 700), never inside the repository.

## Acceptance criteria tracker

| ID    | Criterion (short)                           | Status | Evidence |
| ----- | ------------------------------------------- | ------ | -------- |
| AC-1  | Fixtures match golden output and reconcile  | —      |          |
| AC-2  | Mutations produce a mismatch                | —      |          |
| AC-3  | Two formats, three fixtures each            | —      |          |
| AC-4  | No cross-origin requests, no request bodies | —      |          |
| AC-5  | Works offline after load                    | —      |          |
| AC-6  | Detection precision ≥ 0.90, recall ≥ 0.80   | —      |          |
| AC-7  | ≥ 80% of hand-listed subscriptions found    | —      |          |
| AC-8  | CSV round-trip and injection safety         | —      |          |
| AC-9  | 12 statements in under 5 s                  | —      |          |
| AC-10 | Demo works with no user file                | —      |          |
| AC-11 | CSP header on the deployed site             | —      |          |
| AC-12 | README complete                             | —      |          |

## Risk watch

| Risk                                               | Status           | Next check               |
| -------------------------------------------------- | ---------------- | ------------------------ |
| Too few real statements                            | Open, unassessed | M0                       |
| Real PDFs differ from the synthetic spike          | Open             | M1, first real statement |
| Schedule against exams and internship applications | Open             | Weekly                   |
| TypeScript 7 tooling friction                      | Open             | M0                       |

## Session log

Newest first. One entry per session: date, what changed, what was verified, what is next.

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
