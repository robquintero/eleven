import { test } from "node:test";
import assert from "node:assert/strict";
import { MarketActionError, toMarketActionError } from "./market-action-error.ts";
import { MARKET_ACTION_ERROR_COPY, MARKET_ACTION_ERROR_KIND } from "./market-action-error-copy.ts";

const ALL_CODES = [
  "DRAFT_NOT_COMPLETED",
  "LEAGUE_NOT_ACTIVE",
  "NOT_AUTHENTICATED",
  "NOT_LEAGUE_MEMBER",
  "PLAYER_NOT_FOUND",
  "PLAYER_NOT_ACTIVE",
  "PLAYER_ALREADY_OWNED",
  "PLAYER_NOT_OWNED_BY_TEAM",
  "ROSTER_FULL",
  "ROSTER_LIMIT_EXCEEDED",
  "PLAYER_LOCKED",
] as const;

test("toMarketActionError maps every known Postgres exception message to its code", () => {
  for (const code of ALL_CODES) {
    const error = toMarketActionError(code);
    assert.ok(error instanceof MarketActionError);
    assert.equal(error.code, code);
  }
});

test("toMarketActionError falls back to UNKNOWN for an unrecognized message", () => {
  assert.equal(toMarketActionError("some_other_postgres_error").code, "UNKNOWN");
});

test("toMarketActionError falls back to UNKNOWN when no message is given", () => {
  assert.equal(toMarketActionError(undefined).code, "UNKNOWN");
});

test("every MarketActionErrorCode has non-empty user-facing copy", () => {
  for (const code of [...ALL_CODES, "UNKNOWN" as const]) {
    assert.equal(typeof MARKET_ACTION_ERROR_COPY[code], "string");
    assert.ok(MARKET_ACTION_ERROR_COPY[code].length > 0);
  }
});

test("PLAYER_ALREADY_OWNED's copy matches the brief's exact required wording for the concurrent-acquisition race", () => {
  assert.equal(MARKET_ACTION_ERROR_COPY.PLAYER_ALREADY_OWNED, "Player is no longer available.");
});

// Pass 14.7 Phase 5: an expected game-rule outcome (a roster constraint, a
// locked player, a real two-managers-at-once race) must never render with
// the same red/error treatment as a genuine unexpected failure.

test("MARKET_ACTION_ERROR_KIND: expected game-rule outcomes are classified 'rule', never 'error'", () => {
  for (const code of ["PLAYER_ALREADY_OWNED", "ROSTER_FULL", "ROSTER_LIMIT_EXCEEDED", "PLAYER_LOCKED"] as const) {
    assert.equal(MARKET_ACTION_ERROR_KIND[code], "rule", `${code} must be classified as an expected rule outcome`);
  }
});

test("MARKET_ACTION_ERROR_KIND: genuine unexpected failures are classified 'error', never 'rule'", () => {
  for (const code of ["NOT_AUTHENTICATED", "NOT_LEAGUE_MEMBER", "PLAYER_NOT_FOUND", "PLAYER_NOT_ACTIVE", "PLAYER_NOT_OWNED_BY_TEAM", "UNKNOWN"] as const) {
    assert.equal(MARKET_ACTION_ERROR_KIND[code], "error", `${code} must be classified as a genuine error, not a game rule`);
  }
});

test("MARKET_ACTION_ERROR_KIND: every code (including UNKNOWN) has exactly one classification", () => {
  for (const code of [...ALL_CODES, "UNKNOWN" as const]) {
    assert.ok(MARKET_ACTION_ERROR_KIND[code] === "rule" || MARKET_ACTION_ERROR_KIND[code] === "error");
  }
  assert.equal(Object.keys(MARKET_ACTION_ERROR_KIND).length, ALL_CODES.length + 1, "MARKET_ACTION_ERROR_KIND must stay exhaustive as new codes are added");
});
