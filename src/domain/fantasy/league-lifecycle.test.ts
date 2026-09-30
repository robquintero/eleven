import { test } from "node:test";
import assert from "node:assert/strict";
import { deriveLeagueLifecycle } from "./league-lifecycle.ts";

test("WAITING_FOR_MANAGERS with only 1 manager, even in a league configured for far fewer than its target", () => {
  const state = deriveLeagueLifecycle({
    leagueStatus: "active",
    memberCount: 1,
    maxTeams: 8,
    draftStatus: null,
  });
  assert.equal(state, "WAITING_FOR_MANAGERS");
});

test("READY_FOR_DRAFT the moment a 2nd manager joins -- does NOT wait for the configured maxTeams target", () => {
  const state = deriveLeagueLifecycle({
    leagueStatus: "active",
    memberCount: 2,
    maxTeams: 8,
    draftStatus: null,
  });
  assert.equal(state, "READY_FOR_DRAFT");
});

test("a league configured for 10 managers is READY_FOR_DRAFT with only 2 -- the target size never gates starting", () => {
  const state = deriveLeagueLifecycle({
    leagueStatus: "active",
    memberCount: 2,
    maxTeams: 10,
    draftStatus: null,
  });
  assert.equal(state, "READY_FOR_DRAFT");
});

test("READY_FOR_DRAFT once membership meets capacity with no draft started", () => {
  const state = deriveLeagueLifecycle({
    leagueStatus: "active",
    memberCount: 8,
    maxTeams: 8,
    draftStatus: null,
  });
  assert.equal(state, "READY_FOR_DRAFT");
});

test("DRAFTING when a draft row is in progress, regardless of capacity", () => {
  const state = deriveLeagueLifecycle({
    leagueStatus: "active",
    memberCount: 5,
    maxTeams: 8,
    draftStatus: "in_progress",
  });
  assert.equal(state, "DRAFTING");
});

test("ACTIVE once the draft has completed", () => {
  const state = deriveLeagueLifecycle({
    leagueStatus: "active",
    memberCount: 8,
    maxTeams: 8,
    draftStatus: "completed",
  });
  assert.equal(state, "ACTIVE");
});

test("COMPLETED reflects a completed or archived league regardless of draft state", () => {
  assert.equal(
    deriveLeagueLifecycle({
      leagueStatus: "completed",
      memberCount: 8,
      maxTeams: 8,
      draftStatus: "completed",
    }),
    "COMPLETED"
  );
  assert.equal(
    deriveLeagueLifecycle({
      leagueStatus: "archived",
      memberCount: 8,
      maxTeams: 8,
      draftStatus: null,
    }),
    "COMPLETED"
  );
});
