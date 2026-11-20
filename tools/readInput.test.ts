import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { readInput } from "./paths";

const base = realpathSync(mkdtempSync(join(tmpdir(), "census-")));
const repo = join(base, "repo");
const outside = join(base, "outside");
mkdirSync(repo);
mkdirSync(outside);
writeFileSync(join(repo, "inside.pdf"), "x");
writeFileSync(join(outside, "ok.pdf"), "ok");
symlinkSync(join(repo, "inside.pdf"), join(outside, "link.pdf"));

describe("readInput", () => {
  test("reads a file outside the repository", () => {
    const r = readInput(repo, join(outside, "ok.pdf"));
    expect(r.ok && r.bytes.length).toBe(2);
  });

  test("refuses a symlink in an outside folder that points into the repository", () => {
    const r = readInput(repo, join(outside, "link.pdf"));
    expect(r).toEqual({ ok: false, reason: expect.stringContaining("inside") });
  });

  test("a missing file and an unreadable path fail without echoing the path", () => {
    for (const p of [join(outside, "nope-secret.pdf"), outside]) {
      const r = readInput(repo, p);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).not.toContain("secret");
      if (!r.ok) expect(r.reason).not.toContain(base);
    }
  });
});
