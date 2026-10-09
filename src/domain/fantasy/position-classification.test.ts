import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resolveCanonicalPosition,
  classifyMatchAppearanceEvidence,
  type PositionOverride,
} from "./position-classification.ts";

function override(overrides: Partial<PositionOverride> = {}): PositionOverride {
  return {
    playerId: "player-1",
    providerPositionAtOverride: "MID",
    overridePosition: "DEF",
    reason: "9 of 10 logged match appearances show D",
    evidenceSource: "match_appearance_majority",
    confidence: "LIKELY",
    createdByUserId: "admin-1",
    createdAt: "2026-10-09T00:00:00.000Z",
    ...overrides,
  };
}

test("resolveCanonicalPosition: no override -> provider broad classification wins (precedence tier 3)", () => {
  const result = resolveCanonicalPosition("MID", null);
  assert.deepEqual(result, { position: "MID", source: "provider_broad_classification", override: null });
});

test("resolveCanonicalPosition: an approved override always outranks the provider classification (precedence tier 1)", () => {
  const ov = override();
  const result = resolveCanonicalPosition("MID", ov);
  assert.equal(result.position, "DEF");
  assert.equal(result.source, "override");
  assert.equal(result.override, ov);
});

test("resolveCanonicalPosition never mutates or depends on the override's stale snapshot field for the resolved value", () => {
  // Even if providerPositionAtOverride is now stale relative to a fresh
  // provider resync, the override's own overridePosition still wins --
  // the snapshot field is provenance only, never re-derived into the result.
  const ov = override({ providerPositionAtOverride: "FWD" });
  const result = resolveCanonicalPosition("GK", ov);
  assert.equal(result.position, "DEF");
});

test("classifyMatchAppearanceEvidence: zero logged appearances -> insufficient evidence, no disagreement claimed", () => {
  const result = classifyMatchAppearanceEvidence({ codeCounts: {} }, "MID");
  assert.equal(result.totalAppearances, 0);
  assert.equal(result.confidence, "INSUFFICIENT_EVIDENCE");
  assert.equal(result.disagreesWithProviderBroadClassification, false);
  assert.equal(result.majorityPosition, null);
});

test("classifyMatchAppearanceEvidence: majority agrees with provider classification -> no disagreement, regardless of sample size", () => {
  const result = classifyMatchAppearanceEvidence({ codeCounts: { F: 12 } }, "FWD");
  assert.equal(result.disagreesWithProviderBroadClassification, false);
  assert.equal(result.confidence, "INSUFFICIENT_EVIDENCE");
});

test("classifyMatchAppearanceEvidence: real incident case -- 9 of 10 appearances as D vs. provider MID -> LIKELY disagreement, never CONFIRMED", () => {
  // Mirrors the actual M. Guehi finding from the 5 Men of Class draft
  // snapshot cross-check: provider broad classification says MID, but
  // 9/10 already-ingested match appearances logged him as D.
  const result = classifyMatchAppearanceEvidence({ codeCounts: { D: 9, M: 1 } }, "MID");
  assert.equal(result.totalAppearances, 10);
  assert.equal(result.majorityPosition, "DEF");
  assert.equal(result.disagreesWithProviderBroadClassification, true);
  assert.equal(result.confidence, "LIKELY");
});

test("classifyMatchAppearanceEvidence: a near-even split (5 vs 4) never reaches LIKELY -- stays AMBIGUOUS", () => {
  // Mirrors the actual M. Rogers finding: 5 appearances as M, 4 as F,
  // against a provider classification of FWD -- a real split, not a
  // confident signal either way.
  const result = classifyMatchAppearanceEvidence({ codeCounts: { M: 5, F: 4 } }, "FWD");
  assert.equal(result.disagreesWithProviderBroadClassification, true);
  assert.equal(result.confidence, "AMBIGUOUS");
});

test("classifyMatchAppearanceEvidence: a single unusual appearance is never enough to flag even AMBIGUOUS confidently -- capped at INSUFFICIENT_EVIDENCE", () => {
  const result = classifyMatchAppearanceEvidence({ codeCounts: { D: 1 } }, "MID");
  assert.equal(result.totalAppearances, 1);
  assert.equal(result.disagreesWithProviderBroadClassification, true);
  assert.equal(result.confidence, "INSUFFICIENT_EVIDENCE", "one appearance must never be mistaken for a reliable signal");
});

test("classifyMatchAppearanceEvidence: small-but-lopsided sample (3 of 4) stays below LIKELY's appearance-count floor -- AMBIGUOUS, not LIKELY", () => {
  // Mirrors the actual A. Amaimouni finding: 3/4 appearances as F against
  // a provider classification of MID. Share (0.75) clears the share bar
  // alone, but the appearance-count floor (5) deliberately keeps this at
  // AMBIGUOUS so a 4-game sample is never auto-correction-eligible.
  const result = classifyMatchAppearanceEvidence({ codeCounts: { F: 3, M: 1 } }, "MID");
  assert.equal(result.totalAppearances, 4);
  assert.equal(result.majorityShare, 0.75);
  assert.equal(result.confidence, "AMBIGUOUS");
});

test("classifyMatchAppearanceEvidence: confidence can never reach CONFIRMED from this function, even with a unanimous large sample", () => {
  const result = classifyMatchAppearanceEvidence({ codeCounts: { D: 50 } }, "MID");
  assert.equal(result.confidence, "LIKELY");
  assert.notEqual(result.confidence, "CONFIRMED");
});
