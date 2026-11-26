import fc from "fast-check";
import { describe, expect, test } from "vitest";
import {
  LABEL_LIMITS,
  labelMap,
  parseLabels,
  removeLabel,
  serialiseLabels,
  setLabel,
} from "./labels";
import type { LabelFile } from "./types";

const clean = fc
  .string({ minLength: 1, maxLength: 40 })
  .filter(
    (s) =>
      s.trim() !== "" &&
      [...s].every(
        (c) =>
          (c.codePointAt(0) ?? 0) >= 0x20 && (c.codePointAt(0) ?? 0) < 0x7f,
      ),
  );
const file = fc
  .uniqueArray(fc.record({ key: clean, name: clean }), {
    selector: (l) => l.key,
    maxLength: 20,
  })
  .filter((ls) =>
    ls.every((l) => !["__proto__", "constructor", "prototype"].includes(l.key)),
  )
  .map((labels): LabelFile => ({ version: 1, labels }));

const ok = (text: string) => {
  const r = parseLabels(text);
  if (!r.ok) throw new Error(r.error);
  return r.file;
};

describe("labels", () => {
  test("round-trips", () => {
    fc.assert(
      fc.property(file, (f) => {
        expect(ok(serialiseLabels(f))).toEqual(f);
      }),
    );
  });

  test("the file holds keys and names only", () => {
    const f: LabelFile = { version: 1, labels: [{ key: "A", name: "B" }] };
    const extra = { ...f, labels: [{ key: "A", name: "B", amount: 5 }] };
    expect(parseLabels(JSON.stringify(extra)).ok).toBe(false);
    expect(
      Object.keys(
        JSON.parse(serialiseLabels(extra as unknown as LabelFile)).labels[0],
      ),
    ).toEqual(["key", "name"]);
  });

  test("labelMap looks labels up by key", () => {
    const m = labelMap({ version: 1, labels: [{ key: "A", name: "B" }] });
    expect(m.get("A")).toBe("B");
    expect(m.get("__proto__")).toBeUndefined();
  });

  const good = { version: 1, labels: [{ key: "ACME", name: "Acme" }] };
  const bad: [string, unknown][] = [
    ["not an object", []],
    ["wrong version", { ...good, version: 2 }],
    ["extra top-level field", { ...good, extra: 1 }],
    ["labels not an array", { version: 1, labels: {} }],
    ["entry not an object", { version: 1, labels: ["x"] }],
    ["non-string key", { version: 1, labels: [{ key: 1, name: "A" }] }],
    ["non-string name", { version: 1, labels: [{ key: "A", name: null }] }],
    ["empty key", { version: 1, labels: [{ key: "", name: "A" }] }],
    ["blank name", { version: 1, labels: [{ key: "A", name: "  " }] }],
    [
      "long key",
      {
        version: 1,
        labels: [{ key: "A".repeat(LABEL_LIMITS.key + 1), name: "A" }],
      },
    ],
    [
      "long name",
      {
        version: 1,
        labels: [{ key: "A", name: "A".repeat(LABEL_LIMITS.name + 1) }],
      },
    ],
    [
      "control char in key",
      { version: 1, labels: [{ key: "A\u0000B", name: "A" }] },
    ],
    [
      "control char in name",
      { version: 1, labels: [{ key: "A", name: "A\u0007" }] },
    ],
    [
      "bidi override in name",
      { version: 1, labels: [{ key: "A", name: "A‮B" }] },
    ],
    [
      "duplicate key",
      {
        version: 1,
        labels: [
          { key: "A", name: "A" },
          { key: "A", name: "B" },
        ],
      },
    ],
    [
      "too many labels",
      {
        version: 1,
        labels: Array.from({ length: LABEL_LIMITS.labels + 1 }, (_, i) => ({
          key: `K${i}`,
          name: "N",
        })),
      },
    ],
  ];

  test.each(bad)("rejects: %s", (_, value) => {
    expect(parseLabels(JSON.stringify(value)).ok).toBe(false);
  });

  test.each(["__proto__", "constructor", "prototype"])(
    "rejects polluting key %s",
    (key) => {
      expect(
        parseLabels(`{"version":1,"labels":[{"key":"${key}","name":"A"}]}`).ok,
      ).toBe(false);
    },
  );

  test("rejects a hostile __proto__ property and pollutes nothing", () => {
    const r = parseLabels(
      '{"version":1,"labels":[],"__proto__":{"polluted":true}}',
    );
    expect(r.ok).toBe(false);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  test("rejects invalid JSON and oversized text", () => {
    expect(parseLabels("{").ok).toBe(false);
    expect(parseLabels("").ok).toBe(false);
    expect(parseLabels(" ".repeat(LABEL_LIMITS.bytes + 1)).ok).toBe(false);
  });

  test("any single corrupted entry rejects the whole file", () => {
    fc.assert(
      fc.property(file, fc.nat(), (f, at) => {
        if (f.labels.length === 0) return;
        const labels = f.labels.map((l, i) =>
          i === at % f.labels.length ? { ...l, name: `${l.name}\u0000` } : l,
        );
        expect(parseLabels(JSON.stringify({ version: 1, labels })).ok).toBe(
          false,
        );
      }),
    );
  });

  test("random text never throws", () => {
    fc.assert(fc.property(fc.string(), (s) => void parseLabels(s)));
    fc.assert(fc.property(fc.json(), (s) => void parseLabels(s)));
  });
});

describe("setLabel and removeLabel", () => {
  const empty: LabelFile = { version: 1, labels: [] };
  test("add, replace and remove", () => {
    const a = setLabel(empty, "ACME", "  My coffee ");
    expect(a).toEqual({
      ok: true,
      file: { version: 1, labels: [{ key: "ACME", name: "My coffee" }] },
    });
    if (!a.ok) return;
    const b = setLabel(a.file, "ACME", "Coffee");
    expect(b.ok && b.file.labels).toEqual([{ key: "ACME", name: "Coffee" }]);
    expect(removeLabel(a.file, "ACME")).toEqual(empty);
    expect(removeLabel(a.file, "OTHER")).toEqual(a.file);
  });
  test("a bad name is rejected with a message and the input is untouched", () => {
    for (const name of [
      "",
      "   ",
      "x".repeat(LABEL_LIMITS.name + 1),
      "a\u0000b",
    ]) {
      expect(setLabel(empty, "ACME", name).ok).toBe(false);
    }
    expect(setLabel(empty, "__proto__", "Name").ok).toBe(false);
    expect(setLabel(empty, "", "Name").ok).toBe(false);
  });
  test("a key that can never be named says why", () => {
    const long = setLabel(empty, "K".repeat(LABEL_LIMITS.key + 1), "Name");
    expect(long).toEqual({
      ok: false,
      error: "This line's description is too long to be named.",
    });
    const bidi = setLabel(empty, "A\u202eB", "Name");
    expect(bidi.ok === false && bidi.error).toContain("cannot be named");
  });
  test("a label the user sets can be downloaded and loaded back", () => {
    fc.assert(
      fc.property(clean, clean, (key, name) => {
        const r = setLabel(empty, key, name);
        if (!r.ok) return;
        expect(ok(serialiseLabels(r.file))).toEqual(r.file);
      }),
    );
  });
});
