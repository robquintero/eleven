import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  mapFixtureStatus,
  mapPosition,
  normalizeClub,
  normalizeCompetition,
  normalizeCoverage,
  normalizeFixture,
  normalizeFixturePlayerStats,
  normalizePlayer,
} from "./adapter.ts";
import { getBigFiveCompetition } from "./big-five-competitions.ts";
import type {
  ApiFootballEnvelope,
  ApiFootballFixtureItem,
  ApiFootballFixturePlayersItem,
  ApiFootballLeagueItem,
  ApiFootballPlayerItem,
  ApiFootballTeamItem,
} from "./types.ts";

function loadFixture<T>(name: string): ApiFootballEnvelope<T> {
  const path = fileURLToPath(new URL(`./__fixtures__/${name}`, import.meta.url));
  return JSON.parse(readFileSync(path, "utf8"));
}

const leagues = loadFixture<ApiFootballLeagueItem>("leagues-premier-league.json");
const teams = loadFixture<ApiFootballTeamItem>("teams-premier-league.json");
const players = loadFixture<ApiFootballPlayerItem>("players-team.json");
const fixtures = loadFixture<ApiFootballFixtureItem>("fixtures-premier-league.json");
const fixturePlayers = loadFixture<ApiFootballFixturePlayersItem>("fixture-players.json");

// ---------------------------------------------------------------------
// normalizeCompetition
// ---------------------------------------------------------------------

test("normalizeCompetition uses the Big Five config's code, not a guess from provider data", () => {
  const config = getBigFiveCompetition("ENG");
  const normalized = normalizeCompetition(leagues.response[0], config);

  assert.equal(normalized.code, "ENG");
  assert.equal(normalized.externalId, "39");
  assert.equal(normalized.name, "Premier League");
  assert.equal(normalized.country, "England");
});

test("normalizeCompetition picks the season marked current over the configured default", () => {
  const config = getBigFiveCompetition("ENG");
  const normalized = normalizeCompetition(leagues.response[0], config);
  // Fixture has year 2026 marked current, even though other seasons exist.
  assert.equal(normalized.season, 2026);
});

test("normalizeCompetition's externalId is a provider id string, never used as an Eleven uuid field", () => {
  const config = getBigFiveCompetition("ENG");
  const normalized = normalizeCompetition(leagues.response[0], config);
  assert.equal("id" in normalized, false);
  assert.equal(typeof normalized.externalId, "string");
});

// ---------------------------------------------------------------------
// normalizeClub
// ---------------------------------------------------------------------

test("normalizeClub maps team fields and carries the competition's externalId through", () => {
  const normalized = normalizeClub(teams.response[0], "39");
  assert.deepEqual(normalized, {
    externalId: "50",
    competitionExternalId: "39",
    name: "Manchester City",
    shortName: "MCI",
    code: "MCI",
    isNationalTeam: false,
  });
});

test("normalizeClub falls back to a derived short code when the provider omits one", () => {
  const noCode = { team: { id: 999, name: "Nocodeford United", code: null } };
  const normalized = normalizeClub(noCode, "39");
  assert.equal(normalized.shortName, "NOC");
});

test("normalizeClub: a real club (team.national absent or false) is never flagged as a national team", () => {
  assert.equal(normalizeClub(teams.response[0], "39").isNationalTeam, false);
  const explicitlyFalse = { team: { id: 1, name: "Some Club", code: "SOM", national: false } };
  assert.equal(normalizeClub(explicitlyFalse, "39").isNationalTeam, false);
});

test("normalizeClub: team.national true (Pass 14) sets isNationalTeam -- the only signal this ever uses, never inferred from name/country", () => {
  const france = { team: { id: 2, name: "France", code: "FRA", national: true } };
  const normalized = normalizeClub(france, "1");
  assert.equal(normalized.isNationalTeam, true);
  assert.equal(normalized.shortName, "FRA");
});

test("normalizeClub never carries an Eleven-style 'id' field", () => {
  const normalized = normalizeClub(teams.response[0], "39");
  assert.equal("id" in normalized, false);
});

// ---------------------------------------------------------------------
// mapPosition / normalizePlayer
// ---------------------------------------------------------------------

test("mapPosition maps every API-Football position string Eleven understands", () => {
  assert.equal(mapPosition("Goalkeeper"), "GK");
  assert.equal(mapPosition("Defender"), "DEF");
  assert.equal(mapPosition("Midfielder"), "MID");
  assert.equal(mapPosition("Attacker"), "FWD");
});

