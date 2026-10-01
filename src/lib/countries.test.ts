import { test } from "node:test";
import assert from "node:assert/strict";
import { flagCodeForNationality, flagUrlForNationality } from "./countries.ts";

test("a known nationality maps to its flag code", () => {
  assert.equal(flagCodeForNationality("Spain"), "es");
  assert.equal(flagCodeForNationality("Brazil"), "br");
});

test("the 4 UK home nations each map to their own genuine football flag, not the generic United Kingdom flag", () => {
  assert.equal(flagCodeForNationality("England"), "gb-eng");
  assert.equal(flagCodeForNationality("Scotland"), "gb-sct");
  assert.equal(flagCodeForNationality("Wales"), "gb-wls");
  assert.equal(flagCodeForNationality("Northern Ireland"), "gb-nir");
});

test("common API-Football naming variants resolve to the same code as their canonical name", () => {
  assert.equal(flagCodeForNationality("Ivory Coast"), flagCodeForNationality("Côte d'Ivoire (Ivory Coast)"));
  assert.equal(flagCodeForNationality("USA"), flagCodeForNationality("United States"));
  assert.equal(flagCodeForNationality("South Korea"), flagCodeForNationality("Korea Republic"));
  assert.equal(flagCodeForNationality("DR Congo"), flagCodeForNationality("Congo DR"));
});

test("an unrecognized nationality string (e.g. API-Football's own 'Unknown') has no mapping", () => {
  assert.equal(flagCodeForNationality("Unknown"), null);
  assert.equal(flagCodeForNationality("Not a real country"), null);
});

test("null/undefined/empty nationality has no mapping", () => {
  assert.equal(flagCodeForNationality(null), null);
  assert.equal(flagCodeForNationality(undefined), null);
  assert.equal(flagCodeForNationality(""), null);
});

test("flagUrlForNationality builds a flagcdn.com SVG URL for a known nationality", () => {
  assert.equal(flagUrlForNationality("Spain"), "https://flagcdn.com/es.svg");
});

test("flagUrlForNationality returns null (never a broken/placeholder URL) for an unmapped nationality", () => {
  assert.equal(flagUrlForNationality("Unknown"), null);
  assert.equal(flagUrlForNationality(null), null);
});

test("every supported country/region has a non-empty 2-or-more-character code", () => {
  const sampleNationalities = ["France", "Germany", "Argentina", "Nigeria", "Japan", "Wales"];
  for (const nationality of sampleNationalities) {
    const code = flagCodeForNationality(nationality);
    assert.ok(code && code.length >= 2, `${nationality} should have a real flag code`);
  }
});
