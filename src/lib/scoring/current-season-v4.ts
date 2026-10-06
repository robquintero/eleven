import { BIG_FIVE_COMPETITIONS } from "../football-providers/api-football/big-five-competitions.ts";
import { UEFA_COMPETITIONS } from "../football-providers/api-football/uefa-competitions.ts";
import { INTERNATIONAL_COMPETITIONS } from "../football-providers/api-football/international-competitions.ts";
import { INTERNATIONAL_SCORING_EPOCH, isEligibleFixtureKickoff, isInternationalScoringCompetitionCode } from "../football-ingestion/competition-eligibility.ts";

export interface HistoricalFixture { id: string; code: string; season: number; kickoffAt: string; status: string; externalId: string }
export const CURRENT_V4_SEASON = 2026;
/** Provider campaign labels and real football date windows are both checked.
 * No prior domestic season, qualifying UEFA stage, future or pre-epoch
 * international fixture can enter the player-stat request manifest. */
export function currentSeasonV4Plan(fixtures: HistoricalFixture[], frontier: string, includeCurrentConcacaf: boolean) {
  const configured = [...BIG_FIVE_COMPETITIONS, ...UEFA_COMPETITIONS, ...INTERNATIONAL_COMPETITIONS].filter(c => c.enabled);
  const now = new Date(frontier).getTime();
  if (!Number.isFinite(now) || new Date(frontier).getUTCFullYear() !== CURRENT_V4_SEASON) throw new Error("INVALID_2026_SEASON_FRONTIER");
  return configured.flatMap(config => {
    const international = isInternationalScoringCompetitionCode(config.code);
    // CONCACAF's current September-2026 campaign is provider-labeled 2025;
    // including it requires explicit scope selection, never a broad old-season fetch.
    if (config.providerSeason < CURRENT_V4_SEASON && !(includeCurrentConcacaf && config.code === "CONCACAF_NL")) return [];
    const seasonRows = fixtures.filter(f => f.code === config.code && f.season === config.providerSeason);
    const seasonFirstFixture = seasonRows.map(f=>f.kickoffAt).sort()[0];
    const candidates = fixtures.filter(f => f.code === config.code && f.season === config.providerSeason &&
      Number.isSafeInteger(Number(f.externalId)) && Number(f.externalId) > 0 &&
      (!international || isEligibleFixtureKickoff(f.code, new Date(f.kickoffAt))));
    if (!candidates.length) return [];
    const first = candidates.map(f=>f.kickoffAt).sort()[0];
    if (new Date(first).getTime() > now) return [];
    const from = international && first < INTERNATIONAL_SCORING_EPOCH.toISOString() ? INTERNATIONAL_SCORING_EPOCH.toISOString() : first;
    return [{code:config.code, providerLeagueId:config.providerLeagueId, providerSeason:config.providerSeason, seasonFirstFixture, from, through:frontier,
      fixtures:candidates.filter(f=>f.status === "final" && new Date(f.kickoffAt).getTime() <= now).sort((a,b)=>a.kickoffAt.localeCompare(b.kickoffAt)||a.externalId.localeCompare(b.externalId))}];
  });
}
