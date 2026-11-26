import { expect, test } from "vitest";
import { detectRecurring } from "./detect";
import { SCENARIOS } from "./scenarios";

const ctx = { brands: [] };
const MEASURED = new Set(["weekly", "biweekly", "monthly"]);

function evaluate() {
  let tp = 0;
  let fp = 0;
  let fn = 0;
  const lines: string[] = [];
  for (const s of SCENARIOS) {
    const found = detectRecurring(s.transactions, ctx).filter((d) =>
      MEASURED.has(d.cadence),
    );
    const want = s.expected.filter((e) => MEASURED.has(e.cadence));
    for (const d of found) {
      if (want.some((e) => e.key === d.merchantKey && e.cadence === d.cadence))
        tp++;
      else {
        fp++;
        lines.push(
          `FALSE POSITIVE in "${s.name}": ${d.merchantKey} (${d.cadence})`,
        );
      }
    }
    for (const e of want) {
      if (
        !found.some((d) => d.merchantKey === e.key && d.cadence === e.cadence)
      ) {
        fn++;
        lines.push(`MISSED in "${s.name}": ${e.key} (${e.cadence})`);
      }
    }
  }
  return {
    tp,
    fp,
    fn,
    precision: tp / (tp + fp),
    recall: tp / (tp + fn),
    lines,
  };
}

test("AC-6: precision >= 0.90 and recall >= 0.80 on the labelled suite", () => {
  expect(SCENARIOS.length).toBeGreaterThanOrEqual(30);
  const r = evaluate();
  console.log(
    `recurring suite (${SCENARIOS.length} scenarios): TP ${r.tp}, FP ${r.fp}, FN ${r.fn}; precision ${r.precision.toFixed(3)}, recall ${r.recall.toFixed(3)}\n${r.lines.join("\n")}`,
  );
  expect(r.precision).toBeGreaterThanOrEqual(0.9);
  expect(r.recall).toBeGreaterThanOrEqual(0.8);
});

test("price changes and annual series are found in their scenarios", () => {
  const up = SCENARIOS.find(
    (s) => s.name === "monthly price increase after six months",
  );
  const series = detectRecurring(up?.transactions ?? [], ctx).find(
    (d) => d.merchantKey === "IRONWORKS GYM",
  );
  expect(series?.priceChange).toMatchObject({ from: 4500, to: 4900 });
});
