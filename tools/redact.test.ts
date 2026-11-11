import { describe, expect, test } from "vitest";
import { mapColumns } from "../src/core/csv/mapColumns";
import { readCsv } from "../src/core/csv/read";
import { redactCsv } from "./redact";

// Invented data only.
const SOURCE = [
  "Date,Description,Debit,Credit,Balance",
  "2025-01-01,ACME PAYROLL,,1000.00,1000.00",
  "2025-01-02,FAKE COFFEE #12,4.50,,995.50",
  "2025-01-03,FAKE COFFEE #12,4.50,,991.00",
  "2025-01-04,INVENTED BOOKS,20.00,,971.00",
].join("\n");
// "Memo" and "Card" stand in for extra columns a real export might carry.
const EXTRA = [
  "Date,Description,Memo,Debit,Credit,Balance,Card",
  "2025-01-01,ACME PAYROLL,ref 1234567,,1000.00,1000.00,4500123412341234",
  "2025-01-02,FAKE COFFEE #12,note,4.50,,995.50,4500123412341234",
  "2025-01-03,FAKE COFFEE #12,note,4.50,,991.00,4500123412341234",
  "2025-01-04,INVENTED BOOKS,note,20.00,,971.00,4500123412341234",
].join("\n");

function ok(text: string, map: Record<string, string> = {}) {
  const r = redactCsv(text, map);
  if (!r.ok) throw new Error(r.reason);
  return r;
}

describe("redactCsv", () => {
  test("descriptions become stable placeholders; the same description gets the same one", () => {
    const { csv } = ok(SOURCE);
    const rows = csv.split("\n").map((l) => l.split(","));
    expect(rows[1]?.[1]).toBe("MERCHANT_01");
    expect(rows[2]?.[1]).toBe("MERCHANT_02");
    expect(rows[3]?.[1]).toBe("MERCHANT_02");
    expect(rows[4]?.[1]).toBe("MERCHANT_03");
  });

  test("nothing from the source descriptions or other columns survives", () => {
    const { csv } = ok(SOURCE);
    for (const leak of ["ACME", "COFFEE", "BOOKS"])
      expect(csv).not.toContain(leak);
  });

  test("an extra text column makes it refuse, and the message says how to proceed", () => {
    const r = redactCsv(EXTRA, {});
    if (r.ok) throw new Error("expected a refusal");
    expect(r.reason).toContain("--description");
    expect(r.reason).not.toMatch(/\d{4}/);
  });

  test("with the description column named, other columns are blanked and nothing leaks", () => {
    const r = redactCsv(EXTRA, {}, { descriptionColumn: 1 });
    if (!r.ok) throw new Error(r.reason);
    for (const leak of [
      "ACME",
      "COFFEE",
      "BOOKS",
      "1234567",
      "4500",
      "note",
      "ref",
    ])
      expect(r.csv).not.toContain(leak);
    expect(r.csv.split("\n")[2]).toBe("2025-01-02,MERCHANT_02,,4.50,,995.50,");
    expect(r.report).toEqual({ rows: 4, merchants: 3, blankedColumns: 2 });
  });

  test("a description column that is out of range, or is the date or an amount, is refused", () => {
    expect(redactCsv(EXTRA, {}, { descriptionColumn: 9 }).ok).toBe(false);
    expect(redactCsv(EXTRA, {}, { descriptionColumn: 0 }).ok).toBe(false);
    expect(redactCsv(EXTRA, {}, { descriptionColumn: 5 }).ok).toBe(false);
  });

  test("dates, amounts and balances are kept exactly", () => {
    const { csv } = ok(SOURCE);
    expect(csv.split("\n")[2]).toBe("2025-01-02,MERCHANT_02,4.50,,995.50");
  });

  test("a map from an earlier file keeps placeholders stable across files", () => {
    const first = ok(SOURCE);
    const second = ok(
      [
        "Date,Description,Debit,Credit,Balance",
        "2025-02-01,INVENTED BOOKS,5.00,,100.00",
        "2025-02-02,NEW PLACE,5.00,,95.00",
        "2025-02-03,NEW PLACE,5.00,,90.00",
        "2025-02-04,INVENTED BOOKS,,50.00,140.00",
      ].join("\n"),
      first.map,
    );
    const rows = second.csv.split("\n").map((l) => l.split(","));
    expect(rows[1]?.[1]).toBe("MERCHANT_03");
    expect(rows[2]?.[1]).toBe("MERCHANT_04");
    expect(second.map["NEW PLACE"]).toBe("MERCHANT_04");
  });

  test("descriptions match regardless of case and spacing", () => {
    const { map } = ok(
      [
        "Date,Description,Amount,Balance",
        "2025-01-01,fake  coffee,-4.50,95.50",
        "2025-01-02,FAKE COFFEE,-4.50,91.00",
      ].join("\n"),
    );
    expect(Object.keys(map)).toEqual(["FAKE COFFEE"]);
  });

  test("digit runs in header labels are masked", () => {
    const { csv } = ok(SOURCE.replace("Balance", "Balance 4500123412341234"));
    expect(csv.split("\n")[0]).not.toMatch(/\d{4}/);
  });

  test("the redacted file reads back with the same column mapping", () => {
    const { csv } = ok(SOURCE);
    const a = mapColumns(
      readCsv(SOURCE).ok ? (readCsv(SOURCE) as { rows: string[][] }).rows : [],
    );
    const b = mapColumns((readCsv(csv) as { rows: string[][] }).rows);
    expect(b).toEqual(a);
  });

  test("a headerless file is redacted too", () => {
    const { csv } = ok(
      [
        "2025-01-01,FAKE COFFEE,-4.50,95.50",
        "2025-01-02,INVENTED BOOKS,-20.00,75.50",
      ].join("\n"),
    );
    expect(csv).toBe(
      "2025-01-01,MERCHANT_01,-4.50,95.50\n2025-01-02,MERCHANT_02,-20.00,75.50",
    );
  });

  test("refuses a low-confidence mapping, because it might keep the wrong column", () => {
    const r = redactCsv(
      "01/02/2025,A,-4.50,100.00\n02/03/2025,B,-20.00,80.00",
      {},
    );
    expect(r.ok).toBe(false);
  });

  test("refuses free text in a column it would keep", () => {
    const r = redactCsv(
      [
        "Date,Description,Amount,Balance",
        "2025-01-01,A,-4.50,95.50",
        "2025-01-02,B,paid to J Smith,91.00",
      ].join("\n"),
      {},
    );
    expect(r.ok).toBe(false);
  });

  test("refuses a file it cannot read", () => {
    expect(redactCsv("not a statement", {}).ok).toBe(false);
  });

  test("reports counts only", () => {
    expect(ok(SOURCE).report).toEqual({
      rows: 4,
      merchants: 3,
      blankedColumns: 0,
    });
  });
});
