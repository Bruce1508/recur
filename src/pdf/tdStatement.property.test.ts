import fc from "fast-check";
import { expect, test } from "vitest";
import { makeTextPdf } from "../../tools/makePdf";
import { makeTdStatement, type TdSpec } from "../../tools/makeTdStatement";
import { detect } from "../core/detect";
import { normalize } from "../core/normalize/normalize";
import { parse } from "../core/parse/parse";
import { reconcile } from "../core/reconcile";
import { extractPdf } from "./extract";

// Invented data. A random ledger goes through generator, extractPdf, normalize, detect, parse and
// reconcile and must come back exactly, with status verified.

const WORDS = [
  "FAKE",
  "COFFEE",
  "INVENTED",
  "BOOKS",
  "ACME",
  "PAYROLL",
  "SAMPLE",
  "RENT",
  "UTILITY",
  "GROCER",
  "TRANSIT",
  "SUPPLY",
  "MARKET",
  "CAFE",
];
const text = (max: number) =>
  fc
    .array(fc.constantFrom(...WORDS), { minLength: 1, maxLength: max })
    .map((w) => w.join(" "));
const cents = fc
  .integer({ min: 1, max: 500000 })
  .chain((n) => fc.boolean().map((neg) => (neg ? -n : n)));
const row = fc.record({
  desc: text(3),
  suffix: fc.option(fc.constantFrom("_V", "_F"), { nil: undefined }),
  continuation: fc.option(text(2), { nil: undefined }),
  cents,
});
const days = fc
  .uniqueArray(fc.integer({ min: 2, max: 30 }), { minLength: 1, maxLength: 8 })
  .map((d) => d.sort((a, b) => a - b))
  .chain((ds) =>
    fc.tuple(
      ...ds.map((d) =>
        fc
          .array(row, { minLength: 1, maxLength: 4 })
          .map((rows) => ({ date: `SEP${String(d).padStart(2, "0")}`, rows })),
      ),
    ),
  );

test("random ledger round-trips through the PDF path and verifies", async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.integer({ min: 16000000, max: 17000000 }),
      days,
      fc.option(fc.integer({ min: 5, max: 40 }), { nil: undefined }),
      async (opening, ds, pageSize) => {
        // A continuation line ending a non-final page is cut by parse's body rule (known limit).
        const multi = pageSize !== undefined;
        const slotsPerPage = pageSize ?? 100;
        if (multi)
          for (const d of ds)
            for (const x of d.rows) x.continuation = undefined;
        const spec: TdSpec = {
          period: "SEP 01/25 - OCT 01/25",
          opening,
          days: ds,
          slotsPerPage,
        };
        const r = await extractPdf(makeTextPdf(makeTdStatement(spec).pdf));
        if (!r.ok) throw new Error(r.reason);
        const doc = normalize(r.doc);
        const profile = detect(doc);
        if (!profile) throw new Error("not detected");
        const parsed = parse(doc, profile);
        if (!parsed.ok) throw new Error("parse failed");
        let bal = opening;
        const want = ds.flatMap((d) =>
          d.rows.map((x, i) => {
            bal += x.cents;
            const desc = [x.desc, x.suffix, x.continuation]
              .filter(Boolean)
              .join(" ");
            return [
              `2025-09-${d.date.slice(3)}`,
              desc,
              x.cents,
              i === d.rows.length - 1 ? bal : undefined,
            ];
          }),
        );
        expect(parsed.statement.warnings).toEqual([]);
        expect(
          parsed.statement.transactions.map((t) => [
            t.date,
            t.description,
            t.amount,
            t.balanceAfter,
          ]),
        ).toEqual(want);
        expect(reconcile(parsed.statement)).toEqual({
          status: "verified",
          method: "checkpoints",
        });
      },
    ),
    { numRuns: 100 },
  );
}, 60000);
