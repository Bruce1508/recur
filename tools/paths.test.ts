import { expect, test } from "vitest";
import { isInside } from "./paths";

test("the root and anything below it is inside", () => {
  expect(isInside("/repo", "/repo")).toBe(true);
  expect(isInside("/repo", "/repo/a/b.csv")).toBe(true);
});

test("a sibling, a parent and a similar prefix are outside", () => {
  expect(isInside("/repo", "/other/a.csv")).toBe(false);
  expect(isInside("/repo", "/")).toBe(false);
  expect(isInside("/repo", "/repo-notes/a.csv")).toBe(false);
});

test("a file whose name starts with two dots is still inside", () => {
  expect(isInside("/repo", "/repo/..export.csv")).toBe(true);
});

test("case differences do not make a path outside", () => {
  expect(isInside("/Users/me/repo", "/users/me/REPO/x.csv")).toBe(true);
});
