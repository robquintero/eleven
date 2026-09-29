import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveActiveLeagueId } from "./active-league-selection.ts";
import type { LeagueSummary } from "@/data-access/leagues";

function league(id: string): LeagueSummary {
  return {
    id,
    name: `League ${id}`,
    inviteCode: "ABCD1234",
    status: "active",
    memberCount: 1,
    maxTeams: 10,
    role: "manager",
  };
}

test("resolveActiveLeagueId is null when the caller has no leagues", () => {
  assert.equal(resolveActiveLeagueId([], null), null);
  assert.equal(resolveActiveLeagueId([], "some-id"), null);
});

test("resolveActiveLeagueId defaults to the first league when no cookie is set", () => {
  const leagues = [league("a"), league("b")];
  assert.equal(resolveActiveLeagueId(leagues, null), "a");
});

test("resolveActiveLeagueId honors a requested id the caller is a member of", () => {
  const leagues = [league("a"), league("b")];
  assert.equal(resolveActiveLeagueId(leagues, "b"), "b");
});

test("resolveActiveLeagueId falls back to the first league for a stale/unknown requested id", () => {
  const leagues = [league("a"), league("b")];
  assert.equal(resolveActiveLeagueId(leagues, "left-this-league"), "a");
});
