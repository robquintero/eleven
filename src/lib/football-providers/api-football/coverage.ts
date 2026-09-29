import "server-only";
import { getLeagues } from "./client.ts";
import { normalizeCoverage } from "./adapter.ts";
import { resolveCurrentSeason, type BigFiveCompetitionConfig } from "./big-five-competitions.ts";
import { ApiFootballResponseError } from "./errors.ts";
import type { ProviderCoverage } from "@/lib/football-providers/types";

export interface CompetitionCoverage {
  competitionCode: BigFiveCompetitionConfig["code"];
  providerLeagueId: number;
  season: number;
  coverage: ProviderCoverage;
}

/**
 * Fetches ONE competition's live coverage metadata — never loops across
 * the whole Big Five automatically (see "no automatic fetch-everything
 * behavior" in docs/architecture.md). A future ingestion service calls
 * this once per enabled competition, deliberately, not from a loop that
 * fires on its own.
 */
export async function getCompetitionCoverage(config: BigFiveCompetitionConfig): Promise<CompetitionCoverage> {
  const { data } = await getLeagues({ id: config.providerLeagueId });
  const leagueItem = data.response[0];
  if (!leagueItem) {
    throw new ApiFootballResponseError(
      `No league data returned for ${config.code} (provider id ${config.providerLeagueId})`,
      200
    );
  }

  const season = resolveCurrentSeason(leagueItem.seasons, config.providerSeason);
  const seasonItem = leagueItem.seasons.find((s) => s.year === season);
  if (!seasonItem) {
    throw new ApiFootballResponseError(`No season ${season} found for ${config.code}`, 200);
  }

  return {
    competitionCode: config.code,
    providerLeagueId: config.providerLeagueId,
    season: seasonItem.year,
    coverage: normalizeCoverage(seasonItem),
  };
}
