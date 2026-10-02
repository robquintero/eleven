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

/**
 * Pass 14 go-live product-scope correction: Eleven's international
 * scoring HISTORY begins here, not at the start of whatever historical
 * fixture metadata the provider happens to return for a competition/
 * season. Defined as the real kickoff of the first UEFA Nations League
 * match played after the real 2026 FIFA World Cup final — grounded in
 * real production data, not guessed: the World Cup final kicked off
 * 2026-07-19T19:00:00Z (real, stored FIFA_WC fixture); the first UEFA_NL
 * fixture after it is Andorra vs Malta, Eleven fixture
 * d9de1736-863b-4453-b1ef-fce85193b30f, provider fixture id 1545601.
 *
 * This is NOT an ingestion-time filter — older international fixture
 * METADATA (kickoff dates, results, the schedule itself) may still exist
 * in `fixtures` for catalog/discovery purposes; retaining it is harmless
 * and was already done before this boundary was introduced. This is
 * specifically the boundary for whether an international fixture's
 * performance may ever be converted into a scored `fantasy_player_scores`
 * row — see `backfillScores`'s own use of `isEligibleFixtureKickoff`.
 */
export const INTERNATIONAL_SCORING_EPOCH = new Date("2026-09-24T16:00:00Z");

/**
 * Whether a fixture in competition `code`, kicking off at `kickoffAt`, may
 * ever be scored. Big Five/UEFA club competitions are unaffected — this
 * pass only ever restricts INTERNATIONAL competitions, which must
 * additionally kick off at or after `INTERNATIONAL_SCORING_EPOCH`.
 */
export function isEligibleFixtureKickoff(code: string, kickoffAt: Date): boolean {
  if (!isInternationalScoringCompetitionCode(code)) return true;
  return kickoffAt.getTime() >= INTERNATIONAL_SCORING_EPOCH.getTime();
}

export { isUefaCompetitionCode };
