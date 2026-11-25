import fc from "fast-check";
import { expect, test } from "vitest";
import { mapColumns } from "./csv/mapColumns";
import { readCsv } from "./csv/read";
import { toStatement } from "./csv/toStatement";
import {
  type ExportRow,
  exportLedgerCsv,
  neutralise,
  restoreText,
} from "./exportCsv";
import { buildLedger } from "./ledger";
import { reconcile } from "./reconcile";
import type { ColumnMapping, Transaction } from "./types";

const tx = (
  date: string,
  description: string,
  amount: number,
  balanceAfter?: number,
): Transaction => ({
  id: `t-${date}-${amount}`,
  date,
  description,
  amount,
  ...(balanceAfter === undefined ? {} : { balanceAfter }),
  source: { statementId: "s", input: "pdf", page: 1, lineIndex: 0 },
});

const OWN_MAPPING: ColumnMapping = {
  hasHeader: true,
  date: 0,
  dateFormat: "YYYY-MM-DD",
  description: 1,
  amount: { signed: 2 },
  balance: 3,
  confidence: "high",
};

const reimport = (csv: string, mapping?: ColumnMapping) => {
  const read = readCsv(csv);
  if (!read.ok) throw new Error(read.reason);
  const mapped =
    mapping ??
    (() => {
      const m = mapColumns(read.rows);
      if (!m.ok) throw new Error(m.reason);
      return m.mapping;
    })();
  const s = toStatement(read.rows, mapped, { kind: "deposit" });
  if (!s.ok) throw new Error(s.reason);
  return { rows: read.rows, mapping: mapped, statement: s.statement };
};

const fields = (t: Transaction) => [
  t.date,
  t.description,
  t.amount,
  t.balanceAfter ?? null,
];

test("writes a header and plain numbers, leaving negative amounts numeric", () => {
  const csv = exportLedgerCsv([
    { account: "A", transaction: tx("2026-01-05", "COFFEE", -1250, 98750) },
    { account: "A", transaction: tx("2026-01-06", "PAYROLL", 200000) },
  ]);
  expect(csv.split("\r\n")).toEqual([
    "\uFEFFDate,Description,Amount,Balance,Account",
    "2026-01-05,COFFEE,-12.50,987.50,A",
    "2026-01-06,PAYROLL,2000.00,,A",
  ]);
});

test.each([
  ['=HYPERLINK("http://x")', '\'=HYPERLINK("http://x")'],
  ["+1 555", "'+1 555"],
  ["-REFUND", "'-REFUND"],
  ["@SUM(A1)", "'@SUM(A1)"],
  ["\tTAB", "'\tTAB"],
  ["\rCR", "'\rCR"],
  ["'=ALREADY", "''=ALREADY"],
  ["'PLAIN", "'PLAIN"],
  ["NETFLIX.COM", "NETFLIX.COM"],
])("neutralise(%j) is %j and restoreText undoes it", (raw, safe) => {
  expect(neutralise(raw)).toBe(safe);
  expect(restoreText(safe)).toBe(raw);
});

test("a formula description is neutralised in the file while the amount stays a number", () => {
  const csv = exportLedgerCsv([
    { account: "A", transaction: tx("2026-02-01", "=1+1", -500) },
  ]);
  expect(csv.split("\r\n")[1]).toBe("2026-02-01,'=1+1,-5.00,,A");
});

test("text no spreadsheet would run is never changed (property)", () => {
  fc.assert(
    fc.property(fc.string(), (s) => {
      fc.pre(!/^'*[=+\-@\t\r]/.test(s));
      expect(neutralise(s)).toBe(s);
    }),
  );
});

test("restoreText(neutralise(s)) is s for every string (property)", () => {
  fc.assert(
    fc.property(fc.string(), (s) => {
      expect(restoreText(neutralise(s))).toBe(s);
      expect(/^[=+\-@\t\r]/.test(neutralise(s))).toBe(false);
    }),
  );
});

// Descriptions as a Transaction holds them: whitespace collapsed and trimmed (toStatement, normalize).
const description = fc
  .string({
    unit: fc.constantFrom(..."abcXYZ019 ,;|\"'=+-@.*#/&()".split("")),
    maxLength: 30,
  })
  .map((s) => s.replace(/\s+/g, " ").trim());

const ledgerRows = fc
  .array(
    fc.record({
      day: fc.integer({ min: 1, max: 28 }),
      description,
      amount: fc.integer({ min: -5_000_000, max: 5_000_000 }),
      balance: fc.option(fc.integer({ min: -9_000_000, max: 9_000_000 }), {
        nil: undefined,
      }),
      account: fc.constantFrom("A", "B", "C", "D"),
    }),
    { minLength: 1, maxLength: 40 },
  )
  .map((rs) =>
    rs.map(
      (r, i): ExportRow => ({
        account: r.account,
        transaction: {
          ...tx(
            `2026-03-${String(r.day).padStart(2, "0")}`,
            r.description,
            r.amount,
            r.balance,
          ),
          id: `t${i}`,
        },
      }),
    ),
  );

test("AC-8: every exported row re-imports to the same date, description, amount and balance (property)", () => {
  fc.assert(
    fc.property(ledgerRows, (rows) => {
      const { rows: read, statement } = reimport(
        exportLedgerCsv(rows),
        OWN_MAPPING,
      );
      expect(statement.transactions.map(fields)).toEqual(
        rows.map((r) => fields(r.transaction)),
      );
      expect(read.slice(1).map((r) => r[4])).toEqual(
        rows.map((r) => r.account),
      );
    }),
  );
});

test("AC-8: one account's export is mapped by the importer and rebuilds an identical, verified ledger", () => {
  const original = [
    tx("2026-04-01", "PAYROLL ACME", 250000, 350000),
    tx("2026-04-02", "=CMD|' /C calc'!A0", -4599, 345401),
    tx("2026-04-02", "SPOTIFY P0A1B2", -1199, 344202),
    tx("2026-04-03", '"QUOTED", WITH COMMA', -2000, 342202),
    tx("2026-04-04", "-MINUS LEADING", -100, 342102),
  ];
  const csv = exportLedgerCsv(
    original.map((t) => ({ account: "A", transaction: t })),
  );
  const { mapping, statement } = reimport(csv);
  expect(mapping).toMatchObject({
    date: 0,
    description: 1,
    amount: { signed: 2 },
    balance: 3,
  });
  expect(reconcile(statement).status).toBe("verified");
  expect(buildLedger([statement]).transactions.map(fields)).toEqual(
    original.map(fields),
  );
});
