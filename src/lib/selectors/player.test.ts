import { test } from "node:test";
import assert from "node:assert/strict";
import {
  getDatabaseSummary,
  getNextFixtureLabel,
  getOwnershipLabel,
  getRecentFormAverage,
  shortTeamName,
} from "./player.ts";
import type { Player } from "@/lib/types/fantasy";

const club: Player["club"] = {
  id: "clb_test",
  name: "Test Town",
  shortName: "TST",
  league: "premier-league",
  crestColor: "#000000",
};

function makePlayer(overrides: Partial<Player> = {}): Player {
  return {
    id: "plr_test",
    externalId: "prov_test",
    name: "Test Player",
    club,
    position: "MID",
    fantasyPoints: 5,
    ...overrides,
  };
}

test("shortTeamName takes the first word, uppercased", () => {
  assert.equal(shortTeamName("Camden Wolves"), "CAMDEN");
  assert.equal(shortTeamName("Solo"), "SOLO");
});

test("getOwnershipLabel covers every ownership state", () => {
  assert.equal(getOwnershipLabel(makePlayer({ ownership: "free" })), "FREE");
  assert.equal(getOwnershipLabel(makePlayer({ ownership: "mine" })), "MINE");
  assert.equal(getOwnershipLabel(makePlayer({ ownership: "waivers" })), "WAIVERS");
  assert.equal(
    getOwnershipLabel(makePlayer({ ownership: "owned", ownerTeamName: "Camden Wolves" })),
    "OWNED / CAMDEN"
  );
  assert.equal(getOwnershipLabel(makePlayer({ ownership: "owned" })), "OWNED");
});

test("getOwnershipLabel defaults to FREE when ownership is unset", () => {
  assert.equal(getOwnershipLabel(makePlayer()), "FREE");
});

test("getNextFixtureLabel formats home/away correctly", () => {
  const home = makePlayer({
    fixture: { opponent: "TOT", isHome: true, kickoff: "2026-10-04T15:30:00.000Z", state: "upcoming" },
  });
  const away = makePlayer({
    fixture: { opponent: "TOT", isHome: false, kickoff: "2026-10-04T15:30:00.000Z", state: "upcoming" },
  });
  assert.equal(getNextFixtureLabel(home), "vs TOT");
  assert.equal(getNextFixtureLabel(away), "@ TOT");
});

test("getNextFixtureLabel returns null with no fixture", () => {
  assert.equal(getNextFixtureLabel(makePlayer()), null);
});

test("getRecentFormAverage averages the array", () => {
  assert.equal(getRecentFormAverage(makePlayer({ recentForm: [10, 20, 30] })), 20);
});

test("getRecentFormAverage returns null with no form data", () => {
  assert.equal(getRecentFormAverage(makePlayer({ recentForm: [] })), null);
  assert.equal(getRecentFormAverage(makePlayer()), null);
});

test("getDatabaseSummary tallies ownership and flagged availability", () => {
  const players = [
    makePlayer({ id: "1", ownership: "free" }),
    makePlayer({ id: "2", ownership: "owned" }),
    makePlayer({ id: "3", ownership: "owned" }),
    makePlayer({ id: "4", ownership: "waivers" }),
    makePlayer({ id: "5", ownership: "mine", availability: "injured" }),
    makePlayer({ id: "6", ownership: "free", availability: "suspended" }),
  ];

  assert.deepEqual(getDatabaseSummary(players), {
    free: 2,
    owned: 2,
    waivers: 1,
    flagged: 2,
  });
});
