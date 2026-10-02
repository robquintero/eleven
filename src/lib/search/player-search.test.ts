import { test } from "node:test";
import assert from "node:assert/strict";
import { shouldSearchPlayers, MIN_PLAYER_SEARCH_LENGTH } from "./player-search.ts";

test("empty and single-character queries never trigger a search", () => {
  assert.equal(shouldSearchPlayers(""), false);
  assert.equal(shouldSearchPlayers(" "), false);
  assert.equal(shouldSearchPlayers("a"), false);
});

test("a query at exactly the minimum length triggers a search", () => {
  assert.equal(MIN_PLAYER_SEARCH_LENGTH, 2);
  assert.equal(shouldSearchPlayers("ab"), true);
});

test("leading/trailing whitespace doesn't count toward the minimum length", () => {
  assert.equal(shouldSearchPlayers(" a "), false, "trimmed length is 1, still below the minimum");
  assert.equal(shouldSearchPlayers("  ab  "), true, "trimmed length is 2, at the minimum");
});

test("a real multi-character query triggers a search", () => {
  assert.equal(shouldSearchPlayers("mbappe"), true);
  assert.equal(shouldSearchPlayers("Mbappé"), true);
});
