/**
 * Autonomous stabilization pass, Phase E5 (also a plausible Phase D
 * contributor -- a stale search response landing after a newer one can
 * silently put a DIFFERENT player under whatever row the manager is
 * about to click): a request-sequencing guard so an older, slower
 * search response can never overwrite a newer one's results.
 *
 * Deliberately NOT an AbortController -- Next.js Server Actions have no
 * abort signal to hook into (unlike a real `fetch`), so the only
 * reliable mechanism is "did a newer request start since this one did,"
 * checked when the response comes back, not when it goes out. Pulled
 * out as a pure, dependency-free utility (same reasoning as
 * `player-search.ts`'s own header comment: `npm test` only globs
 * `src/domain`/`src/lib`/`src/data-access`, so logic living inside a
 * "use client" component next to `src/app/` or `src/components/` would
 * never actually run under test).
 */
export interface LatestOnlyGuard {
  /** Call when a new request starts. Returns a token to check against when that request resolves. */
  start(): number;
  /** True if `token` is still the most recently started request -- false if a newer one has since started, meaning this response is stale and must be discarded. */
  isLatest(token: number): boolean;
}

export function createLatestOnlyGuard(): LatestOnlyGuard {
  let currentToken = 0;
  return {
    start() {
      currentToken += 1;
      return currentToken;
    },
    isLatest(token: number) {
      return token === currentToken;
    },
  };
}
