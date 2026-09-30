import { test } from "node:test";
import assert from "node:assert/strict";
import { DraftActionError, toDraftActionError } from "./draft-action-error.ts";
import { DRAFT_ACTION_ERROR_COPY } from "./draft-action-error-copy.ts";

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
    "UNKNOWN",
  ];
  for (const code of codes) {
    assert.equal(typeof DRAFT_ACTION_ERROR_COPY[code], "string");
    assert.ok(DRAFT_ACTION_ERROR_COPY[code].length > 0);
  }
});
