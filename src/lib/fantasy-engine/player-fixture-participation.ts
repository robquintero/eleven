import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../supabase/database.types.ts";
import { isScoringEligibleCompetitionCode } from "../football-ingestion/competition-eligibility.ts";
import type { RoundWindow } from "../../domain/fantasy/round-calendar.ts";

/**
 * Pass 14 (brief Step 6): the one shared place that answers "which
 * fixtures is this player relevant to" — club AND national team, never
 * club alone. Before this pass, `lineup.ts` (locking),
 * `data-access/players.ts` (next-fixture display), and
 * `data-access/matchups.ts` (matchup fixture intelligence) each
 * independently built a `fixtures where home_club_id/away_club_id =
 * player.club_id` query — correct for a club-only world, structurally
 * blind to an international fixture (whose participants are national
 * teams, not the player's own club). This module centralizes the
 * semantics so none of those three call sites (or any future one) needs
 * its own copy.
 *
 * Conceptually: player -> canonical club + national-team membership(s)
 * -> participant team ids -> scoring-eligible fixtures. See
 * docs/international-scoring.md "Player reconciliation."
 */

export interface ParticipantFixture {
  fixtureId: string;
  homeClubId: string;
  awayClubId: string;
  kickoffAt: Date;
  status: string;
  competitionCode: string;
}

/**
 * Every "team id" a player could have a fixture through — their own
 * canonical club, plus any national team(s) they're associated with via
 * `player_national_teams`. Batched across `playerIds` (two queries total,
 * never N+1 per player) so this scales with a roster/league, not with
 * how many players happen to also play internationally.
 */
export async function getTeamIdsByPlayer(
  admin: SupabaseClient<Database>,
  playerIds: string[]
): Promise<Map<string, string[]>> {
  const result = new Map<string, string[]>();
  if (playerIds.length === 0) return result;

  const [{ data: players }, { data: nationalTeams }] = await Promise.all([
    admin.from("players").select("id, club_id").in("id", playerIds),
    admin.from("player_national_teams").select("player_id, national_team_club_id").in("player_id", playerIds),
  ]);

  for (const p of players ?? []) {
    result.set(p.id, [p.club_id]);
  }
  for (const nt of nationalTeams ?? []) {
    const list = result.get(nt.player_id);
    if (list) list.push(nt.national_team_club_id);
    else result.set(nt.player_id, [nt.national_team_club_id]);
  }
  return result;
}

/**
 * Every scoring-eligible fixture (Big Five + UCL/UEL + the Pass 14
 * international allowlist — `competition-eligibility.ts`, checked here as
 * a defense-in-depth filter even though nothing non-eligible should ever
 * be ingested) involving any of `teamIds`, optionally bounded to a
 * fantasy-round window and/or a status allowlist. Always sorted soonest
 * kickoff first. The shared fixture-fetch primitive both locking and
 * next-fixture/fixture-intelligence UI build on.
 */
export async function getFixturesForTeamIds(
  admin: SupabaseClient<Database>,
  teamIds: string[],
  options: { window?: RoundWindow; statuses?: string[] } = {}
): Promise<ParticipantFixture[]> {
  if (teamIds.length === 0) return [];

  let query = admin
    .from("fixtures")
    .select("id, home_club_id, away_club_id, kickoff_at, status, competitions(code)")
    .or(`home_club_id.in.(${teamIds.join(",")}),away_club_id.in.(${teamIds.join(",")})`);

  if (options.window) {
    query = query
      .gte("kickoff_at", options.window.startsAt.toISOString())
      .lt("kickoff_at", options.window.endsAt.toISOString());
  }
  if (options.statuses) {
    query = query.in("status", options.statuses);
  }

  const { data } = await query.order("kickoff_at", { ascending: true });

  return (data ?? [])
    .map((f) => ({
      fixtureId: f.id,
      homeClubId: f.home_club_id,
      awayClubId: f.away_club_id,
      kickoffAt: new Date(f.kickoff_at),
      status: f.status,
      competitionCode: (f.competitions as { code: string } | null)?.code ?? "",
    }))
    .filter((f) => isScoringEligibleCompetitionCode(f.competitionCode));
}

