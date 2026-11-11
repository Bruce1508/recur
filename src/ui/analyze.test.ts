import { describe, expect, test } from "vitest";
import { analyzeCsv, applyChoices, columnRoles } from "./analyze";

const withBalance = [
  "Date,Description,Debit,Credit,Balance",
  "2025-01-01,PAY,,1000.00,1000.00",
  "2025-01-02,COFFEE,4.50,,995.50",
  "2025-01-03,BOOKS,20.00,,975.50",
].join("\n");
const signedWithBalance = [
  "Date,Description,Amount,Balance",
  "2025-01-01,STORE,10.00,10.00",
  "2025-01-02,CAFE,4.50,14.50",
  "2025-01-03,PAYMENT,-14.50,0.00",
].join("\n");

describe("analyzeCsv", () => {
  test("a clear debit/credit file with a balance column is ready without asking", () => {
    const a = analyzeCsv(withBalance);
    expect(a.status).toBe("ready");
  });

  test("a file that is not a transaction export is an error, not an exception", () => {
    const a = analyzeCsv("hello world\nthis is not a statement");
    expect(a.status).toBe("error");
  });

  test("an empty file is an error", () => {
    expect(analyzeCsv("").status).toBe("error");
  });

  test("a malformed quote is an error", () => {
    expect(analyzeCsv('Date,Description\n2025-01-01,"oops').status).toBe(
      "error",
    );
  });

  test("a lone signed amount with no balance must be confirmed (sign convention)", () => {
    const a = analyzeCsv(
      [
        "Date,Description,Amount",
        "2025-01-02,COFFEE,4.50",
        "2025-01-03,BOOKS,20.00",
      ].join("\n"),
    );
    expect(a.status).toBe("confirm");
  });

  test("dates that fit day-first and month-first (low confidence) must be confirmed", () => {
    const a = analyzeCsv(
      ["01/02/2025,COFFEE,-4.50,100.00", "02/03/2025,BOOKS,-20.00,80.00"].join(
        "\n",
      ),
    );
    expect(a.status).toBe("confirm");
  });

  test("confirm carries a sample of the first data rows", () => {
    const a = analyzeCsv(
      [
        "Date,Description,Amount",
        "2025-01-02,A,4.50",
        "2025-01-03,B,20.00",
        "2025-01-04,C,1.00",
        "2025-01-05,D,2.00",
      ].join("\n"),
    );
    if (a.status !== "confirm") throw new Error("expected confirm");
    expect(a.sample).toHaveLength(3);
    expect(a.sample[0]).toEqual(["2025-01-02", "A", "4.50"]);
  });
});

test("a signed amount with a balance still needs confirmation (the balance cannot tell a card's sign)", () => {
  expect(analyzeCsv(signedWithBalance).status).toBe("confirm");
});

test("columnRoles names every column and swap exchanges debit and credit", () => {
  const a = analyzeCsv(withBalance);
  if (a.status !== "ready") throw new Error("expected ready");
  expect(columnRoles(a.mapping, 5)).toEqual([
    "Date",
    "Description",
    "Debit (money out)",
    "Credit (money in)",
    "Balance",
  ]);
  const swapped = applyChoices(a.mapping, {
    dateFormat: a.mapping.dateFormat,
    swapDebitCredit: true,
  });
  expect(columnRoles(swapped, 5).slice(2, 4)).toEqual([
    "Credit (money in)",
    "Debit (money out)",
  ]);
});