test("mapPosition returns undefined for null/unrecognized positions rather than guessing", () => {
  assert.equal(mapPosition(null), undefined);
  assert.equal(mapPosition(undefined), undefined);
  assert.equal(mapPosition("Referee"), undefined);
});

test("normalizePlayer maps a recognized player correctly", () => {
  const normalized = normalizePlayer(players.response[0], "50", "39");
  assert.ok(normalized);
  assert.equal(normalized.externalId, "1100");
  assert.equal(normalized.clubExternalId, "50");
  assert.equal(normalized.competitionExternalId, "39");
  assert.equal(normalized.name, "Erling Haaland");
  assert.equal(normalized.position, "FWD");
  assert.equal(normalized.shirtNumber, 9);
  assert.equal(normalized.nationality, "Norway");
  assert.equal(normalized.active, true);
});

test("normalizePlayer falls back to full name when lastname is null", () => {
  const normalized = normalizePlayer(players.response[1], "50", "39");
  assert.ok(normalized);
  assert.equal(normalized.shortName, "Ederson");
  assert.equal(normalized.position, "GK");
});

test("normalizePlayer returns null (never a guessed position) when the provider position doesn't map", () => {
  const normalized = normalizePlayer(players.response[2], "50", "39");
  assert.equal(normalized, null);
});

test("normalizePlayer's externalId is a provider id string, never an Eleven uuid field", () => {
  const normalized = normalizePlayer(players.response[0], "50", "39");
  assert.ok(normalized);
  assert.equal("id" in normalized, false);
  assert.equal(typeof normalized.externalId, "string");
});

test('mapPosition recognizes "Forward" as a synonym for "Attacker" (both -> FWD)', () => {
  assert.equal(mapPosition("Forward"), "FWD");
  assert.equal(mapPosition("Attacker"), "FWD");
});

// ---------------------------------------------------------------------
// Regression: Raphinha at Barcelona was silently skipped in the Pass 8
// population because a player's `statistics` array has one entry PER
// COMPETITION (Spanish Super Cup, UCL, La Liga — same club, different
// league.id), and the old normalizePlayer picked whichever entry sorted
// first by team.id alone. Raphinha's Super Cup entry happened to sort
// first and reported position "Forward" (unrecognized at the time),
// producing a `null` normalized player even though his La Liga entry
// (the actual competition being synced) reported the perfectly valid
// "Attacker" with shirt number 11. See docs/football-data-system.md
// "Player universe integrity."
// ---------------------------------------------------------------------

test("normalizePlayer selects the statistics entry for the REQUESTED competition, not just the first team match (Raphinha regression)", () => {
  const raphinha = players.response[3];
  // Syncing La Liga (competitionExternalId "39" in this fixture's ids) —
  // must pick the third entry (league.id 39), not the first (Super Cup,
  // league.id 556, position "Forward").
  const normalized = normalizePlayer(raphinha, "50", "39");
  assert.ok(normalized, "Raphinha must not be skipped");
  assert.equal(normalized.position, "FWD");
  assert.equal(normalized.shirtNumber, 11);
});

test("normalizePlayer falls back to any recognized-position entry for the club when the exact competition entry is absent", () => {
  const raphinha = players.response[3];
  // No statistics entry has league.id "999" — must fall back to a
  // recognized-position entry (UCL or La Liga, both "Attacker") rather
  // than the unrecognized-position Super Cup entry that happens to be
  // first in the array.
  const normalized = normalizePlayer(raphinha, "50", "999");
  assert.ok(normalized, "must fall back rather than picking the unrecognized-position entry");
  assert.equal(normalized.position, "FWD");
});

test("normalizePlayer never selects a statistics entry for a different club", () => {
  const raphinha = players.response[3];
  const normalized = normalizePlayer(raphinha, "999-not-his-club", "39");
  // Every entry is for club "50" — a request for a different club must
  // not silently fall back to one of them.
  assert.equal(normalized, null);
});

// ---------------------------------------------------------------------
// mapFixtureStatus / normalizeFixture
// ---------------------------------------------------------------------

test("mapFixtureStatus maps common short codes into Eleven's FixtureStatus vocabulary", () => {
  assert.equal(mapFixtureStatus("NS"), "scheduled");
  assert.equal(mapFixtureStatus("1H"), "live");
  assert.equal(mapFixtureStatus("HT"), "ht");
  assert.equal(mapFixtureStatus("FT"), "final");
  assert.equal(mapFixtureStatus("PST"), "postponed");
});

