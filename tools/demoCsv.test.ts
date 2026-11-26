import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { toStatement } from "../src/core/csv/toStatement";
import { reconcile } from "../src/core/reconcile";
import { analyzeCsv } from "../src/ui/analyze";
import { demoCsv } from "./demoCsv";

const committed = readFileSync("src/ui/demo/sample-chequing.csv", "utf8");

test("the committed demo file is what `npm run demo:build` writes", () => {
  expect(committed).toBe(demoCsv());
});

test("the demo file imports without questions and verifies", () => {
  const a = analyzeCsv(committed);
  expect(a.status).toBe("ready");
  if (a.status !== "ready") return;
  const s = toStatement(a.rows, a.mapping, { kind: "deposit" });
  expect(s.ok).toBe(true);
  if (!s.ok) return;
  expect(reconcile(s.statement).status).toBe("verified");
});
