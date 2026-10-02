import { test } from "node:test";
import assert from "node:assert/strict";
import { countStartersInFixture } from "./team-fixture.ts";
import type { Club, LineupSlot, Player } from "./types/fantasy.ts";

function club(shortName: string): Club {
  return { id: shortName, name: shortName, shortName, league: "premier-league", crestColor: "#000000" };
}

function starterAt(id: string, clubShortName = id): LineupSlot {
  const player: Player = {
    id,
    externalId: id,
    name: id,
    club: club(clubShortName),
    position: "MID",
    fantasyPoints: 0,
  };
  return { id, position: "MID", x: 50, y: 50, player };
}

test("countStartersInFixture: counts starters from either club in the fixture", () => {
  const starters = [starterAt("p1", "ARS"), starterAt("p2", "ARS"), starterAt("p3", "LEI"), starterAt("p4", "CHE")];
  assert.equal(countStartersInFixture(starters, { homeClubId: "ARS", awayClubId: "LEI" }), 3);
});

test("countStartersInFixture: zero when no starter belongs to either club", () => {
  const starters = [starterAt("p1", "CHE"), starterAt("p2", "MCI")];
  assert.equal(countStartersInFixture(starters, { homeClubId: "ARS", awayClubId: "LEI" }), 0);
});

test("countStartersInFixture: a null fixture is always zero, never a fabricated count", () => {
  const starters = [starterAt("p1", "ARS")];
  assert.equal(countStartersInFixture(starters, null), 0);
});

test("countStartersInFixture: an empty starting XI is zero regardless of the fixture", () => {
  assert.equal(countStartersInFixture([], { homeClubId: "ARS", awayClubId: "LEI" }), 0);
});

test("countStartersInFixture: with no teamIdsByPlayerId map, falls back to the starter's own club.id (club-only fixtures, unchanged behavior)", () => {
  const starters = [starterAt("p1", "ARS"), starterAt("p2", "CHE")];
  assert.equal(countStartersInFixture(starters, { homeClubId: "ARS", awayClubId: "LEI" }), 1);
});

test("countStartersInFixture: Pass 14 -- a starter's permanent club never matches an international fixture, but their national-team id (via teamIdsByPlayerId) does", () => {
  // Mbappé: permanent club is Real Madrid ("REA"), but he's associated
  // with France ("FRA") via player_national_teams -- the fixture itself
  // is "FRA" vs "GER", which his club.id ("REA") would never match.
  const starters = [starterAt("mbappe", "REA"), starterAt("other", "CHE")];
  const teamIdsByPlayerId = new Map([
    ["mbappe", ["REA", "FRA"]],
    ["other", ["CHE"]],
  ]);
  assert.equal(countStartersInFixture(starters, { homeClubId: "FRA", awayClubId: "GER" }, teamIdsByPlayerId), 1);
});

test("countStartersInFixture: Pass 14 -- a player with no national-team entry in the map is correctly excluded from an international fixture", () => {
  const starters = [starterAt("other", "CHE")];
  const teamIdsByPlayerId = new Map([["other", ["CHE"]]]);
  assert.equal(countStartersInFixture(starters, { homeClubId: "FRA", awayClubId: "GER" }, teamIdsByPlayerId), 0);
});
