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
  normalizePlayer,
} from "./adapter.ts";
import { getBigFiveCompetition } from "./big-five-competitions.ts";
import type {
  ApiFootballEnvelope,
  ApiFootballFixtureItem,
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
  });
});

test("normalizeClub falls back to a derived short code when the provider omits one", () => {
  const noCode = { team: { id: 999, name: "Nocodeford United", code: null } };
  const normalized = normalizeClub(noCode, "39");
  assert.equal(normalized.shortName, "NOC");
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
});

test("normalizeFixture maps a finished fixture correctly", () => {
  const normalized = normalizeFixture(fixtures.response[1]);
  assert.equal(normalized.status, "final");
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
