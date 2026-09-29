/**
 * Canonical-shaped sample data for `@/domain/fantasy`.
 *
 * Same intent as `./football.ts`: small, illustrative, not wired into the
 * UI. Player ids here reference `./football.ts`'s sample players so the
 * two files form one consistent (if tiny) end-to-end example — a league,
 * a team, a roster, a round, a matchup, a draft pick, a trade, and the
 * scoring chain that would eventually produce a fantasy score for them.
 */

import { DEFAULT_LEAGUE_SETTINGS } from "@/domain/fantasy/constants";
import type {
  Draft,
  DraftOrder,
  DraftPick,
  FantasyLeague,
  FantasyPlayerScore,
  FantasyRound,
  FantasyTeam,
  LeagueMembership,
  LeaguePlayerOwnership,
  LineupSlot,
  Matchup,
  MatchupScore,
  RosterEntry,
  ScoringRule,
  Trade,
  TradeAsset,
  Transaction,
  User,
} from "@/domain/fantasy/types";

export const users: User[] = [
  {
    id: "usr_robert",
    displayName: "Robert",
    email: "robert@example.com",
    createdAt: "2026-08-01T09:00:00.000Z",
  },
  {
    id: "usr_alex",
    displayName: "Alex Chen",
    email: "alex@example.com",
    createdAt: "2026-08-01T09:05:00.000Z",
  },
];

export const fantasyLeague: FantasyLeague = {
  id: "lg_boardroom",
  name: "The Boardroom",
  status: "active",
  createdByUserId: "usr_robert",
  createdAt: "2026-08-01T09:10:00.000Z",
  settings: { ...DEFAULT_LEAGUE_SETTINGS, maxTeams: 8 },
};

export const leagueMemberships: LeagueMembership[] = [
  { leagueId: "lg_boardroom", userId: "usr_robert", role: "commissioner", joinedAt: "2026-08-01T09:10:00.000Z" },
  { leagueId: "lg_boardroom", userId: "usr_alex", role: "manager", joinedAt: "2026-08-01T10:00:00.000Z" },
];

export const fantasyTeams: FantasyTeam[] = [
  {
    id: "team_robert_fc",
    leagueId: "lg_boardroom",
    ownerUserId: "usr_robert",
    name: "Robert FC",
    abbreviation: "RFC",
    createdAt: "2026-08-01T09:15:00.000Z",
  },
  {
    id: "team_camden_wolves",
    leagueId: "lg_boardroom",
    ownerUserId: "usr_alex",
    name: "Camden Wolves",
    abbreviation: "CW",
    createdAt: "2026-08-01T10:05:00.000Z",
  },
];

/** Robert FC drafted Saka; Camden Wolves drafted Bellingham. One row each — see `LeaguePlayerOwnership` below. */
export const rosterEntries: RosterEntry[] = [
  {
    id: "roster_rfc_saka",
    leagueId: "lg_boardroom",
    fantasyTeamId: "team_robert_fc",
    playerId: "plr_saka",
    acquisitionType: "draft",
    acquiredAt: "2026-08-10T18:00:00.000Z",
    status: "active",
  },
  {
    id: "roster_cw_bellingham",
    leagueId: "lg_boardroom",
    fantasyTeamId: "team_camden_wolves",
    playerId: "plr_bellingham",
    acquisitionType: "draft",
    acquiredAt: "2026-08-10T18:01:00.000Z",
    status: "active",
  },
];

/** Enforces "one owner per player per league" — see invariant #1/#2, docs/domain-model.md. */
export const leaguePlayerOwnership: LeaguePlayerOwnership[] = [
  { leagueId: "lg_boardroom", playerId: "plr_saka", fantasyTeamId: "team_robert_fc", rosterEntryId: "roster_rfc_saka" },
  { leagueId: "lg_boardroom", playerId: "plr_bellingham", fantasyTeamId: "team_camden_wolves", rosterEntryId: "roster_cw_bellingham" },
];

export const fantasyRound: FantasyRound = {
  id: "rnd_boardroom_05",
  leagueId: "lg_boardroom",
  number: 5,
  startsAt: "2026-10-03T00:00:00.000Z",
  endsAt: "2026-10-05T23:59:59.000Z",
  status: "in_progress",
};

export const lineupSlots: LineupSlot[] = [
  { rosterEntryId: "roster_rfc_saka", fantasyRoundId: "rnd_boardroom_05", slot: "MID", starter: true },
  { rosterEntryId: "roster_cw_bellingham", fantasyRoundId: "rnd_boardroom_05", slot: "MID", starter: true },
];

