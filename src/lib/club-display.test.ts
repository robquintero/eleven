import { test } from "node:test";
import assert from "node:assert/strict";
import { clubDisplayLabel, matchesClubQuery } from "./club-display.ts";

const manCity = { name: "Manchester City", shortName: "MCI" };
const barcelona = { name: "Barcelona", shortName: "BAR" };
const bayernMunich = { name: "Bayern München", shortName: "BAY" };
const bayerLeverkusen = { name: "Bayer Leverkusen", shortName: "BAY" };

test("clubDisplayLabel shows the full name and abbreviation together", () => {
  assert.equal(clubDisplayLabel(manCity), "Manchester City · MCI");
});

test("clubDisplayLabel keeps Bayern München and Bayer Leverkusen distinguishable even though their abbreviation is identical", () => {
  assert.equal(clubDisplayLabel(bayernMunich), "Bayern München · BAY");
  assert.equal(clubDisplayLabel(bayerLeverkusen), "Bayer Leverkusen · BAY");
  assert.notEqual(clubDisplayLabel(bayernMunich), clubDisplayLabel(bayerLeverkusen));
});

test("matchesClubQuery matches the full name", () => {
  assert.equal(matchesClubQuery(manCity, "Manchester City"), true);
  assert.equal(matchesClubQuery(manCity, "manchester"), true);
});

test("matchesClubQuery matches the abbreviation", () => {
  assert.equal(matchesClubQuery(manCity, "MCI"), true);
  assert.equal(matchesClubQuery(manCity, "mci"), true);
});

test("matchesClubQuery matches FC Barcelona's real-world alias 'Barcelona' and abbreviation 'BAR'", () => {
  assert.equal(matchesClubQuery(barcelona, "Barcelona"), true);
  assert.equal(matchesClubQuery(barcelona, "BAR"), true);
});

test("matchesClubQuery does not match an unrelated query", () => {
  assert.equal(matchesClubQuery(manCity, "Real Madrid"), false);
});

test("matchesClubQuery: Bayern München and Bayer Leverkusen remain independently searchable by full name despite the identical abbreviation", () => {
  assert.equal(matchesClubQuery(bayernMunich, "Bayern"), true);
  assert.equal(matchesClubQuery(bayernMunich, "Leverkusen"), false);
  assert.equal(matchesClubQuery(bayerLeverkusen, "Leverkusen"), true);
  assert.equal(matchesClubQuery(bayerLeverkusen, "Bayern"), false);
  // Both still match the shared abbreviation search — that's honest (the
  // provider genuinely gave them the same code), not a bug; the caller
  // disambiguates by club.id, never by this label.
  assert.equal(matchesClubQuery(bayernMunich, "BAY"), true);
  assert.equal(matchesClubQuery(bayerLeverkusen, "BAY"), true);
});

test("matchesClubQuery with an empty query matches everything", () => {
  assert.equal(matchesClubQuery(manCity, ""), true);
  assert.equal(matchesClubQuery(manCity, "   "), true);
});