test("mapFixtureStatus falls back to scheduled for an unrecognized code rather than throwing", () => {
  assert.equal(mapFixtureStatus("SOME_NEW_CODE"), "scheduled");
});

test("normalizeFixture maps a scheduled fixture correctly", () => {
  const normalized = normalizeFixture(fixtures.response[0]);
  assert.equal(normalized.externalId, "900001");
  assert.equal(normalized.competitionExternalId, "39");
  assert.equal(normalized.homeClubExternalId, "50");
  assert.equal(normalized.awayClubExternalId, "42");
  assert.equal(normalized.status, "scheduled");
  assert.equal(normalized.kickoffAt, new Date("2026-10-03T14:00:00+00:00").toISOString());
  assert.equal(normalized.round, "Regular Season - 8");
});

test("normalizeFixture maps a finished fixture correctly", () => {
  const normalized = normalizeFixture(fixtures.response[1]);
  assert.equal(normalized.status, "final");
});

test("normalizeFixture maps the final score for a completed fixture", () => {
  const normalized = normalizeFixture(fixtures.response[1]);
  assert.equal(normalized.homeScore, 2);
  assert.equal(normalized.awayScore, 1);
});

test("normalizeFixture leaves the score undefined (never 0) before kickoff", () => {
  const normalized = normalizeFixture(fixtures.response[0]);
  assert.equal(normalized.homeScore, undefined);
  assert.equal(normalized.awayScore, undefined);
});

test("normalizeFixture maps a postponed fixture correctly", () => {
  const normalized = normalizeFixture(fixtures.response[2]);
  assert.equal(normalized.status, "postponed");
});

test("normalizeFixture never carries an Eleven-style 'id' field", () => {
  const normalized = normalizeFixture(fixtures.response[0]);
  assert.equal("id" in normalized, false);
});

// ---------------------------------------------------------------------
// normalizeFixturePlayerStats
// ---------------------------------------------------------------------

test("normalizeFixturePlayerStats flattens both teams into one row per player", () => {
  const rows = normalizeFixturePlayerStats(fixturePlayers.response, "900002");
  assert.equal(rows.length, 4);
  assert.deepEqual(
    rows.map((r) => r.playerExternalId),
    ["1200", "1201", "1100", "1101"]
  );
  assert.ok(rows.every((r) => r.fixtureExternalId === "900002"));
});

test("normalizeFixturePlayerStats maps a starter's stats and started=true", () => {
  const rows = normalizeFixturePlayerStats(fixturePlayers.response, "900002");
  const scorer = rows.find((r) => r.playerExternalId === "1200")!;
  assert.equal(scorer.started, true);
  assert.equal(scorer.minutes, 90);
  assert.equal(scorer.goals, 1);
  assert.equal(scorer.shotsOnTarget, 3);
  assert.equal(scorer.chancesCreated, 2);
  assert.equal(scorer.interceptions, 2);
});

test("normalizeFixturePlayerStats maps a substitute's stats and started=false", () => {
  const rows = normalizeFixturePlayerStats(fixturePlayers.response, "900002");
  const sub = rows.find((r) => r.playerExternalId === "1201")!;
  assert.equal(sub.started, false);
  assert.equal(sub.minutes, 12);
  assert.equal(sub.assists, 1);
  assert.equal(sub.yellowCards, 1);
});

test("normalizeFixturePlayerStats maps a goalkeeper's saves via the goals.saves field", () => {
  const rows = normalizeFixturePlayerStats(fixturePlayers.response, "900002");
  const keeper = rows.find((r) => r.playerExternalId === "1101")!;
  assert.equal(keeper.saves, 5);
});

test("normalizeFixturePlayerStats defaults null provider fields to 0, never undefined", () => {
  const rows = normalizeFixturePlayerStats(fixturePlayers.response, "900002");
  const outfielder = rows.find((r) => r.playerExternalId === "1200")!;
  assert.equal(outfielder.saves, 0);
});

// ---------------------------------------------------------------------
// normalizeCoverage
// ---------------------------------------------------------------------

test("normalizeCoverage reflects the season's actual coverage flags, not a blanket assumption", () => {
  const season2025 = leagues.response[0].seasons[0];
  const season2026 = leagues.response[0].seasons[1];

  const coverage2025 = normalizeCoverage(season2025);
  assert.equal(coverage2025.playerStatistics, true);
  assert.equal(coverage2025.injuries, true);

  const coverage2026 = normalizeCoverage(season2026);
  assert.equal(coverage2026.playerStatistics, false);
  assert.equal(coverage2026.injuries, false);
  assert.equal(coverage2026.events, true);
});
