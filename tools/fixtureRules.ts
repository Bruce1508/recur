// Privacy rules for committed fixtures (ADR-005, ADR-016). Pure: the CLI in check-fixtures.ts
// does the file reading. A violation names the file, the line and the rule, never the text it
// matched, so the output of a failed CI run cannot leak what the rule was protecting.

export interface FixtureFile {
  /** Repo-relative path with "/" separators. */
  readonly path: string;
  readonly text: string;
}

export interface Violation {
  readonly path: string;
  readonly rule: "pdf" | "digit-run" | "deny-list";
  readonly line?: number;
}

// Card numbers are 16 digits, account numbers 7 to 12. Compact dates (20250101) are 8 and
// amounts print with separators, so nine is the shortest run that is never a date or an amount.
const DIGIT_RUN = /\d{9,}/;

// The only places a PDF may be committed (CLAUDE.md): invented statements for tests and the demo.
const isAllowedPdf = (path: string) =>
  (path.startsWith("fixtures/synthetic/") || path.startsWith("src/demo/")) &&
  !path.includes("..");

export function checkFiles(
  files: readonly FixtureFile[],
  denyList: readonly string[],
): Violation[] {
  const terms = denyList
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t !== "" && !t.startsWith("#"));
  const out: Violation[] = [];
  for (const file of files) {
    if (file.path.toLowerCase().endsWith(".pdf")) {
      if (!isAllowedPdf(file.path)) out.push({ path: file.path, rule: "pdf" });
      continue;
    }
    for (const [i, text] of file.text.split("\n").entries()) {
      if (DIGIT_RUN.test(text))
        out.push({ path: file.path, line: i + 1, rule: "digit-run" });
      const lower = text.toLowerCase();
      if (terms.some((t) => lower.includes(t)))
        out.push({ path: file.path, line: i + 1, rule: "deny-list" });
    }
  }
  return out;
}
