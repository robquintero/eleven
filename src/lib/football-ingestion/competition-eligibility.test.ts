import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isDraftableCompetitionCode,
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
