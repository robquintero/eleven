/**
 * Core domain types for the fantasy platform.
 *
 * External football-data provider IDs are kept on `externalId` fields,
 * separate from our internal `id`, so we can swap providers later without
 * touching anything that references a player/club by internal id.
 */

export type BigFiveLeague =
  | "premier-league"
  | "la-liga"
  | "bundesliga"
  | "serie-a"
  | "ligue-1";

export interface Club {
  id: string;
  name: string;
  shortName: string;
  league: BigFiveLeague;
  crestColor: string;
}

export type PlayerPosition = "GK" | "DEF" | "MID" | "FWD";

export type PlayerAvailability =
  | "available"
  | "doubtful"
  | "injured"
  | "suspended";

/** Where a player's own fixture currently stands relative to lineup locking. */
export type PlayerMatchState = "upcoming" | "live" | "locked" | "final";

export interface PlayerFixture {
  opponent: string;
  isHome: boolean;
  kickoff: string;
  state: PlayerMatchState;
}

/** Whether a real player is on a fantasy roster, and whose. */
export type PlayerOwnership = "free" | "owned" | "waivers" | "mine";

export interface SeasonStats {
  appearances: number;
  /** How many of `appearances` were starts (provider: NOT substitute). */
  starts: number;
  minutes: number;
  goals: number;
  assists: number;
  /** GK/DEF only. */
  cleanSheets?: number;
  /** GK only. */
  saves?: number;
}

export interface Player {
  id: string;
  externalId: string;
  name: string;
  club: Club;
  position: PlayerPosition;
  /** Squad/shirt number, used as the tactical fallback identifier before photography is available. */
  number?: number;
  /** Points for the active fantasy round. Eventually derived by the scoring engine. */
  fantasyPoints: number;
  /** Cumulative points for the season so far. */
  totalPoints?: number;
  /** Points per round this season. */
  averagePoints?: number;
  availability?: PlayerAvailability;
  fixture?: PlayerFixture;
  /** Fantasy points from the last few completed rounds, most recent last. */
  recentForm?: number[];
  seasonStats?: SeasonStats;
  /** League-wide roster status — not set for players outside the scouting database (e.g. squad mocks). */
  ownership?: PlayerOwnership;
  /** Fantasy team name, present only when `ownership` is "owned". */
  ownerTeamName?: string;
}

/** "—" means no formation has been set yet — no draft/lineup exists for this squad. */
export type Formation = "4-3-3" | "4-4-2" | "3-5-2" | "—";

/** A single position on the pitch, expressed as a percentage of pitch width/height. */
export interface LineupSlot {
  id: string;
  position: PlayerPosition;
  /** 0 (left) – 100 (right) */
  x: number;
  /** 0 (own goal) – 100 (attacking line) */
  y: number;
  player: Player;
}

export interface Squad {
  formation: Formation;
  starters: LineupSlot[];
  bench: Player[];
}

export interface FantasyManager {
  id: string;
  displayName: string;
  initials: string;
}

export interface FantasyTeam {
  id: string;
  name: string;
  manager: FantasyManager;
  crestColor: string;
  wins: number;
  losses: number;
  draws: number;
  pointsFor: number;
  pointsAgainst: number;
}

export type MatchupStatus = "live" | "upcoming" | "final";

export interface Matchup {
  id: string;
  round: number;
  homeTeam: FantasyTeam;
  awayTeam: FantasyTeam;
  homeScore: number;
  awayScore: number;
  homeProjected: number;
  awayProjected: number;
  status: MatchupStatus;
}

export interface StandingsEntry {
  rank: number;
  team: FantasyTeam;
}

export type ActivityType =
  | "draft-pick"
  | "waiver-add"
  | "waiver-drop"
  | "trade"
  | "lineup-set";

export interface ActivityItem {
  id: string;
  type: ActivityType;
  description: string;
  team: FantasyTeam;
  timestamp: string;
}

export type FantasyRoundStatus = "upcoming" | "in-progress" | "completed";

export interface FantasyRound {
  number: number;
  label: string;
  deadline: string;
  status: FantasyRoundStatus;
}

export interface FantasyLeague {
  id: string;
  name: string;
  memberCount: number;
}

/** Real-world match state for a round fixture — distinct from `PlayerMatchState`,
 * which only cares about fantasy lineup locking. */
export type FixtureMatchState = "scheduled" | "live" | "ht" | "final";

/** A real football fixture for the active round, independent of any single
 * fantasy roster — powers the round-wide fixtures ticker. */
export interface RoundFixture {
  id: string;
  homeClub: string;
  awayClub: string;
  kickoff: string;
  state: FixtureMatchState;
  homeScore?: number;
  awayScore?: number;
  /** Minute of play, present while `state` is "live". */
  minute?: number;
  /** A rostered player whose club is playing in this fixture, surfaced for context. */
  featuredPlayer?: {
    name: string;
    points: number;
  };
}
