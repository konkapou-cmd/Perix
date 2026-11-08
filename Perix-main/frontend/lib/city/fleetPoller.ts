/** One outstanding fleet read at a time; failed reads retain the last snapshot. */
// Browser/native numeric handles and Node tooling's Timeout objects are both
// opaque cancellation tokens; scheduling behavior does not depend on the type.
type TimerHandle = number | ReturnType<typeof setTimeout>;

export function startFleetPolling<T>(options: {
  load: () => Promise<T>;
  publish: (result: T) => void;
  intervalMs?: number;
  now?: () => number;
  schedule?: (callback: () => void, delay: number) => TimerHandle;
  cancel?: (timer: TimerHandle) => void;
  subscribeRefresh?: (refresh: () => void) => (() => void);
}) {
  const interval = options.intervalMs ?? 15000;
  const now = options.now ?? Date.now;
  const schedule = options.schedule ?? setTimeout;
  const cancel = options.cancel ?? clearTimeout;
  let stopped = false;
  let running = false;
  let timer: TimerHandle | undefined;
  let lastFinished = -Infinity;
  let refreshRequested = false;
  const unsubscribe = options.subscribeRefresh?.(() => {
    if (stopped) return;
    if (running) { refreshRequested = true; return; }
    if (timer !== undefined) cancel(timer);
    timer = schedule(poll, Math.max(0, 2000-(now()-lastFinished)));
  });

  async function poll() {
    if (stopped || running) return;
    timer = undefined;
    running = true;
    const started = now();
    try {
      const result = await options.load();
      if (!stopped) options.publish(result);
    } catch {
      // Do not clear existing vehicles on a failed request.
    } finally {
      running = false;
      lastFinished = now();
      // Avoid overlapping requests and leave at least two seconds between
      // responses and the next request when the backend is already slow.
      if (!stopped) timer = schedule(poll, refreshRequested ? 2000 : Math.max(2000, interval - (now() - started)));
      refreshRequested = false;
    }
  }

  void poll();
  return () => {
    stopped = true;
    unsubscribe?.();
    if (timer !== undefined) cancel(timer);
  };
}
