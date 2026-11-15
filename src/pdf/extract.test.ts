import { describe, expect, test } from "vitest";
import { makeTextPdf } from "../../tools/makePdf";
import { extractPdf } from "./extract";

// Invented data only.
const SPEC = {
  info: { producer: "Invented PDF Library", creator: "Invented Statements" },
  pages: [
    {
      width: 612,
      height: 792,
      items: [
        { str: "Date", x: 50, y: 100 },
        { str: "Description", x: 120, y: 100 },
        { str: "Balance", x: 450, y: 100 },
        { str: "Oct 15", x: 50, y: 120 },
        { str: "FAKE COFFEE (12)", x: 120, y: 120 },
        { str: "1,234.56", x: 450, y: 120 },
      ],
    },
    {
      width: 612,
      height: 792,
      items: [{ str: "Page two", x: 50, y: 60 }],
    },
  ],
};

describe("extractPdf", () => {
  test("returns every text item with top-left coordinates, per page", async () => {
    const r = await extractPdf(makeTextPdf(SPEC));
    if (!r.ok) throw new Error(r.reason);
    expect(r.doc.pages).toHaveLength(2);
    expect(r.doc.pages[0]).toMatchObject({ width: 612, height: 792 });
    // pdf.js adds whitespace-only items at line ends. Kept on purpose: `normalize` uses the gaps
    // they stand for to decide whether neighbouring fragments are one word.
    const items = (r.doc.pages[0]?.items ?? []).filter(
      (i) => i.str.trim() !== "",
    );
    expect(items.map((i) => i.str)).toEqual([
      "Date",
      "Description",
      "Balance",
      "Oct 15",
      "FAKE COFFEE (12)",
      "1,234.56",
    ]);
    expect(items[0]).toMatchObject({ x: 50, y: 100 });
    expect(items[5]).toMatchObject({ x: 450, y: 120 });
    for (const i of items) {
      expect(i.w).toBeGreaterThan(0);
      expect(i.h).toBeGreaterThan(0);
      expect(i.font).not.toBe("");
    }
    expect(
      r.doc.pages[1]?.items.map((i) => i.str).filter((s) => s.trim() !== ""),
    ).toEqual(["Page two"]);
  });

  test("reads producer and creator metadata", async () => {
    const r = await extractPdf(makeTextPdf(SPEC));
    if (!r.ok) throw new Error(r.reason);
    expect(r.doc.meta).toMatchObject({
      producer: "Invented PDF Library",
      creator: "Invented Statements",
    });
  });

  test("a page with no text gives no items (the caller decides what that means)", async () => {
    const r = await extractPdf(
      makeTextPdf({ pages: [{ width: 612, height: 792, items: [] }] }),
    );
    if (!r.ok) throw new Error(r.reason);
    expect(r.doc.pages[0]?.items.filter((i) => i.str.trim() !== "")).toEqual(
      [],
    );
  });

  test("does not consume the caller's bytes", async () => {
    const bytes = makeTextPdf(SPEC);
    const copy = bytes.slice();
    await extractPdf(bytes);
    expect(bytes).toEqual(copy);
  });

  test("bytes that are not a PDF fail closed with a reason that holds no file content", async () => {
    const r = await extractPdf(new TextEncoder().encode("not a pdf at all"));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).not.toContain("not a pdf");
  });
});
