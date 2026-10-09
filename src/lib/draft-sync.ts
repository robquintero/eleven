/** Monotonic database-clock sample; wall-clock changes cannot move a timer. */
export interface DraftClock { serverAtReceipt: number; monotonicAtReceipt: number }
export function sampleDraftClock(serverNow: string, started: number, received: number): DraftClock {
  return { serverAtReceipt: Date.parse(serverNow) + Math.max(0, received - started) / 2, monotonicAtReceipt: received };
}
export function draftTimeRemaining(deadline: string, clock: DraftClock, now: number): number {
  return Math.max(0, Date.parse(deadline) - clock.serverAtReceipt - Math.max(0, now - clock.monotonicAtReceipt));
}

/** Events are hints, never state. Single-flight reads; events during a read
 * cause one follow-up read. Duplicate bursts coalesce. Polling, reconnects
 * and mutations all use this same reconciliation path. */
export function createDraftSynchronizer(read: () => Promise<void>, onError: () => void, eventDelay = 60) {
  let disposed = false, running = false, dirty = false;
  let eventTimer: ReturnType<typeof setTimeout> | undefined;
  const waiters: Array<() => void> = [];
  async function drain() {
    if (running || disposed) return;
    running = true;
    do {
      dirty = false;
      try { await read(); } catch { if (!disposed) onError(); }
    } while (dirty && !disposed);
    running = false;
    waiters.splice(0).forEach(resolve => resolve());
  }
  function refresh(): Promise<void> {
    if (disposed) return Promise.resolve();
    clearTimeout(eventTimer); eventTimer = undefined;
    dirty = true;
    const done = new Promise<void>(resolve => waiters.push(resolve));
    void drain();
    return done;
  }
  return {
    refresh,
    signal() {
      if (disposed || eventTimer) return;
      eventTimer = setTimeout(() => { eventTimer = undefined; void refresh(); }, eventDelay);
    },
    dispose() { disposed = true; clearTimeout(eventTimer); waiters.splice(0).forEach(resolve => resolve()); },
  };
}
