import type { BigFiveCompetitionCode } from "@/domain/football/constants";
import type { ApiFootballSeason } from "@/lib/football-providers/api-football/types";

/**
 * One row per Big Five league — the single place API-Football's league
 * IDs and Eleven's own competition codes/seasons are wired together.
 * Nothing else in the codebase should hardcode a provider league ID.
 */
export interface BigFiveCompetitionConfig {
  code: BigFiveCompetitionCode;
  name: string;
  country: string;
  /** API-Football's numeric league id — public, stable, well-documented identifiers (not a secret). */
  providerLeagueId: number;
  /**
   * Best-known current season, as API-Football names it: the season's
   * STARTING year (a "2026-27" season is `2026`). This is a starting
   * assumption, not a guarantee — European seasons span two calendar
   * years and API-Football is the source of truth for which season is
   * actually "current" at any given moment. Call `resolveCurrentSeason()`
   * below against a live `/leagues` response before trusting this value
   * for anything beyond a first-pass default.
   */
  providerSeason: number;
  /** Whether Eleven currently ingests this competition. All five are configured; none are ingested yet (Pass 7A is provider-foundation only). */
  enabled: boolean;
}

export const BIG_FIVE_COMPETITIONS: BigFiveCompetitionConfig[] = [
  {
    code: "ENG",
    name: "Premier League",
    country: "England",
    providerLeagueId: 39,
    providerSeason: 2026,
    enabled: true,
  },
  {
    code: "ESP",
    name: "La Liga",
    country: "Spain",
    providerLeagueId: 140,
    providerSeason: 2026,
    enabled: true,
  },
  {
    code: "GER",
    name: "Bundesliga",
    country: "Germany",
    providerLeagueId: 78,
    providerSeason: 2026,
    enabled: true,
  },
  {
    code: "ITA",
    name: "Serie A",
    country: "Italy",
    providerLeagueId: 135,
    providerSeason: 2026,
    enabled: true,
  },
  {
    code: "FRA",
    name: "Ligue 1",
    country: "France",
    providerLeagueId: 61,
    providerSeason: 2026,
    enabled: true,
  },
];

export function getBigFiveCompetition(code: BigFiveCompetitionCode): BigFiveCompetitionConfig {
  const config = BIG_FIVE_COMPETITIONS.find((c) => c.code === code);
  if (!config) throw new Error(`No Big Five competition configured for code "${code}"`);
  return config;
}

/**
 * Picks the season a live `/leagues` response actually reports as
 * current, falling back to the config's best-known default when the
 * provider data doesn't clearly indicate one (e.g. the configured season
 * isn't present in the response at all). This is the "refresh/validate
 * from provider metadata" mechanism referenced in the config's own
 * `providerSeason` doc comment — call it wherever a season number is
 * about to be used for a real request rather than trusting the static
 * config value blindly.
 */
export function resolveCurrentSeason(seasons: ApiFootballSeason[], configuredSeason: number): number {
  const current = seasons.find((s) => s.current);
  if (current) return current.year;
  const configured = seasons.find((s) => s.year === configuredSeason);
  if (configured) return configured.year;
  return configuredSeason;
}
