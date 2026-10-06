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
  /** The OTHER side's short label, from this player's participating side — e.g. "GER" for a France international fixture, or the usual club short name for a club fixture. */
  opponent: string;
  isHome: boolean;
  kickoff: string;
  state: PlayerMatchState;
  /**
   * Pass 14: the fixture's own real home/away short labels — e.g.
   * "FRA"/"GER" for an international fixture. Render "home — away" from
   * THESE, never by splicing the player's own `club.shortName` onto
   * `opponent` — that assumption broke the moment a player's fixture can
   * be international (their permanent club is never one of the two sides
   * of that fixture). See docs/international-scoring.md.
   */
  homeLabel: string;
  awayLabel: string;
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
  /** Real country name as API-Football reports it (e.g. "Spain", "England") — used for the circular flag avatar (Pass 10.5C.5, see src/lib/countries.ts). `undefined`/`null`/unrecognized falls back to the initials avatar. */
  nationality?: string | null;
  /** Points for the active fantasy round that count toward the owning fantasy team's matchup — i.e. AFTER the Pass 14.6 "no retroactive point inheritance" cutoff is applied. */
  fantasyPoints: number;
  scoringRuleVersion?: import("../../domain/fantasy/scoring.ts").ScoringRuleVersion;
  /**
   * Pass 14.6: the portion of this round's REAL, objective performance
   * (same `fantasy_player_scores` the engine already computed) that does
   * NOT count toward the current owner's matchup, because it was earned
   * before this roster entry's `acquired_at`. `undefined`/`0` means
   * nothing is being withheld. Always shown for informational context,
   * never hidden — see docs/game-rules.md "Acquisition points."
   */
  preAcquisitionPoints?: number;
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

/**
 * A `"DEF-MID-FWD"` label (e.g. "4-4-2") derived from a real starting
 * XI's actual position counts — any combination FORMATION_RULES allows
 * is a valid formation name, not just the three most common ones, so
 * this is a template literal rather than a closed enum. "—" means no
 * formation has been set yet — no draft/lineup exists for this squad.
 */
export type Formation = `${number}-${number}-${number}` | "4-2-3-1" | "—";

/** A single position on the pitch, expressed as a percentage of pitch width/height. */
export interface LineupSlot {
  id: string;
  position: PlayerPosition;
  /** 0 (left) – 100 (right) */
  x: number;
  /** 0 (own goal) – 100 (attacking line) */
  y: number;
  player: Player;
  /** Whether this starter's real-world fixture has already kicked off, per `lineup_slots.locked_at` (docs/game-rules.md "Player locking") — `undefined` where lock state isn't known/relevant (e.g. a squad with no current round yet). */
  locked?: boolean;
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
  /** `null` when there's no single meaningful deadline to show (Eleven's real model locks each player individually at their own fixture's kickoff, not on one global deadline — docs/game-rules.md "Player locking") — e.g. the next applicable lock instant when one exists, or `null` when none is currently known. */
  deadline: string | null;
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
