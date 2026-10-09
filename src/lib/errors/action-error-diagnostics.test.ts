import { test } from "node:test";
import assert from "node:assert/strict";
import { logUnexpectedActionError } from "./action-error-diagnostics.ts";

test("logs the action, code, and ids via console.error -- never silent for a genuine error-kind RPC failure", (t) => {
  const calls: unknown[][] = [];
  t.mock.method(console, "error", (...args: unknown[]) => { calls.push(args); });

  logUnexpectedActionError({ action: "submitDraftPickAction", code: "PLAYER_NOT_FOUND", ids: { draftId: "d1", playerId: "p1" } });

  assert.equal(calls.length, 1);
  assert.match(String(calls[0][0]), /submitDraftPickAction.*PLAYER_NOT_FOUND/);
  const logged = JSON.parse(String(calls[0][1]));
  assert.equal(logged.draftId, "d1");
  assert.equal(logged.playerId, "p1");
  assert.ok(typeof logged.timestamp === "string" && !Number.isNaN(Date.parse(logged.timestamp)));
});

test("never logs anything beyond the opaque ids passed in -- no accidental PII surface", (t) => {
  const calls: unknown[][] = [];
  t.mock.method(console, "error", (...args: unknown[]) => { calls.push(args); });

  logUnexpectedActionError({ action: "signPlayerAction", code: "PLAYER_NOT_FOUND", ids: { leagueId: "l1", playerId: "p1" } });

  const logged = JSON.parse(String(calls[0][1]));
  assert.deepEqual(Object.keys(logged).sort(), ["leagueId", "playerId", "timestamp"]);
});
