import { test } from "node:test";
import assert from "node:assert/strict";
import { TradeActionError, toTradeActionError } from "./trade-action-error.ts";
import type { TradeActionErrorCode } from "./trade-action-error.ts";
import { TRADE_ACTION_ERROR_COPY, TRADE_ACTION_ERROR_KIND } from "./trade-action-error-copy.ts";

const ALL_CODES = [
  "NOT_AUTHENTICATED",
  "NOT_LEAGUE_MEMBER",
  "RECEIVING_TEAM_NOT_FOUND",
  "CANNOT_TRADE_WITH_SELF",
  "EMPTY_TRADE",
  "INVALID_TRADE_ASSET",
  "TRADE_NOT_FOUND",
  "NOT_AUTHORIZED",
  "TRADE_NOT_PENDING",
  "TRADE_ASSET_NO_LONGER_OWNED",
  "ROSTER_FULL",
  "ROSTER_LIMIT_EXCEEDED",
] as const;

test("toTradeActionError maps every known Postgres exception message to its code", () => {
  for (const code of ALL_CODES) {
    const error = toTradeActionError(code);
    assert.ok(error instanceof TradeActionError);
    assert.equal(error.code, code);
  }
});

test("toTradeActionError falls back to UNKNOWN for an unrecognized message", () => {
  assert.equal(toTradeActionError("some_other_postgres_error").code, "UNKNOWN");
});

test("toTradeActionError falls back to UNKNOWN when no message is given", () => {
  assert.equal(toTradeActionError(undefined).code, "UNKNOWN");
});

test("every TradeActionErrorCode has non-empty user-facing copy", () => {
  for (const code of [...ALL_CODES, "UNKNOWN" as const]) {
    assert.equal(typeof TRADE_ACTION_ERROR_COPY[code], "string");
    assert.ok(TRADE_ACTION_ERROR_COPY[code].length > 0);
  }
});

// Pass 14.7 Phase 5: a real ownership-changed-since-proposed race
// (TRADE_ASSET_NO_LONGER_OWNED, the brief's own named "trade/drop
// restriction" example) or a roster/trade-shape constraint is the engine
// working correctly -- it must never render with the same red/error
// treatment as a genuine unexpected failure.

test("TRADE_ACTION_ERROR_KIND: expected game-rule outcomes are classified 'rule', never 'error'", () => {
  const ruleCodes: TradeActionErrorCode[] = [
    "CANNOT_TRADE_WITH_SELF",
    "EMPTY_TRADE",
    "UNEVEN_TRADE",
    "TRADE_NOT_PENDING",
    "TRADE_ASSET_NO_LONGER_OWNED",
    "ROSTER_FULL",
    "ROSTER_LIMIT_EXCEEDED",
  ];
  for (const code of ruleCodes) {
    assert.equal(TRADE_ACTION_ERROR_KIND[code], "rule", `${code} must be classified as an expected rule outcome`);
  }
});

test("TRADE_ACTION_ERROR_KIND: genuine unexpected failures are classified 'error', never 'rule'", () => {
  const errorCodes: TradeActionErrorCode[] = [
    "NOT_AUTHENTICATED",
    "NOT_LEAGUE_MEMBER",
    "RECEIVING_TEAM_NOT_FOUND",
    "INVALID_TRADE_ASSET",
    "TRADE_NOT_FOUND",
    "NOT_AUTHORIZED",
    "UNKNOWN",
  ];
  for (const code of errorCodes) {
    assert.equal(TRADE_ACTION_ERROR_KIND[code], "error", `${code} must be classified as a genuine error, not a game rule`);
  }
});

test("TRADE_ACTION_ERROR_KIND: every TradeActionErrorCode (including UNEVEN_TRADE and UNKNOWN) has exactly one classification", () => {
  const allCodes: TradeActionErrorCode[] = [
    "NOT_AUTHENTICATED",
    "NOT_LEAGUE_MEMBER",
    "RECEIVING_TEAM_NOT_FOUND",
    "CANNOT_TRADE_WITH_SELF",
    "EMPTY_TRADE",
    "UNEVEN_TRADE",
    "INVALID_TRADE_ASSET",
    "TRADE_NOT_FOUND",
    "NOT_AUTHORIZED",
    "TRADE_NOT_PENDING",
    "TRADE_ASSET_NO_LONGER_OWNED",
    "ROSTER_FULL",
    "ROSTER_LIMIT_EXCEEDED",
    "UNKNOWN",
  ];
  for (const code of allCodes) {
    assert.ok(TRADE_ACTION_ERROR_KIND[code] === "rule" || TRADE_ACTION_ERROR_KIND[code] === "error");
  }
  assert.equal(Object.keys(TRADE_ACTION_ERROR_KIND).length, allCodes.length, "TRADE_ACTION_ERROR_KIND must stay exhaustive as new codes are added");
});
