/**
 * Pass 14: official senior men's competitive international competitions
 * Eleven ingests fixture/stat data for — see docs/international-scoring.md
 * "API-Football international competition findings" for how each provider
 * league id below was discovered (live `GET /leagues?search=`, 10
 * requests, zero guessed/hardcoded-from-memory ids) and verified against
 * the brief's own allowlist.
 *
 * Deliberately a SEPARATE type/list from `BIG_FIVE_COMPETITIONS` and
 * `UEFA_COMPETITIONS`, for the same reason those two are already kept
 * apart: Big Five membership is what gates Eleven's *draftable player*
 * eligibility, and these competitions must never be treated as part of
 * that set even though they share the same config shape and sync
 * machinery. Scoring eligibility (this file + Big Five + UEFA) is a
 * strictly larger, separately-composed set — see
 * `src/domain/football/competition-eligibility.ts`.
 *
 * Every tournament here is INCLUDED. The excluded siblings the provider
 * also returns for these same searches (friendlies, youth, women's,
 * Olympics, unofficial exhibitions like "Kings World Cup Nations") are
 * documented in docs/international-scoring.md and deliberately absent —
 * not an oversight. Friendlies in particular live under a wholly separate
 * provider league id (10) in every search, never a "round" inside one of
 * these competitions' own id, so excluding them needs no round-name
 * heuristic — only never configuring that id here.
 */
export const INTERNATIONAL_COMPETITION_CODES = [
  "FIFA_WC",
  "FIFA_WCQ_EUR",
  "FIFA_WCQ_AFR",
  "FIFA_WCQ_ASIA",
  "FIFA_WCQ_CONCACAF",
  "FIFA_WCQ_SAM",
  "FIFA_WCQ_OFC",
  "FIFA_WCQ_PLAYOFF",
  "UEFA_EURO",
  "UEFA_EURO_Q",
  "UEFA_NL",
  "COPA_AMERICA",
  "AFCON",
  "AFCON_Q",
  "AFC_ASIAN_CUP",
  "AFC_ASIAN_CUP_Q",
  "CONCACAF_GOLD_CUP",
  "CONCACAF_GOLD_CUP_Q",
  "CONCACAF_NL",
  "CONCACAF_NL_Q",
  "OFC_NATIONS_CUP",
] as const;

export type InternationalCompetitionCode = (typeof INTERNATIONAL_COMPETITION_CODES)[number];

export interface InternationalCompetitionConfig {
  code: InternationalCompetitionCode;
  name: string;
  /** API-Football's numeric league id — public, stable, documented identifiers (not a secret). */
  providerLeagueId: number;
  providerSeason: number;
  enabled: boolean;
}

export const INTERNATIONAL_COMPETITIONS: InternationalCompetitionConfig[] = [
  { code: "FIFA_WC", name: "FIFA World Cup", providerLeagueId: 1, providerSeason: 2026, enabled: true },
  { code: "FIFA_WCQ_EUR", name: "FIFA World Cup Qualification — Europe", providerLeagueId: 32, providerSeason: 2024, enabled: true },
  { code: "FIFA_WCQ_AFR", name: "FIFA World Cup Qualification — Africa", providerLeagueId: 29, providerSeason: 2023, enabled: true },
  { code: "FIFA_WCQ_ASIA", name: "FIFA World Cup Qualification — Asia", providerLeagueId: 30, providerSeason: 2026, enabled: true },
  { code: "FIFA_WCQ_CONCACAF", name: "FIFA World Cup Qualification — CONCACAF", providerLeagueId: 31, providerSeason: 2026, enabled: true },
  { code: "FIFA_WCQ_SAM", name: "FIFA World Cup Qualification — South America (CONMEBOL)", providerLeagueId: 34, providerSeason: 2026, enabled: true },
  { code: "FIFA_WCQ_OFC", name: "FIFA World Cup Qualification — Oceania (OFC)", providerLeagueId: 33, providerSeason: 2026, enabled: true },
  { code: "FIFA_WCQ_PLAYOFF", name: "FIFA World Cup Qualification — Intercontinental Play-offs", providerLeagueId: 37, providerSeason: 2026, enabled: true },
  { code: "UEFA_EURO", name: "UEFA European Championship", providerLeagueId: 4, providerSeason: 2024, enabled: true },
  { code: "UEFA_EURO_Q", name: "UEFA European Championship Qualifying", providerLeagueId: 960, providerSeason: 2023, enabled: true },
  { code: "UEFA_NL", name: "UEFA Nations League", providerLeagueId: 5, providerSeason: 2026, enabled: true },
  { code: "COPA_AMERICA", name: "Copa América", providerLeagueId: 9, providerSeason: 2024, enabled: true },
  { code: "AFCON", name: "Africa Cup of Nations", providerLeagueId: 6, providerSeason: 2025, enabled: true },
  { code: "AFCON_Q", name: "Africa Cup of Nations Qualifying", providerLeagueId: 36, providerSeason: 2027, enabled: true },
  { code: "AFC_ASIAN_CUP", name: "AFC Asian Cup", providerLeagueId: 7, providerSeason: 2027, enabled: true },
  { code: "AFC_ASIAN_CUP_Q", name: "AFC Asian Cup Qualifying", providerLeagueId: 35, providerSeason: 2024, enabled: true },
  { code: "CONCACAF_GOLD_CUP", name: "CONCACAF Gold Cup", providerLeagueId: 22, providerSeason: 2025, enabled: true },
  { code: "CONCACAF_GOLD_CUP_Q", name: "CONCACAF Gold Cup Qualifying", providerLeagueId: 858, providerSeason: 2025, enabled: true },
  { code: "CONCACAF_NL", name: "CONCACAF Nations League", providerLeagueId: 536, providerSeason: 2025, enabled: true },
  // Pass 14 audit note: this stage's provider data looked dormant at
  // discovery time (current-season tag stuck at 2018, no active window
  // found) — kept `enabled: true` for correctness (it's a legitimate
  // senior competitive qualifying stage, same as every other entry here),
  // but a sync attempt may simply find nothing to ingest until/unless the
  // provider's data for it becomes current again.
  { code: "CONCACAF_NL_Q", name: "CONCACAF Nations League Qualifying", providerLeagueId: 808, providerSeason: 2018, enabled: true },
  { code: "OFC_NATIONS_CUP", name: "OFC Nations Cup", providerLeagueId: 806, providerSeason: 2024, enabled: true },
];

export function getInternationalCompetition(code: InternationalCompetitionCode): InternationalCompetitionConfig {
  const config = INTERNATIONAL_COMPETITIONS.find((c) => c.code === code);
  if (!config) throw new Error(`No international competition configured for code "${code}"`);
  return config;
}

export function isInternationalCompetitionCode(code: string): code is InternationalCompetitionCode {
  return INTERNATIONAL_COMPETITIONS.some((c) => c.code === code);
}
