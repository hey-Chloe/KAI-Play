export function syncRetryMilliseconds(failureCount: number, random = Math.random) {
  const normalizedFailures = Math.max(1, Math.floor(failureCount));
  const exponential = Math.min(8_000, 750 * (2 ** Math.min(normalizedFailures, 4)));
  return exponential + Math.floor(random() * 251);
}

export function syncRetryDelay(signal: AbortSignal, failureCount: number) {
  return new Promise<void>((resolve) => {
    if (signal.aborted) { resolve(); return; }
    const done = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', done);
      resolve();
    };
    const timer = setTimeout(done, syncRetryMilliseconds(failureCount));
    signal.addEventListener('abort', done, { once: true });
  });
}
