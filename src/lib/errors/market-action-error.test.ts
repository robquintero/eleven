import { test } from "node:test";
import assert from "node:assert/strict";
import { MarketActionError, toMarketActionError } from "./market-action-error.ts";
import { MARKET_ACTION_ERROR_COPY } from "./market-action-error-copy.ts";

const ALL_CODES = [
  "NOT_AUTHENTICATED",
  "NOT_LEAGUE_MEMBER",
  "PLAYER_NOT_FOUND",
  "PLAYER_NOT_ACTIVE",
  "PLAYER_ALREADY_OWNED",
  "PLAYER_NOT_OWNED_BY_TEAM",
  "ROSTER_FULL",
  "ROSTER_LIMIT_EXCEEDED",
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
