import { test } from "node:test";
import assert from "node:assert/strict";
import { DraftActionError, toDraftActionError } from "./draft-action-error.ts";
import type { DraftActionErrorCode } from "./draft-action-error.ts";
import { DRAFT_ACTION_ERROR_COPY, DRAFT_ACTION_ERROR_KIND } from "./draft-action-error-copy.ts";

test("toDraftActionError maps every known Postgres exception message to its code", () => {
  const cases: [string, string][] = [
    ["NOT_AUTHENTICATED", "NOT_AUTHENTICATED"],
    ["LEAGUE_NOT_FOUND", "LEAGUE_NOT_FOUND"],
    ["NOT_COMMISSIONER", "NOT_COMMISSIONER"],
    ["LEAGUE_CLOSED", "LEAGUE_CLOSED"],
    ["DRAFT_ALREADY_EXISTS", "DRAFT_ALREADY_EXISTS"],
    ["LEAGUE_NOT_FULL", "LEAGUE_NOT_FULL"],
    ["DRAFT_NOT_FOUND", "DRAFT_NOT_FOUND"],
    ["DRAFT_NOT_ACTIVE", "DRAFT_NOT_ACTIVE"],
    ["NOT_LEAGUE_MEMBER", "NOT_LEAGUE_MEMBER"],
    ["NOT_YOUR_TURN", "NOT_YOUR_TURN"],
    ["PLAYER_NOT_FOUND", "PLAYER_NOT_FOUND"],
    ["PLAYER_NOT_ACTIVE", "PLAYER_NOT_ACTIVE"],
    ["PLAYER_ALREADY_OWNED", "PLAYER_ALREADY_OWNED"],
    ["ROSTER_LIMIT_EXCEEDED", "ROSTER_LIMIT_EXCEEDED"],
  ];

  for (const [message, expectedCode] of cases) {
    const error = toDraftActionError(message);
    assert.ok(error instanceof DraftActionError);
    assert.equal(error.code, expectedCode);
  }
});

test("toDraftActionError falls back to UNKNOWN for an unrecognized message", () => {
  assert.equal(toDraftActionError("some_other_postgres_error").code, "UNKNOWN");
});

test("toDraftActionError falls back to UNKNOWN when no message is given", () => {
  assert.equal(toDraftActionError(undefined).code, "UNKNOWN");
});

test("DraftActionError carries the raw message alongside its code", () => {
  const error = new DraftActionError("NOT_YOUR_TURN", "NOT_YOUR_TURN");
  assert.equal(error.message, "NOT_YOUR_TURN");
  assert.equal(error.name, "DraftActionError");
});

test("every DraftActionErrorCode has user-facing copy", () => {
  const codes: (keyof typeof DRAFT_ACTION_ERROR_COPY)[] = [
    "NOT_AUTHENTICATED",
    "LEAGUE_NOT_FOUND",
    "NOT_COMMISSIONER",
    "LEAGUE_CLOSED",
    "DRAFT_ALREADY_EXISTS",
    "LEAGUE_NOT_FULL",
    "DRAFT_NOT_FOUND",
    "DRAFT_NOT_ACTIVE",
    "NOT_LEAGUE_MEMBER",
    "NOT_YOUR_TURN",
    "PLAYER_NOT_FOUND",
    "PLAYER_NOT_ACTIVE",
    "PLAYER_ALREADY_OWNED",
    "ROSTER_LIMIT_EXCEEDED",
    "UNKNOWN",
  ];
  for (const code of codes) {
    assert.equal(typeof DRAFT_ACTION_ERROR_COPY[code], "string");
    assert.ok(DRAFT_ACTION_ERROR_COPY[code].length > 0);
  }
});

// Pass 14.7 Phase 5: a manager drafting out of turn, or hitting a real
// roster/lifecycle constraint, is the engine working correctly -- it must
// never render with the same red/error treatment as a genuine unexpected
// failure (an auth/permission boundary, a reference to something that
// doesn't exist).

test("DRAFT_ACTION_ERROR_KIND: expected game-rule/lifecycle outcomes are classified 'rule', never 'error'", () => {
  const ruleCodes: DraftActionErrorCode[] = [
    "LEAGUE_CLOSED",
    "DRAFT_ALREADY_EXISTS",
    "LEAGUE_NOT_FULL",
    "DRAFT_NOT_ACTIVE",
    "NOT_YOUR_TURN",
    "PLAYER_ALREADY_OWNED",
    "ROSTER_LIMIT_EXCEEDED",
  ];
  for (const code of ruleCodes) {
    assert.equal(DRAFT_ACTION_ERROR_KIND[code], "rule", `${code} must be classified as an expected rule outcome`);
  }
});

test("DRAFT_ACTION_ERROR_KIND: genuine unexpected failures are classified 'error', never 'rule'", () => {
  const errorCodes: DraftActionErrorCode[] = [
    "NOT_AUTHENTICATED",
    "LEAGUE_NOT_FOUND",
    "NOT_COMMISSIONER",
    "DRAFT_NOT_FOUND",
    "NOT_LEAGUE_MEMBER",
    "PLAYER_NOT_FOUND",
    "PLAYER_NOT_ACTIVE",
    "UNKNOWN",
  ];
  for (const code of errorCodes) {
    assert.equal(DRAFT_ACTION_ERROR_KIND[code], "error", `${code} must be classified as a genuine error, not a game rule`);
  }
});

test("DRAFT_ACTION_ERROR_KIND: every DraftActionErrorCode has exactly one classification", () => {
  const allCodes: DraftActionErrorCode[] = [
    "NOT_AUTHENTICATED",
    "LEAGUE_NOT_FOUND",
    "NOT_COMMISSIONER",
    "LEAGUE_CLOSED",
    "DRAFT_ALREADY_EXISTS",
    "LEAGUE_NOT_FULL",
    "DRAFT_NOT_FOUND",
    "DRAFT_NOT_ACTIVE",
    "NOT_LEAGUE_MEMBER",
    "NOT_YOUR_TURN",
    "PLAYER_NOT_FOUND",
    "PLAYER_NOT_ACTIVE",
    "PLAYER_ALREADY_OWNED",
    "ROSTER_LIMIT_EXCEEDED",
    "UNKNOWN",
  ];
  for (const code of allCodes) {
    assert.ok(DRAFT_ACTION_ERROR_KIND[code] === "rule" || DRAFT_ACTION_ERROR_KIND[code] === "error");
  }
  assert.equal(Object.keys(DRAFT_ACTION_ERROR_KIND).length, allCodes.length, "DRAFT_ACTION_ERROR_KIND must stay exhaustive as new codes are added");
});
