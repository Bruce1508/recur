import { expect, test } from "vitest";
import { checkFiles } from "./fixtureRules";

const f = (path: string, text = "") => ({ path, text });

test("a clean fixture passes", () => {
  expect(
    checkFiles(
      [f("fixtures/td/chequing/a.csv", "2025-01-01,MERCHANT_01,-4.50,95.50")],
      [],
    ),
  ).toEqual([]);
});

test("a PDF outside fixtures/synthetic is a violation; inside it is fine", () => {
  expect(checkFiles([f("fixtures/td/a.pdf")], [])).toEqual([
    { path: "fixtures/td/a.pdf", rule: "pdf" },
  ]);
  expect(checkFiles([f("fixtures/synthetic/a.pdf")], [])).toEqual([]);
  expect(checkFiles([f("fixtures/synthetic/../td/a.PDF")], [])).toHaveLength(1);
});

test("a run of nine or more digits is a violation with its line number, not its text", () => {
  const v = checkFiles([f("fixtures/x.csv", "ok\nref 123456789\nok")], []);
  expect(v).toEqual([{ path: "fixtures/x.csv", line: 2, rule: "digit-run" }]);
});

test("eight digits and amounts with separators pass", () => {
  expect(
    checkFiles([f("fixtures/x.csv", "20250101,1234567.89,12,345,678")], []),
  ).toEqual([]);
});

test("deny-list terms match case-insensitively and report no text", () => {
  const v = checkFiles(
    [f("fixtures/x.csv", "a\nPaid to Jane Doe")],
    ["jane doe"],
  );
  expect(v).toEqual([{ path: "fixtures/x.csv", line: 2, rule: "deny-list" }]);
  expect(JSON.stringify(v)).not.toMatch(/jane/i);
});

test("blank deny-list lines and comments are ignored", () => {
  expect(
    checkFiles([f("fixtures/x.csv", "anything")], ["", "  ", "# note"]),
  ).toEqual([]);
});