/**
 * Pass 14 (brief Step 7): every eligible kickoff, club OR national team,
 * for each of `playerIds` inside `window` — the direct replacement for
 * `lineup.ts`'s old club-id-only kickoff lookup. `computeLockInstant`
 * (unchanged, `domain/fantasy/lineup-lock.ts`) already takes "the
 * earliest of however many kickoffs" — it never assumed exactly one, so
 * handing it a longer list (club + international) needs no change there.
 */
export async function getKickoffsByPlayer(
  admin: SupabaseClient<Database>,
  playerIds: string[],
  window: RoundWindow
): Promise<Map<string, Date[]>> {
  const teamIdsByPlayer = await getTeamIdsByPlayer(admin, playerIds);
  const allTeamIds = Array.from(new Set(Array.from(teamIdsByPlayer.values()).flat()));
  const fixtures = await getFixturesForTeamIds(admin, allTeamIds, { window });

  const result = new Map<string, Date[]>();
  for (const playerId of playerIds) {
    const teamIds = new Set(teamIdsByPlayer.get(playerId) ?? []);
    const kickoffs = fixtures
      .filter((f) => teamIds.has(f.homeClubId) || teamIds.has(f.awayClubId))
      .map((f) => f.kickoffAt);
    result.set(playerId, kickoffs);
  }
  return result;
}

export interface NextFixtureInfo {
  fixtureId: string;
  kickoffAt: Date;
  status: string;
  competitionCode: string;
  isHome: boolean;
  /** The fixture's own real home/away short names — e.g. "FRA"/"GER" for an international fixture — never re-derived from the player's own `club.shortName` (brief Step 9: "the fixture itself must tell the UI who is playing"). */
  homeLabel: string;
  awayLabel: string;
  /** The OTHER side's short name, from this player's participating side. */
  opponentLabel: string;
}

/**
 * Pass 14 (brief Step 9): the soonest SCHEDULED fixture for each player,
 * club or national team, with the fixture's own real participant labels
 * — replaces `players.ts`'s `getNextFixtureByClub` (club-id-keyed, picked
 * one fixture per CLUB rather than per player, and every caller spliced
 * the player's own `club.shortName` onto the result to build a "home —
 * away" label, which silently breaks for an international fixture).
 */
export async function getNextFixtureByPlayer(
  admin: SupabaseClient<Database>,
  playerIds: string[]
): Promise<Map<string, NextFixtureInfo>> {
  const result = new Map<string, NextFixtureInfo>();
  const teamIdsByPlayer = await getTeamIdsByPlayer(admin, playerIds);
  const allTeamIds = Array.from(new Set(Array.from(teamIdsByPlayer.values()).flat()));
  if (allTeamIds.length === 0) return result;

  const fixtures = await getFixturesForTeamIds(admin, allTeamIds, { statuses: ["scheduled"] });
  if (fixtures.length === 0) return result;

  const clubIdsInvolved = Array.from(new Set(fixtures.flatMap((f) => [f.homeClubId, f.awayClubId])));
  const { data: clubs } = await admin.from("clubs").select("id, short_name").in("id", clubIdsInvolved);
  const shortNameById = new Map((clubs ?? []).map((c) => [c.id, c.short_name]));

  for (const playerId of playerIds) {
    const teamIds = new Set(teamIdsByPlayer.get(playerId) ?? []);
    if (teamIds.size === 0) continue;
    // `fixtures` is already sorted soonest-first by getFixturesForTeamIds.
    const next = fixtures.find((f) => teamIds.has(f.homeClubId) || teamIds.has(f.awayClubId));
    if (!next) continue;
    const isHome = teamIds.has(next.homeClubId);
    const homeLabel = shortNameById.get(next.homeClubId) ?? "—";
    const awayLabel = shortNameById.get(next.awayClubId) ?? "—";
    result.set(playerId, {
      fixtureId: next.fixtureId,
      kickoffAt: next.kickoffAt,
      status: next.status,
      competitionCode: next.competitionCode,
      isHome,
      homeLabel,
      awayLabel,
      opponentLabel: isHome ? awayLabel : homeLabel,
    });
  }
  return result;
}
