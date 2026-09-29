import { test } from "node:test";
import assert from "node:assert/strict";
import { hasMorePages, shouldStopForQuota } from "./quota.ts";

test("shouldStopForQuota is false when the provider reports no quota figures at all", () => {
  assert.equal(shouldStopForQuota({}), false);
});

test("shouldStopForQuota stops once daily-remaining is at or below the safety margin", () => {
  assert.equal(shouldStopForQuota({ dailyRemaining: 1 }, 1), true);
  assert.equal(shouldStopForQuota({ dailyRemaining: 0 }, 1), true);
  assert.equal(shouldStopForQuota({ dailyRemaining: 2 }, 1), false);
});

test("shouldStopForQuota stops when the per-minute budget hits zero", () => {
  assert.equal(shouldStopForQuota({ minuteRemaining: 0 }), true);
  assert.equal(shouldStopForQuota({ minuteRemaining: 1 }), false);
});

test("shouldStopForQuota never stops on a genuinely unlimited-looking response (both fields undefined)", () => {
  assert.equal(shouldStopForQuota({ dailyLimit: undefined, dailyRemaining: undefined }), false);
});

test("hasMorePages is false with no pagination info", () => {
  assert.equal(hasMorePages(undefined), false);
});

test("hasMorePages is true only while currentPage is behind totalPages", () => {
  assert.equal(hasMorePages({ currentPage: 1, totalPages: 3 }), true);
  assert.equal(hasMorePages({ currentPage: 3, totalPages: 3 }), false);
  assert.equal(hasMorePages({ currentPage: 1, totalPages: 1 }), false);
});
