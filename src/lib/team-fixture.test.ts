import { test } from "node:test";
import assert from "node:assert/strict";
import { countStartersInFixture } from "./team-fixture.ts";
import type { Club, LineupSlot, Player } from "./types/fantasy.ts";

function club(shortName: string): Club {
  return { id: shortName, name: shortName, shortName, league: "premier-league", crestColor: "#000000" };
}

function starterAt(shortName: string): LineupSlot {
  const player: Player = {
    id: shortName,
    externalId: shortName,
    name: shortName,
    club: club(shortName),
    position: "MID",
    fantasyPoints: 0,
  };
  return { id: shortName, position: "MID", x: 50, y: 50, player };
}

test("countStartersInFixture: counts starters from either club in the fixture", () => {
  const starters = [starterAt("ARS"), starterAt("ARS"), starterAt("LEI"), starterAt("CHE")];
  assert.equal(countStartersInFixture(starters, { homeClubShortName: "ARS", awayClubShortName: "LEI" }), 3);
});

test("countStartersInFixture: zero when no starter belongs to either club", () => {
  const starters = [starterAt("CHE"), starterAt("MCI")];
  assert.equal(countStartersInFixture(starters, { homeClubShortName: "ARS", awayClubShortName: "LEI" }), 0);
});

test("countStartersInFixture: a null fixture is always zero, never a fabricated count", () => {
  const starters = [starterAt("ARS")];
  assert.equal(countStartersInFixture(starters, null), 0);
});

test("countStartersInFixture: an empty starting XI is zero regardless of the fixture", () => {
  assert.equal(countStartersInFixture([], { homeClubShortName: "ARS", awayClubShortName: "LEI" }), 0);
});
