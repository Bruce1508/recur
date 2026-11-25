import fc from "fast-check";
import { describe, expect, test } from "vitest";
import type { Transaction } from "../types";
import { DEMO_ALIASES } from "./aliases";
import { decodeAll, decodeDescription } from "./decode";
import { DESCRIPTORS } from "./descriptors";
import { behaviourHints } from "./hints";

const ctx = { brands: DEMO_ALIASES };
const descriptions = DESCRIPTORS.map((d) => d.description);

describe("decodeDescription", () => {
  test("a brand match names its source and high confidence", () => {
    expect(decodeDescription("ACME COFFEE #1_V", ctx).reading).toEqual({
      kind: "name",
      name: "Acme Coffee",
      source: "brand",
      confidence: "high",
    });
  });

  test("cleaned text that looks like a name is medium confidence from a rule", () => {
    expect(decodeDescription("BAYVIEW BAKERY #12_V", ctx).reading).toEqual({
      kind: "name",
      name: "Bayview Bakery",
      source: "rule",
      confidence: "medium",
    });
  });

  test("text with no real word stays unknown", () => {
    expect(decodeDescription("XY000 TFR-FR 0000000", ctx).reading).toEqual({
      kind: "unknown",
    });
    expect(decodeDescription("", ctx).reading).toEqual({ kind: "unknown" });
  });

  test("a brand needs a whole-word match", () => {
    const r = decodeDescription("ACME COFFEEHOUSE", ctx).reading;
    expect(r).toMatchObject({ kind: "name", source: "rule" });
  });

  test("the longest match wins, whatever the list order", () => {
    const brands = [
      { name: "Short", match: ["ACME"] },
      { name: "Long", match: ["ACME COFFEE"] },
    ];
    for (const list of [brands, [...brands].reverse()]) {
      expect(
        decodeDescription("ACME COFFEE 1", { brands: list }).reading,
      ).toMatchObject({
        name: "Long",
      });
    }
  });

  test("a user label beats a brand", () => {
    const labels = new Map([["ACME COFFEE", "My office coffee"]]);
    expect(
      decodeDescription("ACME COFFEE #9", { ...ctx, labels }).reading,
    ).toEqual({
      kind: "name",
      name: "My office coffee",
      source: "user",
      confidence: "user",
    });
  });

  test("a label applies to its key only", () => {
    const labels = new Map([["ACME COFFEE", "Mine"]]);
    const other = decodeDescription("ACME COFFEE ROASTERS", { ...ctx, labels });
    expect(other.reading).toMatchObject({ kind: "name", source: "brand" });
    expect(other.reading).not.toMatchObject({ name: "Mine" });
  });

  test("a label can name an unknown line", () => {
    const labels = new Map([["TFR-FR", "Rent"]]);
    expect(
      decodeDescription("XY000 TFR-FR 0000000", { ...ctx, labels }).reading,
    ).toMatchObject({ name: "Rent", source: "user" });
  });

  test("bank code meaning appears only from a sourced table entry", () => {
    const d = decodeDescription("ACME COFFEE_V", ctx);
    expect(d.bankCode).toEqual({ code: "V" });
    const withTable = decodeDescription("ACME COFFEE_V", {
      ...ctx,
      bankCodes: {
        V: { meaning: "test meaning", source: "https://example.invalid" },
      },
    });
    expect(withTable.bankCode).toEqual({ code: "V", meaning: "test meaning" });
    expect(decodeDescription("ACME COFFEE", ctx).bankCode).toBeUndefined();
  });

  test("keeps the processor and records what was removed", () => {
    const d = decodeDescription("SQ *ACME COFFEE_V", ctx);
    expect(d.processor).toBe("SQ");
    expect(d.removed).toEqual(["bank code: _V", "processor: SQ *"]);
  });
});

describe("properties", () => {
  const tx = (id: number, description: string): Transaction => ({
    id: String(id),
    date: "2026-01-01",
    description,
    amount: -100,
    source: { statementId: "s", input: "csv", row: id },
  });

  test("decoding is independent of input order", () => {
    fc.assert(
      fc.property(fc.shuffledSubarray(descriptions), (subset) => {
        const decoded = decodeAll(
          subset.map((d, i) => tx(i, d)),
          ctx,
        );
        subset.forEach((d, i) => {
          expect(decoded[i]).toEqual(decodeDescription(d, ctx));
        });
      }),
    );
  });

  test("trailing punctuation after a bank code does not hide it (key stays stable)", () => {
    const d = decodeDescription("0_A!", ctx);
    expect(d.bankCode?.code).toBe("A");
    expect(decodeDescription(d.merchantKey, ctx).merchantKey).toBe(
      d.merchantKey,
    );
  });

  test("a cut that exposes a reference code is cleaned again", () => {
    expect(decodeDescription("_00A0", ctx).merchantKey).toBe("");
  });

  test("the key is stable under repeated decode and after cleaning", () => {
    fc.assert(
      fc.property(
        fc.oneof(fc.constantFrom(...descriptions), fc.string()),
        (s) => {
          const a = decodeDescription(s, ctx);
          expect(decodeDescription(s, ctx)).toEqual(a);
          expect(decodeDescription(a.merchantKey, ctx).merchantKey).toBe(
            a.merchantKey,
          );
        },
      ),
    );
  });

  test("hints never produce a name", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.tuple(
            fc.constantFrom(...descriptions),
            fc.integer({ min: 1, max: 28 }),
          ),
          {
            maxLength: 30,
          },
        ),
        (rows) => {
          const txs = rows.map(([d, day], i) => ({
            ...tx(i, d),
            date: `2026-01-${String(day).padStart(2, "0")}`,
          }));
          const before = txs.map((t) => decodeDescription(t.description, ctx));
          const hints = behaviourHints(
            txs,
            (t) => decodeDescription(t.description, ctx).merchantKey,
            new Set(),
          );
          const after = txs.map((t) => decodeDescription(t.description, ctx));
          expect(after).toEqual(before);
          for (const h of hints) expect(Object.keys(h)).not.toContain("name");
        },
      ),
    );
  });

  test("a line expected to stay unknown never gets a name, even with hints and brands", () => {
    for (const d of DESCRIPTORS.filter((x) => x.expected === null)) {
      expect(decodeDescription(d.description, ctx).reading.kind).toBe(
        "unknown",
      );
    }
  });
});
