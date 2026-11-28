/** Caches a load that succeeded and shares one in flight; a rejection is not cached, so the next call retries. */
export function retryable<T>(load: () => Promise<T>): () => Promise<T> {
  let current: Promise<T> | undefined;
  return () => {
    if (current === undefined) {
      const attempt = load();
      current = attempt;
      attempt.catch(() => {
        if (current === attempt) current = undefined;
      });
    }
    return current;
  };
}
