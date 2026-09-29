import type { BigFiveLeague } from "@/lib/types/fantasy";

export const leagueLabels: Record<BigFiveLeague, string> = {
  "premier-league": "Premier League",
  "la-liga": "La Liga",
  bundesliga: "Bundesliga",
  "serie-a": "Serie A",
  "ligue-1": "Ligue 1",
};

/** Three-letter competition codes used in dense/tabular contexts (the Players database). */
export const leagueCode: Record<BigFiveLeague, string> = {
  "premier-league": "ENG",
  "la-liga": "ESP",
  bundesliga: "GER",
  "serie-a": "ITA",
  "ligue-1": "FRA",
};

export const leagueCodes = Object.values(leagueCode);

const bigFiveLeagueByCode: Record<string, BigFiveLeague> = {
  ENG: "premier-league",
  ESP: "la-liga",
  GER: "bundesliga",
  ITA: "serie-a",
  FRA: "ligue-1",
};

/**
 * Maps a real `competitions.code` (see supabase/migrations/…football_foundation.sql)
 * back to the UI's `BigFiveLeague` slug. Falls back to `"premier-league"`
 * only as a type-safe default for an unrecognized/null code — real
 * ingested data (Pass 8+) will always carry one of the five known codes.
 */
export function bigFiveLeagueFromCompetitionCode(code: string | null | undefined): BigFiveLeague {
  return (code && bigFiveLeagueByCode[code]) || "premier-league";
}