export const matchup: Matchup = {
  id: "mtc_rfc_cw_md05",
  leagueId: "lg_boardroom",
  fantasyRoundId: "rnd_boardroom_05",
  homeFantasyTeamId: "team_robert_fc",
  awayFantasyTeamId: "team_camden_wolves",
  status: "live",
};

export const matchupScores: MatchupScore[] = [
  { matchupId: "mtc_rfc_cw_md05", fantasyTeamId: "team_robert_fc", livePoints: 58, projectedPoints: 84, updatedAt: "2026-10-03T16:45:00.000Z" },
  { matchupId: "mtc_rfc_cw_md05", fantasyTeamId: "team_camden_wolves", livePoints: 51, projectedPoints: 79, updatedAt: "2026-10-03T16:45:00.000Z" },
];

export const draft: Draft = {
  id: "draft_boardroom_2026",
  leagueId: "lg_boardroom",
  status: "completed",
  type: "snake",
  currentRound: 16,
  currentPick: 8,
  startedAt: "2026-08-10T17:00:00.000Z",
  completedAt: "2026-08-10T19:30:00.000Z",
};

export const draftOrder: DraftOrder[] = [
  { draftId: "draft_boardroom_2026", fantasyTeamId: "team_robert_fc", position: 1 },
  { draftId: "draft_boardroom_2026", fantasyTeamId: "team_camden_wolves", position: 2 },
];

export const draftPicks: DraftPick[] = [
  {
    id: "pick_r1p1",
    draftId: "draft_boardroom_2026",
    round: 1,
    pickNumber: 1,
    fantasyTeamId: "team_robert_fc",
    playerId: "plr_saka",
    pickedAt: "2026-08-10T17:02:00.000Z",
  },
  {
    id: "pick_r1p2",
    draftId: "draft_boardroom_2026",
    round: 1,
    pickNumber: 2,
    fantasyTeamId: "team_camden_wolves",
    playerId: "plr_bellingham",
    pickedAt: "2026-08-10T17:03:30.000Z",
  },
];

/** A hypothetical, unexecuted 1-for-1 — trades are contracts only in this pass, never processed. */
export const trade: Trade = {
  id: "trd_00841",
  leagueId: "lg_boardroom",
  proposingTeamId: "team_camden_wolves",
  receivingTeamId: "team_robert_fc",
  status: "pending",
  createdAt: "2026-10-03T22:40:00.000Z",
  expiresAt: "2026-10-05T22:40:00.000Z",
};

export const tradeAssets: TradeAsset[] = [
  { id: "asset_1", tradeId: "trd_00841", fromTeamId: "team_camden_wolves", toTeamId: "team_robert_fc", playerId: "plr_bellingham" },
  { id: "asset_2", tradeId: "trd_00841", fromTeamId: "team_robert_fc", toTeamId: "team_camden_wolves", playerId: "plr_saka" },
];

export const transactions: Transaction[] = [
  {
    id: "txn_pick_r1p1",
    leagueId: "lg_boardroom",
    type: "draft_pick",
    actorUserId: "usr_robert",
    fantasyTeamId: "team_robert_fc",
    createdAt: "2026-08-10T17:02:00.000Z",
    reference: "pick_r1p1",
  },
];

/** Backend-owned scoring formula — the frontend never computes these itself. */
export const scoringRules: ScoringRule[] = [
  { stat: "goals", multiplier: 5, positionModifier: { FWD: 4, MID: 5, DEF: 6, GK: 6 } },
  { stat: "assists", multiplier: 3 },
  { stat: "cleanSheet", multiplier: 4, positionModifier: { GK: 4, DEF: 4, MID: 1, FWD: 0 } },
  { stat: "saves", multiplier: 0.5 },
  { stat: "yellowCards", multiplier: -1 },
  { stat: "redCards", multiplier: -3 },
];

/** The reproducible result of applying `scoringRules` to Saka's matchday-05 `PlayerMatchStats`. */
export const fantasyPlayerScores: FantasyPlayerScore[] = [
  {
    playerId: "plr_saka",
    fixtureId: "fix_ars_tot_md05",
    fantasyRoundId: "rnd_boardroom_05",
    points: 8,
    breakdown: { goals: 5, assists: 3 },
    calculatedAt: "2026-10-04T17:35:00.000Z",
  },
];
