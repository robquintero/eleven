import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeForSearch } from "./search-normalize.ts";

test("strips an acute accent -- 'mbappe' must find 'Mbappé'", () => {
  assert.equal(normalizeForSearch("Mbappé"), "Mbappe");
  assert.equal(normalizeForSearch("mbappe"), "mbappe");
  assert.equal(normalizeForSearch("Mbappé").toLowerCase(), normalizeForSearch("mbappe").toLowerCase());
});

test("representative additional diacritic cases across common Latin accents", () => {
  assert.equal(normalizeForSearch("Özil"), "Ozil");
  assert.equal(normalizeForSearch("Müller"), "Muller");
  assert.equal(normalizeForSearch("Hernández"), "Hernandez");
  assert.equal(normalizeForSearch("João"), "Joao");
  assert.equal(normalizeForSearch("Núñez"), "Nunez");
  assert.equal(normalizeForSearch("Saint-Étienne"), "Saint-Etienne");
});

test("a string with no diacritics is returned unchanged", () => {
  assert.equal(normalizeForSearch("Harry Kane"), "Harry Kane");
});

test("normalization is idempotent -- normalizing twice gives the same result", () => {
  const once = normalizeForSearch("Mbappé");
  assert.equal(normalizeForSearch(once), once);
});
