import type { ProviderPagination, ProviderQuota } from "@/lib/football-providers/types";

/**
 * A minimum daily-remaining buffer to stop at rather than running the
 * quota down to exactly zero — leaves headroom for `npm run football:check`
 * and any other manual call made the same day. Pure/configurable so it's
 * unit-testable and not a magic number buried in a sync loop.
 */
export const DEFAULT_QUOTA_SAFETY_MARGIN = 1;

/**
 * Whether a sync loop should stop making further provider requests, given
 * the quota reported on the *last* response. `undefined` fields (the
 * provider didn't report a figure on this call) never trigger a stop —
 * see `ProviderQuota`'s own doc comment on why "unknown" isn't "zero."
 */
export function shouldStopForQuota(
  quota: ProviderQuota,
  safetyMargin: number = DEFAULT_QUOTA_SAFETY_MARGIN
): boolean {
  if (quota.dailyRemaining !== undefined && quota.dailyRemaining <= safetyMargin) return true;
  if (quota.minuteRemaining !== undefined && quota.minuteRemaining <= 0) return true;
  return false;
}

/** Whether a paginated sync should request the next page. */
export function hasMorePages(pagination: ProviderPagination | undefined): boolean {
  if (!pagination) return false;
  return pagination.currentPage < pagination.totalPages;
}
