import { expect, test } from "vitest";
import { retryable } from "./retryable";

test("a rejected load is not cached: the next call loads again", async () => {
  let calls = 0;
  const get = retryable(async () => {
    calls++;
    if (calls === 1) throw new Error("network");
    return "module";
  });
  await expect(get()).rejects.toThrow("network");
  await expect(get()).resolves.toBe("module");
  expect(calls).toBe(2);
});

test("a successful load is cached and in-flight calls share one load", async () => {
  let calls = 0;
  const get = retryable(async () => ++calls);
  const [a, b] = await Promise.all([get(), get()]);
  expect([a, b, await get()]).toEqual([1, 1, 1]);
  expect(calls).toBe(1);
});
