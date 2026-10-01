import { test } from "node:test";
import assert from "node:assert/strict";
import { TradeActionError, toTradeActionError } from "./trade-action-error.ts";
import { TRADE_ACTION_ERROR_COPY } from "./trade-action-error-copy.ts";

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
