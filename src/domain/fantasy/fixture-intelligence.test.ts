import { test } from "node:test";
import assert from "node:assert/strict";
import { computeFixtureIntelligence, type FixtureRow } from "./fixture-intelligence.ts";
import type { RoundWindow } from "./round-calendar.ts";

const WINDOW: RoundWindow = { startsAt: new Date("2026-10-06T00:00:00Z"), endsAt: new Date("2026-10-13T00:00:00Z") };
const NOW = new Date("2026-10-08T12:00:00Z");

function fixture(overrides: Partial<FixtureRow>): FixtureRow {
  return { kickoffAt: "2026-10-09T15:00:00Z", status: "scheduled", homeClubId: "home", awayClubId: "away", ...overrides };
}

test("no fixtures at all -- hasAnyFixtureData is false, never conflated with 'nothing live'", () => {
  const result = computeFixtureIntelligence([], WINDOW, NOW);
  assert.deepEqual(result, { liveFixtureCount: 0, hasAnyFixtureData: false, nextFixture: null });
});

test("fixture data exists but nothing is live right now -- 0 live is a real, distinct state from no data", () => {
  const fixtures = [fixture({ kickoffAt: "2026-10-09T15:00:00Z", status: "scheduled" })];
  const result = computeFixtureIntelligence(fixtures, WINDOW, NOW);
  assert.equal(result.hasAnyFixtureData, true);
  assert.equal(result.liveFixtureCount, 0);
});

test("counts live and half-time fixtures within the round window", () => {
  const fixtures = [
    fixture({ kickoffAt: "2026-10-08T11:00:00Z", status: "live" }),
    fixture({ kickoffAt: "2026-10-08T11:30:00Z", status: "ht" }),
    fixture({ kickoffAt: "2026-10-09T15:00:00Z", status: "scheduled" }),
  ];
  const result = computeFixtureIntelligence(fixtures, WINDOW, NOW);
  assert.equal(result.liveFixtureCount, 2);
});

test("a live fixture OUTSIDE the round window is never counted -- round-aware, never crosses into another round", () => {
  const fixtures = [fixture({ kickoffAt: "2026-10-20T11:00:00Z", status: "live" })];
  const result = computeFixtureIntelligence(fixtures, WINDOW, NOW);
  assert.equal(result.liveFixtureCount, 0);
});

test("finds the soonest still-scheduled fixture at/after now, inside the window", () => {
  const later = fixture({ kickoffAt: "2026-10-11T15:00:00Z" });
  const soonest = fixture({ kickoffAt: "2026-10-09T12:00:00Z" });
  const past = fixture({ kickoffAt: "2026-10-07T12:00:00Z" }); // before `now`
  const result = computeFixtureIntelligence([later, past, soonest], WINDOW, NOW);
  assert.equal(result.nextFixture, soonest);
});

test("never surfaces a fixture from a future round as 'next' just to have something to show", () => {
  const nextRoundFixture = fixture({ kickoffAt: "2026-10-15T15:00:00Z" }); // after WINDOW.endsAt
  const result = computeFixtureIntelligence([nextRoundFixture], WINDOW, NOW);
  assert.equal(result.nextFixture, null);
  assert.equal(result.hasAnyFixtureData, true, "data exists, it's just not applicable to THIS round");
});

test("a postponed fixture is never treated as the next upcoming one", () => {
  const postponed = fixture({ kickoffAt: "2026-10-09T15:00:00Z", status: "postponed" });
  const result = computeFixtureIntelligence([postponed], WINDOW, NOW);
  assert.equal(result.nextFixture, null);
});

test("an already-final fixture earlier in the window doesn't block finding a later scheduled one as next", () => {
  const final = fixture({ kickoffAt: "2026-10-07T15:00:00Z", status: "final" });
  const upcoming = fixture({ kickoffAt: "2026-10-11T15:00:00Z", status: "scheduled" });
  const result = computeFixtureIntelligence([final, upcoming], WINDOW, NOW);
  assert.equal(result.nextFixture, upcoming);
});

test("no fixture at/after now within the window (everyone's already played this round) -- nextFixture is null, distinct from no data", () => {
  const alreadyPlayed = fixture({ kickoffAt: "2026-10-07T15:00:00Z", status: "final" });
  const result = computeFixtureIntelligence([alreadyPlayed], WINDOW, NOW);
  assert.equal(result.nextFixture, null);
  assert.equal(result.hasAnyFixtureData, true);
});
