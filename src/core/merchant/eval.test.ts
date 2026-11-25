import { describe, expect, test } from "vitest";
import { DEMO_ALIASES } from "./aliases";
import { decodeDescription } from "./decode";
import { DESCRIPTORS } from "./descriptors";

const ctx = { brands: DEMO_ALIASES };

type Counts = { correct: number; wrong: number; unknown: number };

function evaluate() {
  const bySource: Record<string, Counts> = {};
  const bump = (src: string, k: keyof Counts) => {
    const c = bySource[src] ?? { correct: 0, wrong: 0, unknown: 0 };
    c[k]++;
    bySource[src] = c;
  };
  let namedExpected = 0;
  let correct = 0;
  let wrong = 0;
  let namedOnUnknownLine = 0;
  const misses: string[] = [];
  for (const d of DESCRIPTORS) {
    const r = decodeDescription(d.description, ctx).reading;
    if (d.expected !== null) namedExpected++;
    if (r.kind === "unknown") {
      bump("unknown", "unknown");
      if (d.expected !== null) misses.push(`${d.description} -> unknown`);
      continue;
    }
    if (r.name === d.expected) {
      correct++;
      bump(r.source, "correct");
    } else {
      wrong++;
      bump(r.source, "wrong");
      if (d.expected === null) namedOnUnknownLine++;
      misses.push(`${d.description} -> ${r.name} (expected ${d.expected})`);
    }
  }
  return {
    bySource,
    namedExpected,
    correct,
    wrong,
    namedOnUnknownLine,
    misses,
  };
}

describe("AC-16 descriptor suite", () => {
  const e = evaluate();
  const shown = e.correct + e.wrong;

  test("prints the per-source report", () => {
    console.info(
      `AC-16 report (${DESCRIPTORS.length} descriptions)\n${Object.entries(
        e.bySource,
      )
        .map(
          ([s, c]) =>
            `  ${s.padEnd(8)} correct ${c.correct}  wrong ${c.wrong}  unknown ${c.unknown}`,
        )
        .join(
          "\n",
        )}\n  names shown ${shown}, wrong ${e.wrong} (${((100 * e.wrong) / shown).toFixed(1)}%), coverage ${e.correct}/${e.namedExpected} (${((100 * e.correct) / e.namedExpected).toFixed(1)}%)\n${e.misses.map((m) => `  miss: ${m}`).join("\n")}`,
    );
  });

  test("the suite is large enough and has the census mix", () => {
    expect(DESCRIPTORS.length).toBeGreaterThanOrEqual(100);
    const n = (k: string) => DESCRIPTORS.filter((d) => d.kind === k).length;
    expect(n("code")).toBeGreaterThanOrEqual(9);
    expect(n("processor")).toBeGreaterThanOrEqual(5);
  });

  test("(a) no line expected to stay unknown gets a name", () => {
    expect(e.namedOnUnknownLine).toBe(0);
  });

  test("(b) wrong readings are at most 3% of the names shown", () => {
    expect(e.wrong / shown).toBeLessThanOrEqual(0.03);
  });

  test("(c) at least 80% of the lines with an expected name get it", () => {
    expect(e.correct / e.namedExpected).toBeGreaterThanOrEqual(0.8);
  });
});
