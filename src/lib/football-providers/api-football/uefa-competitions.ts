/**
 * UEFA club competitions Eleven ingests fixture/stat data for — see
 * docs/football-data-system.md "UCL/UEL scope." Deliberately a SEPARATE
 * type/list from `BIG_FIVE_COMPETITIONS`
 * (`big-five-competitions.ts`): Big Five membership is what gates
 * Eleven's *draftable player* eligibility (brief §2), and these two
 * competitions must never be treated as part of that set even though
 * they share the same config shape and sync machinery.
 *
 * Provider league IDs verified live against `GET /leagues?search=` before
 * being hardcoded here — see the Post-Pass-8 population report. Not
 * guessed from memory.
 */
export type UefaCompetitionCode = "UCL" | "UEL";

export interface UefaCompetitionConfig {
  code: UefaCompetitionCode;
  name: string;
  /** API-Football's numeric league id — public, stable, documented identifiers (not a secret). */
  providerLeagueId: number;
  providerSeason: number;
  enabled: boolean;
}

export const UEFA_COMPETITIONS: UefaCompetitionConfig[] = [
  {
    code: "UCL",
    name: "UEFA Champions League",
    providerLeagueId: 2,
    providerSeason: 2026,
    enabled: true,
  },
  {
    code: "UEL",
    name: "UEFA Europa League",
    providerLeagueId: 3,
    providerSeason: 2026,
    enabled: true,
  },
];

export function getUefaCompetition(code: UefaCompetitionCode): UefaCompetitionConfig {
  const config = UEFA_COMPETITIONS.find((c) => c.code === code);
  if (!config) throw new Error(`No UEFA competition configured for code "${code}"`);
  return config;
}

export function isUefaCompetitionCode(code: string): code is UefaCompetitionCode {
  return UEFA_COMPETITIONS.some((c) => c.code === code);
}
