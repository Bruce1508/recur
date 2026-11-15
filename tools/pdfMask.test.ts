import { describe, expect, test } from "vitest";
import type { RawDocument } from "../src/core/types";
import { deniedCount, hasUnmappedText, maskDocument, maskRun } from "./pdfMask";

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
      "SEP01",
      "STARTING BALANCE",
      "Total",
      "AUG 31/26 - SEP 29/26",
      "Oct 1, 2025 - Oct 31, 2025",
      "OCT 01/25 TO OCT 31/25",
    ])
      expect(maskRun(s)).toBe(s);
  });

  test("replaces everything else by shape: case kept, digits become 9, punctuation kept", () => {
    expect(maskRun("Jane Q. Public")).toBe("Xxxx X. Xxxxxx");
    expect(maskRun("FAKE COFFEE #12")).toBe("XXXX XXXXXX #99");
    expect(maskRun("Acct 4500123412341234")).toBe("Xxxx 9999999999999999");
    expect(maskRun("123 Invented St.")).toBe("999 Xxxxxxxx Xx.");
  });

  test("a period that carries more than two dates is not kept", () => {
    expect(maskRun("AUG 31/26 - SEP 29/26 - NOV 02/26")).toBe(
      "XXX 99/99 - XXX 99/99 - XXX 99/99",
    );
    expect(maskRun("Jane AUG 31/26 - SEP 29/26")).toBe(
      "Xxxx XXX 99/99 - XXX 99/99",
    );
  });

  test("masks accented letters too", () => {
    expect(maskRun("Éléonore")).toBe("Xxxxxxxx");
  });

  test("symbols, combining marks and private-use characters do not survive", () => {
    expect(maskRun("a\u0301@b\ue000\u2022")).toBe("x__x__");
    expect(maskRun("john.doe@bank.com")).toBe("xxxx.xxx_xxxx.xxx");
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

  test("keeps producer and creator only when they look like software names", () => {
    const meta = (producer: string, creator: string): RawDocument => ({
      meta: { producer, creator },
      pages: [],
    });
    expect(
      maskDocument(meta("Invented PDF Library 1.0", "Acme (R) Writer")).meta,
    ).toEqual({
      producer: "Invented PDF Library 1.0",
      creator: "Acme (R) Writer",
    });
    expect(
      maskDocument(meta("C:\\Users\\jane\\x.pdf", "jane@example.com")).meta,
    ).toEqual({});
    expect(maskDocument(meta("x".repeat(65), "ok")).meta).toEqual({
      creator: "ok",
    });
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

describe("hasUnmappedText", () => {
  const withText = (str: string): RawDocument => ({
    meta: {},
    pages: [
      {
        width: 612,
        height: 792,
        items: [{ str, x: 0, y: 0, w: 1, h: 1, font: "f" }],
      },
    ],
  });

  test("flags control, private-use and replacement characters (a font with no Unicode map)", () => {
    expect(hasUnmappedText(withText("-$\u00031(\u000338%/"))).toBe(true);
    expect(hasUnmappedText(withText("ab\ue000"))).toBe(true);
    expect(hasUnmappedText(withText("ab\ufffd"))).toBe(true);
  });

  test("accepts ordinary text, tabs and line breaks", () => {
    expect(hasUnmappedText(withText("Jane Q. Public 12.30"))).toBe(false);
    expect(hasUnmappedText(withText("a\tb\r\nc"))).toBe(false);
    expect(hasUnmappedText(withText("Éléonore"))).toBe(false);
  });
});
