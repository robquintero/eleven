import { test } from "node:test";
import assert from "node:assert/strict";
import { BIG_FIVE_COMPETITIONS, getBigFiveCompetition, resolveCurrentSeason } from "./big-five-competitions.ts";

test("BIG_FIVE_COMPETITIONS configures exactly the five supported leagues", () => {
  const codes = BIG_FIVE_COMPETITIONS.map((c) => c.code).sort();
  assert.deepEqual(codes, ["ENG", "ESP", "FRA", "GER", "ITA"]);
});

test("every Big Five competition has a distinct provider league id", () => {
  const ids = BIG_FIVE_COMPETITIONS.map((c) => c.providerLeagueId);
  assert.equal(new Set(ids).size, ids.length);
});

test("getBigFiveCompetition returns the matching config", () => {
  const config = getBigFiveCompetition("ESP");
  assert.equal(config.name, "La Liga");
  assert.equal(config.country, "Spain");
});

test("getBigFiveCompetition throws for an unconfigured code", () => {
  // @ts-expect-error deliberately invalid code to exercise the error path
  assert.throws(() => getBigFiveCompetition("XXX"));
});

test("resolveCurrentSeason prefers the season the provider marks current", () => {
  const seasons = [
    { year: 2025, start: "", end: "", current: false, coverage: {} as never },
    { year: 2026, start: "", end: "", current: true, coverage: {} as never },
  ];
  assert.equal(resolveCurrentSeason(seasons, 2025), 2026);
});

test("resolveCurrentSeason falls back to the configured season when nothing is marked current", () => {
  const seasons = [
    { year: 2025, start: "", end: "", current: false, coverage: {} as never },
    { year: 2026, start: "", end: "", current: false, coverage: {} as never },
  ];
  assert.equal(resolveCurrentSeason(seasons, 2025), 2025);
});

test("resolveCurrentSeason falls back to the configured season when the provider list is empty", () => {
  assert.equal(resolveCurrentSeason([], 2026), 2026);
});
