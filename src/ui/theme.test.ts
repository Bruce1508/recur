import { expect, test } from "vitest";
import { applyTheme, nextTheme, type Theme } from "./theme";

test("the toggle cycles system, light, dark and back", () => {
  let t: Theme = "system";
  const seen: Theme[] = [];
  for (let i = 0; i < 4; i++) {
    t = nextTheme(t);
    seen.push(t);
  }
  expect(seen).toEqual(["light", "dark", "system", "light"]);
});

test("applyTheme sets the override and system clears it", () => {
  const root = { dataset: {} as Record<string, string | undefined> };
  applyTheme("dark", root as unknown as HTMLElement);
  expect(root.dataset.theme).toBe("dark");
  applyTheme("light", root as unknown as HTMLElement);
  expect(root.dataset.theme).toBe("light");
  applyTheme("system", root as unknown as HTMLElement);
  expect(root.dataset.theme).toBeUndefined();
});
