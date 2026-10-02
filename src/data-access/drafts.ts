import "server-only";
// Relative imports (not the usual `@/...` aliases) -- same reasoning as
// src/data-access/players.ts's own import-block comment: keeps
// `queryDraftState` importable from a plain Node integration test.
// `../lib/supabase/server.ts` itself is NOT statically imported (see
// `resolveClient` below) since it pulls in `next/headers`.
import { isSupabaseConfigured } from "../lib/supabase/config.ts";
import type { createClient } from "../lib/supabase/server.ts";
import { toDraftActionError } from "../lib/errors/draft-action-error.ts";
import { teamPositionForPick } from "../domain/fantasy/draft-order.ts";
import type { PlayerPosition } from "../lib/types/fantasy.ts";

/** Dynamically imported so this module -- specifically `queryDraftState` -- stays importable from a plain Node integration test; see this file's own import-block comment. */
async function resolveClient() {
  const { createClient } = await import("../lib/supabase/server.ts");
  return createClient();
}

export type DraftStatus = "scheduled" | "in_progress" | "completed";

/**
 * The status of the league's CURRENT draft, or `null` if none exists yet.
 * `drafts` no longer has at most one row per league as of Pass 12B — a
 * REDRAFT at the start of a new season creates another one (see
 * `supabase/migrations/20261003000000_multi_season_lifecycle.sql`, which
 * replaced the old `unique(league_id)` with `unique(season_id)`) — so this
 * always resolves the MOST RECENTLY CREATED draft (`created_at desc`),
 * which is correct regardless of how many a league has accumulated: the
 * inaugural draft when there's only ever been one, or the active/most
 * recent redraft once there have been more. Pass 10's draft engine
 * (`start_draft`/`make_draft_pick`, supabase/migrations/20260930024807_draft_engine.sql)
 * and `start_next_season`'s REDRAFT branch are what actually write these
 * rows. Callers must still treat `null` as "not started," never assume a
 * row exists.
 */
export async function getDraftStatus(leagueId: string): Promise<DraftStatus | null> {
  if (!isSupabaseConfigured()) return null;

  const supabase = await resolveClient();
  const { data, error } = await supabase
    .from("drafts")
    .select("status")
    .eq("league_id", leagueId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;

  return data.status as DraftStatus;
}

export interface DraftOrderEntry {
  position: number;
  fantasyTeamId: string;
  teamName: string;
  teamAbbreviation: string;
}

export interface DraftPickRecord {
  pickNumber: number;
  round: number;
  fantasyTeamId: string;
  teamName: string;
  playerId: string;
  playerName: string;
  position: PlayerPosition;
  clubShortName: string;
  pickedAt: string;
}

export interface DraftState {
  draftId: string;
  status: DraftStatus;
  currentRound: number;
  currentPick: number;
  /** `null` once the draft is completed (no more turns) or before it starts. */
  currentTeamId: string | null;
  currentTeamName: string | null;
  /** ISO instant the current pick's timer expires — from the persisted `current_pick_started_at` + the league's `pickTimerSeconds`, never a client-computed countdown. `null` when there's no active timer (scheduled/completed). */
  pickDeadline: string | null;
  teamCount: number;
  totalRounds: number;
  order: DraftOrderEntry[];
  picks: DraftPickRecord[];
  /** Whether the CALLER's own team in this league is on the clock right now. */
  isMyTurn: boolean;
  myFantasyTeamId: string | null;
}

/**
 * The full real draft state for a league's draft — order, every pick made
 * so far (most recent last), whose turn it is now, and the authoritative
 * timer deadline. `null` when no draft exists yet for this league (still
 * `WAITING_FOR_MANAGERS`/`READY_FOR_DRAFT`) — never fabricated.
 */
export async function getDraftState(leagueId: string): Promise<DraftState | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = await resolveClient();
  return queryDraftState(supabase, leagueId);
}

/**
 * The actual query logic behind `getDraftState`, parameterized by an
 * already-resolved Supabase client — same split as `queryPlayerDatabase`/
 * `getPlayerDatabase`, `queryMatchupSquads`/`getMatchupSquads`, and
 * `querySquad`/`getUserSquad`. Exported so an integration test can drive
 * it with a real admin client (an admin client's `auth.getUser()` simply
 * resolves to no user, which is a legitimate "not signed in as a manager"
 * state this function already handles — `myFantasyTeamId`/`isMyTurn`
 * just come back `null`/`false`).
 */
