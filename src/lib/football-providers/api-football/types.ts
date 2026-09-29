/**
 * Raw API-Football v3 response shapes — the ONLY file allowed to know
 * what API-Football's JSON actually looks like. Only the subset of each
 * endpoint's fields `adapter.ts` actually reads is declared here; the
 * real API returns considerably more per object. Extend deliberately as
 * later passes need more fields — never widen "just in case."
 *
 * These types must never be imported outside `src/lib/football-providers/
 * api-football/` — see the module boundary note in
 * `src/lib/football-providers/types.ts`.
 */

/** Every API-Football v3 endpoint wraps its results in this same envelope. */
export interface ApiFootballEnvelope<T> {
  get: string;
  parameters: Record<string, string>;
  errors: string[] | Record<string, string>;
  results: number;
  paging: { current: number; total: number };
  response: T[];
}

// ---------------------------------------------------------------------
// GET /status
// ---------------------------------------------------------------------

export interface ApiFootballStatusResponse {
  subscription: {
    plan: string;
    active: boolean;
  };
  requests: {
    current: number;
    limit_day: number;
  };
}

// ---------------------------------------------------------------------
// GET /leagues — also the source of per-season coverage metadata
// ---------------------------------------------------------------------

export interface ApiFootballSeasonCoverage {
  fixtures: {
    events: boolean;
    lineups: boolean;
    statistics_fixtures: boolean;
    statistics_players: boolean;
  };
  standings: boolean;
  players: boolean;
  injuries: boolean;
}

export interface ApiFootballSeason {
  year: number;
  start: string;
  end: string;
  current: boolean;
  coverage: ApiFootballSeasonCoverage;
}

export interface ApiFootballLeagueItem {
  league: {
    id: number;
    name: string;
  };
  country: {
    name: string;
    code: string | null;
  };
  seasons: ApiFootballSeason[];
}

// ---------------------------------------------------------------------
// GET /teams
// ---------------------------------------------------------------------

export interface ApiFootballTeamItem {
  team: {
    id: number;
    name: string;
    code: string | null;
  };
}

// ---------------------------------------------------------------------
// GET /players
// ---------------------------------------------------------------------

export interface ApiFootballPlayerItem {
  player: {
    id: number;
    name: string;
    lastname: string | null;
    nationality: string | null;
  };
  statistics: Array<{
    team: { id: number };
    games: {
      position: string | null;
      number: number | null;
    };
  }>;
}

// ---------------------------------------------------------------------
// GET /fixtures
// ---------------------------------------------------------------------

export interface ApiFootballFixtureItem {
  fixture: {
    id: number;
    date: string;
    status: { short: string };
  };
  league: {
    id: number;
    season: number;
  };
  teams: {
    home: { id: number };
    away: { id: number };
  };
}
