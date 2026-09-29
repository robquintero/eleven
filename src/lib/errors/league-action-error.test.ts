import { test } from "node:test";
import assert from "node:assert/strict";
import { LeagueActionError, toLeagueActionError } from "./league-action-error.ts";
import { LEAGUE_ACTION_ERROR_COPY } from "./league-action-error-copy.ts";

test("toLeagueActionError maps every known Postgres exception message to its code", () => {
  const cases: [string, string][] = [
    ["NOT_AUTHENTICATED", "NOT_AUTHENTICATED"],
    ["INVALID_CODE", "INVALID_CODE"],
    ["LEAGUE_CLOSED", "LEAGUE_CLOSED"],
    ["ALREADY_MEMBER", "ALREADY_MEMBER"],
    ["ALREADY_OWNS_TEAM", "ALREADY_OWNS_TEAM"],
    ["LEAGUE_FULL", "LEAGUE_FULL"],
    ["INVITE_CODE_GENERATION_FAILED", "INVITE_CODE_GENERATION_FAILED"],
  ];

  for (const [message, expectedCode] of cases) {
    const error = toLeagueActionError(message);
    assert.ok(error instanceof LeagueActionError);
    assert.equal(error.code, expectedCode);
  }
});

test("toLeagueActionError falls back to UNKNOWN for an unrecognized message", () => {
  assert.equal(toLeagueActionError("some_other_postgres_error").code, "UNKNOWN");
});

test("toLeagueActionError falls back to UNKNOWN when no message is given", () => {
  assert.equal(toLeagueActionError(undefined).code, "UNKNOWN");
});

test("LeagueActionError carries the raw message alongside its code", () => {
  const error = new LeagueActionError("LEAGUE_FULL", "LEAGUE_FULL");
  assert.equal(error.message, "LEAGUE_FULL");
  assert.equal(error.name, "LeagueActionError");
});

test("every LeagueActionErrorCode has user-facing copy", () => {
  const codes: (keyof typeof LEAGUE_ACTION_ERROR_COPY)[] = [
    "NOT_AUTHENTICATED",
    "INVALID_CODE",
    "LEAGUE_CLOSED",
    "ALREADY_MEMBER",
    "ALREADY_OWNS_TEAM",
    "LEAGUE_FULL",
    "INVITE_CODE_GENERATION_FAILED",
    "UNKNOWN",
  ];
  for (const code of codes) {
    assert.equal(typeof LEAGUE_ACTION_ERROR_COPY[code], "string");
    assert.ok(LEAGUE_ACTION_ERROR_COPY[code].length > 0);
  }
});
