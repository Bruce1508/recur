import { describe, expect, test } from "vitest";
import type { RawDocument } from "../src/core/types";
import { deniedCount, maskDocument, maskRun } from "./pdfMask";

// Invented data only.
describe("maskRun", () => {
  test("keeps amounts, dates and structural labels", () => {
    for (const s of [
      "1,234.56",
      "-45.00",
      "$12.30",
      "(7.10)",
      "1,000.00CR",
      "2025-01-03",
      "01/03/2025",
      "Oct 15",
      "OCT15",
      "15 Oct 2025",
      "Balance",
      "WITHDRAWALS",
      "Date",
    ])
      expect(maskRun(s)).toBe(s);
  });

  test("replaces everything else by shape: case kept, digits become 9, punctuation kept", () => {
    expect(maskRun("Jane Q. Public")).toBe("Xxxx X. Xxxxxx");
    expect(maskRun("FAKE COFFEE #12")).toBe("XXXX XXXXXX #99");
    expect(maskRun("Acct 4500123412341234")).toBe("Xxxx 9999999999999999");
    expect(maskRun("123 Invented St.")).toBe("999 Xxxxxxxx Xx.");
  });

  test("masks accented letters too", () => {
    expect(maskRun("Éléonore")).toBe("Xxxxxxxx");
  });

  test("leaves whitespace-only runs alone", () => {
    expect(maskRun("  ")).toBe("  ");
  });

  test("a number that only looks like part of an amount is not kept", () => {
    expect(maskRun("4500123412341234")).toBe("9999999999999999");
    expect(maskRun("12.3")).toBe("99.9");
  });
});

describe("maskDocument", () => {
  const doc: RawDocument = {
    meta: {
      producer: "Invented PDF Library 1.0",
      creator: "Invented Statements",
      title: "Statement for Jane Q. Public",
    },
    pages: [
      {
        width: 612,
        height: 792,
        items: [
          { str: "Jane Q. Public", x: 50, y: 60, w: 80, h: 10, font: "f1" },
          { str: "Balance", x: 400, y: 120, w: 40, h: 10, font: "f2" },
          { str: "1,234.56", x: 450, y: 140, w: 40, h: 10, font: "f1" },
        ],
      },
    ],
  };

  test("masks item text, keeps geometry and fonts, drops the title", () => {
    const out = maskDocument(doc);
    expect(out.pages[0]?.items.map((i) => i.str)).toEqual([
      "Xxxx X. Xxxxxx",
      "Balance",
      "1,234.56",
    ]);
    expect(out.pages[0]?.items[0]).toMatchObject({
      x: 50,
      y: 60,
      w: 80,
      h: 10,
      font: "f1",
    });
    expect(out.pages[0]).toMatchObject({ width: 612, height: 792 });
    expect(out.meta.producer).toBe("Invented PDF Library 1.0");
    expect(out.meta.title).toBe("Xxxxxxxxx xxx Xxxx X. Xxxxxx");
  });

  test("does not change its input", () => {
    maskDocument(doc);
    expect(doc.pages[0]?.items[0]?.str).toBe("Jane Q. Public");
  });
});

describe("deniedCount", () => {
  test("counts deny-list entries found in the text, ignoring case and blank lines", () => {
    const text = '{"str":"Xxxx"} jane public';
    expect(deniedCount(text, ["Jane Public", "", "  ", "Nobody Here"])).toBe(1);
    expect(deniedCount(text, [])).toBe(0);
  });
});