export async function queryDraftState(supabase: Awaited<ReturnType<typeof createClient>>, leagueId: string): Promise<DraftState | null> {
  const { data: draftRow } = await supabase
    .from("drafts")
    .select("id, status, current_round, current_pick, current_pick_started_at")
    .eq("league_id", leagueId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!draftRow) return null;

  const { data: leagueRow } = await supabase.from("fantasy_leagues").select("settings").eq("id", leagueId).maybeSingle();
  const settings = (leagueRow?.settings ?? {}) as { squadSize?: number; pickTimerSeconds?: number };
  const totalRounds = settings.squadSize ?? 16;
  const pickTimerSeconds = settings.pickTimerSeconds ?? 300;

  const { data: orderRows } = await supabase
    .from("draft_orders")
    .select("position, fantasy_teams(id, name, abbreviation)")
    .eq("draft_id", draftRow.id)
    .order("position", { ascending: true });

  const order: DraftOrderEntry[] = (orderRows ?? []).map((row) => {
    const team = row.fantasy_teams as unknown as { id: string; name: string; abbreviation: string } | null;
    return {
      position: row.position,
      fantasyTeamId: team?.id ?? "",
      teamName: team?.name ?? "—",
      teamAbbreviation: team?.abbreviation ?? "—",
    };
  });

  const { data: pickRows, error: pickRowsError } = await supabase
    .from("draft_picks")
    .select("pick_number, round, fantasy_team_id, picked_at, fantasy_teams(name), players(id, name, position, clubs!players_club_id_fkey(short_name))")
    .eq("draft_id", draftRow.id)
    .order("pick_number", { ascending: true });
  if (pickRowsError) console.error(`getDraftState: draft_picks fetch failed for draft ${draftRow.id}:`, pickRowsError);

  const picks: DraftPickRecord[] = (pickRows ?? []).map((row) => {
    const team = row.fantasy_teams as unknown as { name: string } | null;
    const player = row.players as unknown as { id: string; name: string; position: string; clubs: { short_name: string } | null } | null;
    return {
      pickNumber: row.pick_number,
      round: row.round,
      fantasyTeamId: row.fantasy_team_id,
      teamName: team?.name ?? "—",
      playerId: player?.id ?? "",
      playerName: player?.name ?? "—",
      position: (player?.position as PlayerPosition) ?? "MID",
      clubShortName: player?.clubs?.short_name ?? "—",
      pickedAt: row.picked_at,
    };
  });

  const teamCount = order.length;
  const isComplete = draftRow.status === "completed";
  const expectedPosition = isComplete
    ? null
    : teamPositionForPick((draftRow.current_round - 1) * teamCount + draftRow.current_pick, teamCount);
  const currentEntry = expectedPosition ? order.find((o) => o.position === expectedPosition) : undefined;

  const pickDeadline =
    draftRow.current_pick_started_at && !isComplete
      ? new Date(new Date(draftRow.current_pick_started_at).getTime() + pickTimerSeconds * 1000).toISOString()
      : null;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  let myFantasyTeamId: string | null = null;
  if (user) {
    const { data: myTeam } = await supabase
      .from("fantasy_teams")
      .select("id")
      .eq("league_id", leagueId)
      .eq("owner_user_id", user.id)
      .maybeSingle();
    myFantasyTeamId = myTeam?.id ?? null;
  }

  return {
    draftId: draftRow.id,
    status: draftRow.status as DraftStatus,
    currentRound: draftRow.current_round,
    currentPick: draftRow.current_pick,
    currentTeamId: currentEntry?.fantasyTeamId ?? null,
    currentTeamName: currentEntry?.teamName ?? null,
    pickDeadline,
    teamCount,
    totalRounds,
    order,
    picks,
    isMyTurn: Boolean(myFantasyTeamId && currentEntry && currentEntry.fantasyTeamId === myFantasyTeamId),
    myFantasyTeamId,
  };
}

export interface StartDraftResult {
  draftId: string;
}

/** Commissioner-only. Calls the atomic `start_draft` RPC — see supabase/migrations/20260930024807_draft_engine.sql. */
export async function startDraft(leagueId: string): Promise<StartDraftResult> {
  const supabase = await resolveClient();
  const { data, error } = await supabase.rpc("start_draft", { p_league_id: leagueId });
  if (error || !data || data.length === 0) throw toDraftActionError(error?.message);
  return { draftId: data[0].draft_id };
}

export interface MakeDraftPickResult {
  pickNumber: number;
  round: number;
  fantasyTeamId: string;
}

/** Calls the atomic `make_draft_pick` RPC. Never trust a client's claim about whose turn it is or whether a player is free — the database re-validates both. */
export async function makeDraftPick(draftId: string, playerId: string): Promise<MakeDraftPickResult> {
  const supabase = await resolveClient();
  const { data, error } = await supabase.rpc("make_draft_pick", { p_draft_id: draftId, p_player_id: playerId });
  if (error || !data || data.length === 0) throw toDraftActionError(error?.message);
  return { pickNumber: data[0].pick_number, round: data[0].round, fantasyTeamId: data[0].fantasy_team_id };
}
