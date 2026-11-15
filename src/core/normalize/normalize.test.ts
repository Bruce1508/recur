import { describe, expect, test } from "vitest";
import type { RawDocument, RawItem } from "../types";
import { normalize } from "./normalize";

// Invented data only. Font size 10, so a space is about 2.5 wide.
const item = (str: string, x: number, y: number, w?: number): RawItem => ({
  str,
  x,
  y,
  w: w ?? str.length * 5,
  h: 10,
  font: "f1",
});
const doc = (...pages: RawItem[][]): RawDocument => ({
  meta: { producer: "Invented" },
  pages: pages.map((items) => ({ width: 612, height: 792, items })),
});

describe("normalize", () => {
  test("keeps the metadata and numbers pages from 1", () => {
    const out = normalize(
      doc([item("Date", 50, 100)], [item("Balance", 50, 100)]),
    );
    expect(out.meta).toEqual({ producer: "Invented" });
    expect(out.lines.map((l) => [l.page, l.text])).toEqual([
      [1, "Date"],
      [2, "Balance"],
    ]);
  });

  test("an empty document has no lines", () => {
    expect(normalize(doc()).lines).toEqual([]);
    expect(normalize(doc([])).lines).toEqual([]);
  });

  test("groups items on the same baseline into one line, left to right, even when listed out of order", () => {
    const out = normalize(
      doc([
        item("1,234.56", 450, 120),
        item("Oct 15", 50, 120),
        item("FAKE COFFEE", 120, 120),
      ]),
    );
    expect(out.lines).toHaveLength(1);
    expect(out.lines[0]?.items.map((i) => i.str)).toEqual([
      "Oct 15",
      "FAKE COFFEE",
      "1,234.56",
    ]);
    expect(out.lines[0]?.text).toBe("Oct 15 FAKE COFFEE 1,234.56");
  });

  test("tolerates small vertical jitter inside a line but separates the next line", () => {
    const out = normalize(
      doc([
        item("Date", 50, 100),
        item("Balance", 450, 101.5),
        item("Oct 15", 50, 114),
        item("12.00", 450, 113.2),
      ]),
    );
    expect(out.lines.map((l) => l.text)).toEqual([
      "Date Balance",
      "Oct 15 12.00",
    ]);
  });

  test("orders lines top to bottom within a page, whatever the item order", () => {
    const out = normalize(
      doc([item("second", 50, 140), item("first", 50, 100)]),
    );
    expect(out.lines.map((l) => l.text)).toEqual(["first", "second"]);
    expect(out.lines[0]?.y).toBeLessThan(out.lines[1]?.y ?? 0);
  });

  test("merges fragments closer than a space, so one item per glyph becomes one word", () => {
    // "FAKE" drawn one glyph at a time, each 5 wide, touching.
    const out = normalize(
      doc([
        item("F", 50, 100, 5),
        item("A", 55, 100, 5),
        item("K", 60, 100, 5),
        item("E", 65, 100, 5),
      ]),
    );
    expect(out.lines[0]?.items).toHaveLength(1);
    expect(out.lines[0]?.items[0]).toMatchObject({
      str: "FAKE",
      x: 50,
      w: 20,
    });
  });

  test("keeps fragments apart when the gap is as wide as a column gutter, so columns stay separate", () => {
    const out = normalize(
      doc([item("Date", 50, 100), item("Description", 120, 100)]),
    );
    expect(out.lines[0]?.items.map((i) => i.str)).toEqual([
      "Date",
      "Description",
    ]);
  });

  test("a gap of one space between words keeps them as two items joined by a space in the text", () => {
    const out = normalize(
      doc([item("FAKE", 50, 100, 20), item("COFFEE", 75, 100, 30)]),
    );
    expect(out.lines[0]?.items).toHaveLength(2);
    expect(out.lines[0]?.text).toBe("FAKE COFFEE");
  });

  test("drops whitespace-only items and collapses repeated spaces in the text", () => {
    const out = normalize(
      doc([
        item("Date", 50, 100),
        item(" ", 75, 100, 2),
        item("a  b", 120, 100),
      ]),
    );
    expect(out.lines[0]?.items.map((i) => i.str)).toEqual(["Date", "a  b"]);
    expect(out.lines[0]?.text).toBe("Date a b");
  });

  test("a line's y is the top-most item's y and the line holds only its own items", () => {
    const out = normalize(doc([item("a", 50, 100), item("b", 120, 101)]));
    expect(out.lines[0]?.y).toBe(100);
  });

  test("pins the merge threshold: a gap or overlap under 0.2 of the text height merges, over it does not", () => {
    // Text height 10, so the threshold is 2. The first item is 20 wide and ends at x = 70.
    const pair = (x2: number) =>
      normalize(doc([item("ab", 50, 100, 20), item("cd", x2, 100, 20)]))
        .lines[0]?.items.length;
    expect(pair(71.9)).toBe(1); // gap 1.9
    expect(pair(72.1)).toBe(2); // gap 2.1
    expect(pair(68.1)).toBe(1); // overlap 1.9
    expect(pair(67.9)).toBe(2); // overlap 2.1
  });

  describe("text drawn twice (overdraw)", () => {
    // A real statement draws its total row twice, 0.65 apart vertically and a fraction apart
    // horizontally, so the second copy overlaps the first. The numbers here are invented; the
    // offsets are the ones the layout dump showed.
    const small = (str: string, x: number, y: number, w: number): RawItem => ({
      str,
      x,
      y,
      w,
      h: 8.5,
      font: "f1",
    });

    test("a near-identical copy is dropped, so a total is not doubled or repeated", () => {
      const out = normalize(
        doc([
          small("Total", 69.12, 600.82, 18.9),
          small("1,111.11", 273.49, 600.82, 33.08),
          small("2,222.22", 372.38, 600.82, 33.08),
          small("Total", 69.12, 600.17, 18.9),
          small("1,111.11", 273.29, 600.17, 33.08),
          small("2,222.22", 372.39, 600.17, 33.08),
        ]),
      );
      expect(out.lines).toHaveLength(1);
      expect(out.lines[0]?.text).toBe("Total 1,111.11 2,222.22");
      expect(out.lines[0]?.y).toBe(600.17);
    });

    test("identical text on different rows, or in different columns of one row, is kept", () => {
      const out = normalize(
        doc([
          small("5.07", 289.83, 381.59, 16.54),
          small("5.07", 289.83, 505.13, 16.54),
          small("SEP08", 417.48, 505.13, 26.46),
          small("SEP08", 480, 505.13, 26.46),
        ]),
      );
      expect(out.lines.map((l) => l.text)).toEqual([
        "5.07",
        "5.07 SEP08 SEP08",
      ]);
    });

    test("different text at the same place is kept", () => {
      const out = normalize(
        doc([
          small("1,111.11", 273, 600, 33),
          small("1,111.12", 273, 600.2, 33),
        ]),
      );
      expect(out.lines[0]?.items).toHaveLength(2);
    });
  });

  test("does not change its input", () => {
    const input = doc([item("b", 120, 100), item("a", 50, 100)]);
    normalize(input);
    expect(input.pages[0]?.items.map((i) => i.str)).toEqual(["b", "a"]);
  });
});
