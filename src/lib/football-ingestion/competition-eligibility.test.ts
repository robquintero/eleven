import { test } from "node:test";
import assert from "node:assert/strict";
import {
  INTERNATIONAL_SCORING_EPOCH,
  isDraftableCompetitionCode,
  isEligibleFixtureKickoff,
  isInternationalScoringCompetitionCode,
  isScoringEligibleCompetitionCode,
} from "./competition-eligibility.ts";

test("isDraftableCompetitionCode: Big Five domestic leagues are draftable", () => {
  for (const code of ["ENG", "ESP", "GER", "ITA", "FRA"]) {
    assert.equal(isDraftableCompetitionCode(code), true, code);
  }
});

test("isDraftableCompetitionCode: UEFA club competitions are NOT draftable (scoring-eligible only)", () => {
  assert.equal(isDraftableCompetitionCode("UCL"), false);
  assert.equal(isDraftableCompetitionCode("UEL"), false);
});

test("isDraftableCompetitionCode: no international competition is ever draftable", () => {
  assert.equal(isDraftableCompetitionCode("FIFA_WC"), false);
  assert.equal(isDraftableCompetitionCode("UEFA_EURO"), false);
  assert.equal(isDraftableCompetitionCode("COPA_AMERICA"), false);
});

test("isScoringEligibleCompetitionCode: Premier League is included", () => {
  assert.equal(isScoringEligibleCompetitionCode("ENG"), true);
});

test("isScoringEligibleCompetitionCode: UCL and UEL are included", () => {
  assert.equal(isScoringEligibleCompetitionCode("UCL"), true);
  assert.equal(isScoringEligibleCompetitionCode("UEL"), true);
});

test("isScoringEligibleCompetitionCode: every brief-named international competition is included", () => {
  const expectedIncluded = [
    "FIFA_WC",
    "FIFA_WCQ_EUR",
    "FIFA_WCQ_AFR",
    "FIFA_WCQ_ASIA",
    "FIFA_WCQ_CONCACAF",
    "FIFA_WCQ_SAM",
    "FIFA_WCQ_OFC",
    "UEFA_EURO",
    "UEFA_EURO_Q",
    "UEFA_NL",
    "COPA_AMERICA",
    "AFCON",
    "AFCON_Q",
    "AFC_ASIAN_CUP",
    "AFC_ASIAN_CUP_Q",
    "CONCACAF_GOLD_CUP",
    "CONCACAF_NL",
    "OFC_NATIONS_CUP",
  ];
  for (const code of expectedIncluded) {
    assert.equal(isScoringEligibleCompetitionCode(code), true, code);
  }
});

test("isScoringEligibleCompetitionCode: friendlies, youth, women's, Olympics, and unofficial tournaments are excluded", () => {
  const excluded = [
    "FRIENDLY",
    "FRIENDLIES",
    "UEFA_U21_EURO",
    "WORLD_CUP_U20",
    "WOMENS_WORLD_CUP",
    "OLYMPICS",
    "KINGS_WORLD_CUP_NATIONS",
    "",
    "unknown",
  ];
  for (const code of excluded) {
    assert.equal(isScoringEligibleCompetitionCode(code), false, code);
  }
});

test("isInternationalScoringCompetitionCode: true only for the international allowlist, not domestic/UEFA", () => {
  assert.equal(isInternationalScoringCompetitionCode("FIFA_WC"), true);
  assert.equal(isInternationalScoringCompetitionCode("ENG"), false);
  assert.equal(isInternationalScoringCompetitionCode("UCL"), false);
});

// ===========================================================================
// isEligibleFixtureKickoff -- Pass 14 go-live product-scope correction: the
// international scoring epoch (the real first UEFA Nations League fixture
// after the real 2026 World Cup final).
// ===========================================================================

test("INTERNATIONAL_SCORING_EPOCH is the real, grounded kickoff -- not a guess", () => {
  assert.equal(INTERNATIONAL_SCORING_EPOCH.toISOString(), "2026-09-24T16:00:00.000Z");
});

test("isEligibleFixtureKickoff: a Big Five fixture is always eligible, regardless of date -- the epoch never applies to domestic/UEFA competitions", () => {
  assert.equal(isEligibleFixtureKickoff("ENG", new Date("2000-01-01T00:00:00Z")), true);
  assert.equal(isEligibleFixtureKickoff("UCL", new Date("2000-01-01T00:00:00Z")), true);
});

test("isEligibleFixtureKickoff: an international fixture BEFORE the epoch is never eligible", () => {
  assert.equal(isEligibleFixtureKickoff("UEFA_NL", new Date("2026-09-24T15:59:59Z")), false);
  assert.equal(isEligibleFixtureKickoff("FIFA_WC", new Date("2026-07-19T19:00:00Z")), false, "even the real World Cup final itself, which precedes the epoch");
});

test("isEligibleFixtureKickoff: an international fixture AT or AFTER the epoch is eligible", () => {
  assert.equal(isEligibleFixtureKickoff("UEFA_NL", new Date("2026-09-24T16:00:00Z")), true, "the exact epoch fixture itself");
  assert.equal(isEligibleFixtureKickoff("FIFA_WCQ_EUR", new Date("2026-10-02T00:00:00Z")), true);
});
