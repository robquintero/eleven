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
