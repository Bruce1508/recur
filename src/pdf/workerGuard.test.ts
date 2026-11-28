import { expect, test } from "vitest";
import { READER_START_FAILED, watchWorker } from "./workerGuard";

test("an error event on the port rejects a pending read with the reason", async () => {
  const port = new EventTarget();
  const watch = watchWorker(port);
  const pending = new Promise<string>(() => {});
  const raced = Promise.race([pending, watch.failed]);
  port.dispatchEvent(new Event("error"));
  await expect(raced).rejects.toThrow(READER_START_FAILED);
});

test("an error before the first read is kept", async () => {
  const port = new EventTarget();
  const watch = watchWorker(port);
  port.dispatchEvent(new Event("error"));
  await expect(
    Promise.race([Promise.resolve("late"), watch.failed]),
  ).resolves.toBe("late");
  await expect(watch.failed).rejects.toThrow(READER_START_FAILED);
});

test("a read that finishes first wins, and stop removes the listener", async () => {
  const port = new EventTarget();
  const watch = watchWorker(port);
  await expect(Promise.race([Promise.resolve(1), watch.failed])).resolves.toBe(
    1,
  );
  watch.stop();
  port.dispatchEvent(new Event("error"));
  const settled = await Promise.race([
    watch.failed.then(
      () => "rejected",
      () => "rejected",
    ),
    Promise.resolve("pending"),
  ]);
  expect(settled).toBe("pending");
});
