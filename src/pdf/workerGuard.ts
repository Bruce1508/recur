export const READER_START_FAILED =
  "the PDF reader could not start; reload the page and try again";

export class WorkerStartError extends Error {
  constructor() {
    super(READER_START_FAILED);
    this.name = "WorkerStartError";
  }
}

export interface WorkerWatch {
  /** Rejects when the worker reports an error (its script failed to load, or it crashed); never resolves. */
  readonly failed: Promise<never>;
  /** Removes the listener. Call it when the worker is discarded. */
  stop(): void;
}

/**
 * A worker whose script cannot load fires `error` on its port and pdf.js does not listen for it, so a
 * read waits forever. Attached when the worker is created, so an error before the first read is kept.
 */
export function watchWorker(port: EventTarget): WorkerWatch {
  let onError: () => void = () => {};
  const failed = new Promise<never>((_, reject) => {
    onError = () => reject(new WorkerStartError());
    port.addEventListener("error", onError);
  });
  failed.catch(() => {});
  return { failed, stop: () => port.removeEventListener("error", onError) };
}
