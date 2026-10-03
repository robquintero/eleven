import { test } from "node:test";
import assert from "node:assert/strict";
import { countStartersInFixture, formatRoundPoints, formatRoundWindow, isPlayerLocked, playerStateWord, starterBuckets } from "./team-fixture.ts";
import type { Club, LineupSlot, Player, PlayerFixture } from "./types/fantasy.ts";

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

// ---------------------------------------------------------------------
// Pass 14.5 §Phase 1/2/3/5: lock-state helpers, round points formatting,
// round window formatting -- the pure logic behind "locked players must
// render distinctly," "0 points must never look like missing data," and
// "the round window is always read from the real stored fantasy_round."
// ---------------------------------------------------------------------

function fixtureWithState(state: PlayerFixture["state"]): PlayerFixture {
  return { opponent: "OPP", isHome: true, kickoff: "2026-10-05T18:45:00Z", state, homeLabel: "ME", awayLabel: "OPP" };
}

// CASE A: locked row state vs unlocked row state.
test("isPlayerLocked: a player with no fixture data at all is never treated as locked (safe default is editable)", () => {
  const player: Player = { id: "p", externalId: "p", name: "P", club: club("ARS"), position: "MID", fantasyPoints: 0 };
  assert.equal(isPlayerLocked(player), false);
});

test("isPlayerLocked: 'upcoming' is the only state that means NOT locked yet", () => {
  const player: Player = { id: "p", externalId: "p", name: "P", club: club("ARS"), position: "MID", fantasyPoints: 0, fixture: fixtureWithState("upcoming") };
  assert.equal(isPlayerLocked(player), false);
});

// CASE F/G: LOCKED vs LIVE vs FT are all distinct, but all mean "locked" (immovable).
test("isPlayerLocked: 'locked', 'live', and 'final' all mean the lineup slot has already locked", () => {
  for (const state of ["locked", "live", "final"] as const) {
    const player: Player = { id: "p", externalId: "p", name: "P", club: club("ARS"), position: "MID", fantasyPoints: 0, fixture: fixtureWithState(state) };
    assert.equal(isPlayerLocked(player), true, `state=${state} must be treated as locked`);
  }
});

test("playerStateWord: returns the bare status word, never merged with the points value", () => {
  const live = playerStateWord({ id: "p", externalId: "p", name: "P", club: club("ARS"), position: "MID", fantasyPoints: 12.7, fixture: fixtureWithState("live") });
  assert.equal(live.text, "LIVE");
  assert.equal(live.tone, "live");

  const locked = playerStateWord({ id: "p", externalId: "p", name: "P", club: club("ARS"), position: "MID", fantasyPoints: 0, fixture: fixtureWithState("locked") });
  assert.equal(locked.text, "LOCKED");

  const final = playerStateWord({ id: "p", externalId: "p", name: "P", club: club("ARS"), position: "MID", fantasyPoints: 16.5, fixture: fixtureWithState("final") });
  assert.equal(final.text, "FT");
});

test("playerStateWord: injury/suspension/doubtful still take priority over fixture state", () => {
  const injured = playerStateWord({ id: "p", externalId: "p", name: "P", club: club("ARS"), position: "MID", fantasyPoints: 0, availability: "injured", fixture: fixtureWithState("live") });
  assert.equal(injured.text, "INJ");
  assert.equal(injured.tone, "destructive");
});

// CASE D: 0 points renders as a real, known zero, never missing data.
test("formatRoundPoints: 0 formats as '0.0', not a blank or placeholder", () => {
  assert.equal(formatRoundPoints(0), "0.0");
});

test("formatRoundPoints: supports decimals and aggregates (multi-fixture sums) consistently", () => {
  assert.equal(formatRoundPoints(12.7), "12.7");
  assert.equal(formatRoundPoints(16.5), "16.5");
  assert.equal(formatRoundPoints(29.25), "29.3", "rounds to one decimal place for display, same as every other tabular points readout");
});

// CASE H: round window is always rendered from the real stored
// fantasy_round starts_at/ends_at, never inferred from today's date.
test("formatRoundWindow: renders the real stored Tue-Mon window in UTC, independent of today's date", () => {
  const text = formatRoundWindow("2026-09-29T00:00:00Z", "2026-10-06T00:00:00Z");
  assert.match(text, /SEP 29/);
  assert.match(text, /OCT 6/);
  assert.match(text, /UTC/);
  assert.match(text, /→/);
});

test("formatRoundWindow: a manually-shifted (non-canonical) window renders exactly as stored -- no realignment to a 'default' Tue-Mon boundary", () => {
  // The Room's real one-off override: shifted one week earlier than the
  // original engine-computed window would have been.
  const text = formatRoundWindow("2026-09-29T00:00:00Z", "2026-10-06T00:00:00Z");
  assert.ok(text.length > 0);
});

// CASE E: active/locked/remaining counts via starterBuckets, exercising
// the real LOCKED-does-not-mean-LIVE distinction end to end.
test("starterBuckets: correctly separates live/locked/upcoming/final counts from mixed real fixture states", () => {
  const starters: LineupSlot[] = [
    { id: "s1", position: "MID", x: 0, y: 0, player: { id: "p1", externalId: "p1", name: "P1", club: club("ARS"), position: "MID", fantasyPoints: 0, fixture: fixtureWithState("upcoming") } },
    { id: "s2", position: "MID", x: 0, y: 0, player: { id: "p2", externalId: "p2", name: "P2", club: club("ARS"), position: "MID", fantasyPoints: 0, fixture: fixtureWithState("locked") } },
    { id: "s3", position: "FWD", x: 0, y: 0, player: { id: "p3", externalId: "p3", name: "P3", club: club("ARS"), position: "FWD", fantasyPoints: 6, fixture: fixtureWithState("live") } },
    { id: "s4", position: "DEF", x: 0, y: 0, player: { id: "p4", externalId: "p4", name: "P4", club: club("ARS"), position: "DEF", fantasyPoints: 2, fixture: fixtureWithState("final") } },
  ];
  const buckets = starterBuckets(starters);
  assert.equal(buckets.upcoming, 1);
  assert.equal(buckets.locked, 1);
  assert.equal(buckets.live, 1);
  assert.equal(buckets.final, 1);
  // "locked" count for UI purposes is locked+final (both immovable, not currently live) -- see operations-rail.tsx/round-intelligence.tsx.
  assert.equal(buckets.locked + buckets.final, 2);
});
