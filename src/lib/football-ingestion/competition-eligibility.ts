/**
 * Pass 14 (brief §3): the one authoritative definition of which
 * competitions are SCORING-ELIGIBLE, composed from the three existing,
 * already-separate competition code sets rather than a fourth hand-copied
 * array. Nothing else in the codebase should maintain its own list of
 * "which competitions count" — import from here.
 *
 * DRAFTABLE vs SCORING-ELIGIBLE are deliberately different sets, and
 * a competition being scoring-eligible must never imply its clubs/
 * players become draftable:
 *
 *   Draftable   = Big Five domestic leagues only (unchanged by this pass
 *                 — see BIG_FIVE_COMPETITION_CODES, which already gates
 *                 the draftable player pool via players.competition_id).
 *   Scoring-eligible = Big Five + UCL/UEL + the Pass 14 international
 *                 allowlist (INTERNATIONAL_COMPETITION_CODES).
 *
 * This module is pure (no I/O) and lives next to `resolve-competition.ts`
 * (not `src/domain`) because it composes provider-layer code unions
 * (UEFA/international configs carry real provider league ids) — see
 * docs/architecture.md's domain layer being provider-independent.
 * `src/lib/fantasy-engine/round-eligibility.ts`'s window/date logic stays
 * fully competition-agnostic by design (docs/international-scoring.md
 * §1 item 3) — this module exists as the explicit, testable safety net
 * for ingestion/scoring code to check a fixture's competition against,
 * never to be threaded into the round-window math itself.
 */
import { BIG_FIVE_COMPETITION_CODES } from "../../domain/football/constants.ts";
import { INTERNATIONAL_COMPETITION_CODES } from "../football-providers/api-football/international-competitions.ts";
import { isUefaCompetitionCode } from "../football-providers/api-football/uefa-competitions.ts";

const SCORING_ELIGIBLE_CODES: ReadonlySet<string> = new Set<string>([
  ...BIG_FIVE_COMPETITION_CODES,
  "UCL",
  "UEL",
  ...INTERNATIONAL_COMPETITION_CODES,
]);

/** The draftable universe is unchanged by this pass — Big Five only. Never implied by scoring eligibility. */
export function isDraftableCompetitionCode(code: string): boolean {
  return (BIG_FIVE_COMPETITION_CODES as readonly string[]).includes(code);
}

/** Big Five + UCL/UEL + the Pass 14 international allowlist. The single check any new ingestion/scoring call site should use instead of hand-copying a competition list. */
export function isScoringEligibleCompetitionCode(code: string): boolean {
  return SCORING_ELIGIBLE_CODES.has(code);
}

/** True only for `isScoringEligibleCompetitionCode(code) && isUefaCompetitionCode(code) === false && !isDraftableCompetitionCode(code)` — i.e. an international competition specifically, as opposed to a domestic or UEFA club competition. Useful wherever international-specific behavior (e.g. national-team squad sync) needs to branch. */
export function isInternationalScoringCompetitionCode(code: string): boolean {
  return (INTERNATIONAL_COMPETITION_CODES as readonly string[]).includes(code);
}

export { isUefaCompetitionCode };
