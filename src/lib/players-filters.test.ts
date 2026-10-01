import { test } from "node:test";
import assert from "node:assert/strict";
import { defaultFilters, filtersToSearchParams, parseFiltersFromSearchParams } from "./players-filters.ts";

test("parseFiltersFromSearchParams defaults to the same shape as defaultFilters when given no params", () => {
  const { filters, page } = parseFiltersFromSearchParams({});
  assert.deepEqual(filters, defaultFilters);
  assert.equal(page, 1);
});

test("parseFiltersFromSearchParams reads every recognized param", () => {
  const { filters, page } = parseFiltersFromSearchParams({
    q: "haaland",
    pos: "FWD",
    comp: "comp-uuid",
    club: "club-uuid",
    own: "owned",
    avail: "injured",
    sort: "club",
    page: "3",
  });

  assert.equal(filters.query, "haaland");
  assert.equal(filters.position, "FWD");
  assert.equal(filters.competitionId, "comp-uuid");
  assert.equal(filters.clubId, "club-uuid");
  assert.equal(filters.ownership, "owned");
  assert.equal(filters.availability, "injured");
  assert.equal(filters.sort, "club");
  assert.equal(page, 3);
});

test("parseFiltersFromSearchParams falls back to ALL/points for unrecognized enum values rather than throwing", () => {
  const { filters } = parseFiltersFromSearchParams({ pos: "not-a-position", sort: "bogus" });
  assert.equal(filters.position, "ALL");
  assert.equal(filters.sort, "points");
});

test("parseFiltersFromSearchParams clamps page to at least 1", () => {
  assert.equal(parseFiltersFromSearchParams({ page: "0" }).page, 1);
  assert.equal(parseFiltersFromSearchParams({ page: "-5" }).page, 1);
  assert.equal(parseFiltersFromSearchParams({ page: "abc" }).page, 1);
});

test("filtersToSearchParams omits every field at its default", () => {
  const params = filtersToSearchParams(defaultFilters, 1);
  assert.equal(params.toString(), "");
});

test("filtersToSearchParams and parseFiltersFromSearchParams round-trip a non-default state", () => {
  const filters = { ...defaultFilters, query: "salah", position: "FWD" as const, sort: "club" as const };
  const params = filtersToSearchParams(filters, 2);
  const parsed = parseFiltersFromSearchParams(Object.fromEntries(params.entries()));

  assert.deepEqual(parsed.filters, filters);
  assert.equal(parsed.page, 2);
});
