import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveUniqueClubCode } from "./club-codes.ts";

test("resolveUniqueClubCode returns the desired code unchanged when it isn't taken", () => {
  assert.equal(resolveUniqueClubCode("BAY", "157", new Set()), "BAY");
});

test("resolveUniqueClubCode regression: Bayern München vs Bayer Leverkusen both report code=BAY", () => {
  const taken = new Set<string>();
  const bayern = resolveUniqueClubCode("BAY", "157", taken);
  taken.add(bayern);
  const leverkusen = resolveUniqueClubCode("BAY", "168", taken);

  assert.equal(bayern, "BAY");
  assert.equal(leverkusen, "BAY168");
  assert.notEqual(bayern, leverkusen);
});
