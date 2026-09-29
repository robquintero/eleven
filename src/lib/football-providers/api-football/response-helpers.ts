/**
 * Pure response-parsing helpers, split out of `client.ts` specifically so
 * they're testable without either a real network call or importing
 * `"server-only"` (which plain `node --test` can't resolve — see
 * src/data-access/leagues.ts / src/lib/errors/league-action-error.ts for
 * the same split applied in Pass 6). `client.ts` is the only place these
 * should be called from in real application code.
 */

import { ApiFootballRateLimitError, ApiFootballResponseError } from "./errors.ts";
import type { ProviderPagination, ProviderQuota } from "@/lib/football-providers/types";

/**
 * Reads only the specific rate-limit headers API-Football (and its
 * RapidAPI-hosted variant) document — never logs or returns the full
 * header set, which is where an auth-adjacent header could leak by
 * accident.
 */
export function parseQuotaHeaders(headers: Headers): ProviderQuota {
  const dailyLimit = headers.get("x-ratelimit-requests-limit");
  const dailyRemaining = headers.get("x-ratelimit-requests-remaining");
  const minuteLimit = headers.get("x-ratelimit-limit");
  const minuteRemaining = headers.get("x-ratelimit-remaining");

  return {
    dailyLimit: dailyLimit !== null ? Number(dailyLimit) : undefined,
    dailyRemaining: dailyRemaining !== null ? Number(dailyRemaining) : undefined,
    minuteLimit: minuteLimit !== null ? Number(minuteLimit) : undefined,
    minuteRemaining: minuteRemaining !== null ? Number(minuteRemaining) : undefined,
  };
}

export function extractPagination(
  paging: { current: number; total: number } | undefined
): ProviderPagination | undefined {
  if (!paging) return undefined;
  return { currentPage: paging.current, totalPages: paging.total };
}

/**
 * Classifies an HTTP status into the right typed error, or does nothing
 * for a genuine success. Pure and separate from the actual fetch call so
 * error classification is testable without a real network call.
 */
export function ensureSuccessfulStatus(status: number, path: string, quota: ProviderQuota): void {
  if (status === 429) {
    throw new ApiFootballRateLimitError(`API-Football rate limit exceeded for ${path}`, quota);
  }
  if (status < 200 || status >= 300) {
    throw new ApiFootballResponseError(`API-Football responded ${status} for ${path}`, status);
  }
}

export function hasProviderErrors(errors: string[] | Record<string, string>): boolean {
  return Array.isArray(errors) ? errors.length > 0 : Object.keys(errors).length > 0;
}
