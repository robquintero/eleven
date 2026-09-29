import { test } from "node:test";
import assert from "node:assert/strict";
import { ensureSuccessfulStatus, extractPagination, hasProviderErrors, parseQuotaHeaders } from "./response-helpers.ts";
import { ApiFootballRateLimitError, ApiFootballResponseError } from "./errors.ts";

// ---------------------------------------------------------------------
// parseQuotaHeaders
// ---------------------------------------------------------------------

test("parseQuotaHeaders reads API-Football's documented daily headers", () => {
  const headers = new Headers({
    "x-ratelimit-requests-limit": "100",
    "x-ratelimit-requests-remaining": "87",
  });
  const quota = parseQuotaHeaders(headers);
  assert.equal(quota.dailyLimit, 100);
  assert.equal(quota.dailyRemaining, 87);
  assert.equal(quota.minuteLimit, undefined);
  assert.equal(quota.minuteRemaining, undefined);
});

test("parseQuotaHeaders reads the per-minute RapidAPI-variant headers", () => {
  const headers = new Headers({
    "X-RateLimit-Limit": "30",
    "X-RateLimit-Remaining": "29",
  });
  const quota = parseQuotaHeaders(headers);
  assert.equal(quota.minuteLimit, 30);
  assert.equal(quota.minuteRemaining, 29);
});

test("parseQuotaHeaders leaves fields undefined (not zero) when a header is absent", () => {
  const quota = parseQuotaHeaders(new Headers());
  assert.equal(quota.dailyLimit, undefined);
  assert.equal(quota.dailyRemaining, undefined);
  assert.equal(quota.minuteLimit, undefined);
  assert.equal(quota.minuteRemaining, undefined);
});

// ---------------------------------------------------------------------
// extractPagination
// ---------------------------------------------------------------------

test("extractPagination maps the provider's paging object", () => {
  const pagination = extractPagination({ current: 2, total: 5 });
  assert.deepEqual(pagination, { currentPage: 2, totalPages: 5 });
});

test("extractPagination returns undefined when there's no paging object", () => {
  assert.equal(extractPagination(undefined), undefined);
});

// ---------------------------------------------------------------------
// ensureSuccessfulStatus
// ---------------------------------------------------------------------

test("ensureSuccessfulStatus does nothing for a 2xx status", () => {
  assert.doesNotThrow(() => ensureSuccessfulStatus(200, "/status", {}));
});

test("ensureSuccessfulStatus throws ApiFootballRateLimitError for 429, carrying the quota", () => {
  const quota = { dailyRemaining: 0 };
  assert.throws(
    () => ensureSuccessfulStatus(429, "/fixtures", quota),
    (err: unknown) => {
      assert.ok(err instanceof ApiFootballRateLimitError);
      assert.deepEqual(err.quota, quota);
      return true;
    }
  );
});

test("ensureSuccessfulStatus throws ApiFootballResponseError for other non-2xx statuses", () => {
  assert.throws(
    () => ensureSuccessfulStatus(500, "/status", {}),
    (err: unknown) => {
      assert.ok(err instanceof ApiFootballResponseError);
      assert.equal(err.status, 500);
      return true;
    }
  );
});

// ---------------------------------------------------------------------
// hasProviderErrors
// ---------------------------------------------------------------------

test("hasProviderErrors is false for an empty array or object", () => {
  assert.equal(hasProviderErrors([]), false);
  assert.equal(hasProviderErrors({}), false);
});

test("hasProviderErrors is true when the provider reports errors either shape", () => {
  assert.equal(hasProviderErrors(["rate limit"]), true);
  assert.equal(hasProviderErrors({ token: "invalid" }), true);
});
