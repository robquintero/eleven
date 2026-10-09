/**
 * Canonical fantasy-position resolution (Pass 2, position accuracy).
 *
 * Eleven's provider (API-Football) only ever reports a broad GK/DEF/MID/FWD
 * bucket for a player — never a detailed role (CB/LB/CDM/CAM/...). There is
 * no provider endpoint ingested today that carries finer-grained evidence;
 * `/fixtures/lineups` (the one endpoint that could, via its grid/formation
 * data) has never been called. So "detailed positional evidence" in
 * practice today means: multiple independent broad-bucket observations
 * (the season-aggregate `players.position` vs. per-match appearance codes
 * already stored in `football_provider_snapshots`), not a finer role.
 *
 * `players.position` itself is NEVER overwritten by this module — it is
 * raw provider evidence and stays exactly as ingested (docs/domain-model.md
 * invariant on provider evidence). A correction is recorded as a separate,
 * additive override; the canonical/"effective" position a caller should
 * actually use is always resolved through `resolveCanonicalPosition`.
 *
 * Precedence (product-owner approved, Pass 2 brief section 3):
 *   1. An approved manual override
 *   2. Verified detailed positional evidence (none exists today — reserved
 *      for if/when `/fixtures/lineups` or an equivalent source is added)
 *   3. The existing provider broad classification (`players.position`)
 *   4. Explicit unresolved state (never silently defaults past this)
 */

import type { PlayerPosition } from "../football/types.ts";

export type PositionConfidence = "CONFIRMED" | "LIKELY" | "AMBIGUOUS" | "INSUFFICIENT_EVIDENCE";

export type PositionEvidenceSource =
  | "provider_broad_classification"
  | "match_appearance_majority"
  | "detailed_lineup_evidence"
  | "manual_review";

export interface PositionOverride {
  playerId: string;
  /** The provider broad classification at the moment the override was recorded — never mutated afterward, so a later provider resync can never silently erase why this override was made. */
  providerPositionAtOverride: PlayerPosition;
  overridePosition: PlayerPosition;
  reason: string;
  evidenceSource: PositionEvidenceSource;
  confidence: PositionConfidence;
  createdByUserId: string;
  createdAt: string;
}

export interface CanonicalPositionResult {
  position: PlayerPosition;
  source: "override" | "provider_broad_classification" | "unresolved";
  override: PositionOverride | null;
}

/**
 * The single function any caller (draft eligibility, roster validation,
 * lineup initialization, scoring) should use instead of reading
 * `players.position` directly, once overrides exist. Until an override is
 * approved for a player, this is identical to the provider classification
 * — introducing this function changes no behavior by itself.
 */
export function resolveCanonicalPosition(
  providerPosition: PlayerPosition,
  activeOverride: PositionOverride | null
): CanonicalPositionResult {
  if (activeOverride) {
    return { position: activeOverride.overridePosition, source: "override", override: activeOverride };
  }
  if (providerPosition) {
    return { position: providerPosition, source: "provider_broad_classification", override: null };
  }
  // Unreachable while `players.position` remains NOT NULL in the schema;
  // kept explicit per the brief's "explicit unresolved classification"
  // requirement rather than ever silently guessing.
  throw new Error("UNRESOLVED_POSITION");
}

/** Per-match appearance position codes as already stored (broad-bucket only — see module doc). */
const MATCH_APPEARANCE_CODE_TO_POSITION: Record<string, PlayerPosition> = {
  G: "GK",
  D: "DEF",
  M: "MID",
  F: "FWD",
};

export interface MatchAppearanceTally {
  /** Raw provider per-match position code -> number of logged appearances with that code. */
  codeCounts: Record<string, number>;
}

export interface MatchAppearanceClassification {
  totalAppearances: number;
  majorityPosition: PlayerPosition | null;
  majorityShare: number;
  /** True when the majority match-logged position differs from the provider's current broad classification — a candidate for human review, never an instruction to auto-correct. */
  disagreesWithProviderBroadClassification: boolean;
  /**
   * Confidence in the evidence itself. Capped at LIKELY: this signal is
   * still broad-bucket-only (G/D/M/F), never a detailed role, so per the
   * brief it can never alone reach CONFIRMED — that tier is reserved for
   * verified detailed evidence (section 3, precedence tier 2) or an
   * approved manual override, neither of which this function produces.
   */
  confidence: Exclude<PositionConfidence, "CONFIRMED">;
}

/**
 * Classifies a player's real match-appearance history (already-ingested
 * `/fixtures/players` snapshots — zero new provider requests) against the
 * provider's current broad classification. This can surface a genuine
 * disagreement (e.g. a player logged as "D" in 9 of 10 real appearances
 * despite a season-aggregate bucket of "Midfielder") using evidence Eleven
 * already has — but it can never produce a role finer than GK/DEF/MID/FWD,
 * and per the brief it must never be the sole trigger for an AUTOMATIC
 * correction. A small sample (few logged appearances) is deliberately
 * capped at AMBIGUOUS/INSUFFICIENT_EVIDENCE, never LIKELY, regardless of
 * how lopsided the split looks.
 */
export function classifyMatchAppearanceEvidence(
  tally: MatchAppearanceTally,
  providerBroadClassification: PlayerPosition
): MatchAppearanceClassification {
  const entries = Object.entries(tally.codeCounts).map(([code, count]) => ({
    position: MATCH_APPEARANCE_CODE_TO_POSITION[code] ?? null,
    count,
  }));
  const totalAppearances = entries.reduce((sum, e) => sum + e.count, 0);

  if (totalAppearances === 0) {
    return {
      totalAppearances: 0,
      majorityPosition: null,
      majorityShare: 0,
      disagreesWithProviderBroadClassification: false,
      confidence: "INSUFFICIENT_EVIDENCE",
    };
  }

  let majorityPosition: PlayerPosition | null = null;
  let majorityCount = 0;
  for (const e of entries) {
    if (e.position && e.count > majorityCount) {
      majorityCount = e.count;
      majorityPosition = e.position;
    }
  }
  const majorityShare = majorityCount / totalAppearances;
  const disagrees = majorityPosition !== null && majorityPosition !== providerBroadClassification;

  if (!disagrees) {
    return { totalAppearances, majorityPosition, majorityShare, disagreesWithProviderBroadClassification: false, confidence: "INSUFFICIENT_EVIDENCE" };
  }

  // Deliberately conservative thresholds for flagging a disagreement as
  // worth a human's attention — see "no automatic correction from one
  // unusual appearance" in the brief. These gate ELIGIBILITY for review,
  // never an automatic write.
  const MIN_APPEARANCES_FOR_LIKELY = 5;
  const MIN_SHARE_FOR_LIKELY = 0.7;

  let confidence: Exclude<PositionConfidence, "CONFIRMED">;
  if (totalAppearances < 3) {
    confidence = "INSUFFICIENT_EVIDENCE";
  } else if (totalAppearances >= MIN_APPEARANCES_FOR_LIKELY && majorityShare >= MIN_SHARE_FOR_LIKELY) {
    confidence = "LIKELY";
  } else {
    confidence = "AMBIGUOUS";
  }

  return { totalAppearances, majorityPosition, majorityShare, disagreesWithProviderBroadClassification: true, confidence };
}
