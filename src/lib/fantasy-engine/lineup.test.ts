import { test } from "node:test";
import assert from "node:assert/strict";
import { LINEUP_ERROR_KIND, type LineupUpdateErrorCode } from "./lineup.ts";

// Pass 14.7 Phase 5: protects the rule-vs-error classification every
// lineup action (team/actions.ts) builds its user-facing feedback from --
// an expected game-rule outcome (the player's match already started, an
// invalid formation, no round open yet) must never render with the same
// red/error treatment as a genuine unexpected failure (a stale roster
// reference, a real database write failure).

test("LINEUP_ERROR_KIND: expected game-rule outcomes are classified 'rule', never 'error'", () => {
  const ruleCodes: LineupUpdateErrorCode[] = ["ROUND_NOT_FOUND", "SLOT_LOCKED", "INVALID_FORMATION"];
  for (const code of ruleCodes) {
    assert.equal(LINEUP_ERROR_KIND[code], "rule", `${code} must be classified as an expected rule outcome`);
  }
});

test("LINEUP_ERROR_KIND: genuine unexpected failures are classified 'error', never 'rule'", () => {
  const errorCodes: LineupUpdateErrorCode[] = ["ROSTER_ENTRY_NOT_ON_TEAM", "WRITE_FAILED"];
  for (const code of errorCodes) {
    assert.equal(LINEUP_ERROR_KIND[code], "error", `${code} must be classified as a genuine error, not a game rule`);
  }
});

test("LINEUP_ERROR_KIND: every LineupUpdateErrorCode has exactly one classification (no code silently falls through unclassified)", () => {
  const allCodes: LineupUpdateErrorCode[] = ["ROUND_NOT_FOUND", "SLOT_LOCKED", "INVALID_FORMATION", "ROSTER_ENTRY_NOT_ON_TEAM", "WRITE_FAILED"];
  for (const code of allCodes) {
    assert.ok(LINEUP_ERROR_KIND[code] === "rule" || LINEUP_ERROR_KIND[code] === "error");
  }
  assert.equal(Object.keys(LINEUP_ERROR_KIND).length, allCodes.length, "LINEUP_ERROR_KIND must stay exhaustive as new codes are added");
});
