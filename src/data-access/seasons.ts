import "server-only";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { toSeasonActionError } from "@/lib/errors/season-action-error";
import { getStandingsForSeason, getSeasonMatchupResults, type StandingsRow, type LeagueMatchupSummary } from "@/data-access/matchups";
import type { ScheduleCycles } from "@/domain/fantasy/season";

export type SeasonStatus = "SETUP" | "ACTIVE" | "COMPLETED";
export type RosterMode = "REDRAFT" | "KEEP_ROSTERS";
export type { ScheduleCycles };

export interface SeasonSummary {
  id: string;
  seasonNumber: number;
  status: SeasonStatus;
  scheduleCycles: ScheduleCycles;
  /** `null` for season 1 (always a fresh draft) -- see `roster_mode`'s own column comment. */
  rosterMode: RosterMode | null;
  /** `null` while still SETUP -- not computed until the real team count is known at the first round's open (see resolveOrCreateActiveSeason). */
  totalRounds: number | null;
  /** The highest-numbered fantasy round opened so far this season, or `null` if none has opened yet. */
  currentRoundNumber: number | null;
  /** Pass 14.5: that same round's real stored window + lifecycle status (`fantasy_rounds.starts_at`/`ends_at`/`status`) -- `null` only alongside `currentRoundNumber === null`. Powers the League page's `RoundWindow` readout (brief §Phase 3). */
  currentRoundStartsAt: string | null;
  currentRoundEndsAt: string | null;
  currentRoundStatus: "upcoming" | "in_progress" | "completed" | null;
  championFantasyTeamId: string | null;
  championTeamName: string | null;
}

/**
 * The league's current (latest by season_number) season — SETUP, ACTIVE,
 * or COMPLETED. `null` only when the league has no season row at all yet
 * (true for every league before its first fantasy round has ever opened;
 * see `resolveOrCreateActiveSeason` in src/lib/fantasy-engine/rounds.ts,
 * the only place a season row is ever created outside this RPC's SETUP
 * placeholder).
 */
export async function getSeasonSummary(leagueId: string): Promise<SeasonSummary | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = await createClient();

  const { data: season } = await supabase
    .from("seasons")
    .select("id, season_number, status, schedule_cycles, roster_mode, total_rounds, champion_fantasy_team_id")
    .eq("league_id", leagueId)
    .order("season_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!season) return null;

  const { data: latestRound } = await supabase
    .from("fantasy_rounds")
    .select("number, starts_at, ends_at, status")
    .eq("season_id", season.id)
    .order("number", { ascending: false })
    .limit(1)
    .maybeSingle();

  let championTeamName: string | null = null;
  if (season.champion_fantasy_team_id) {
    const { data: team } = await supabase
      .from("fantasy_teams")
      .select("name")
      .eq("id", season.champion_fantasy_team_id)
      .maybeSingle();
    championTeamName = team?.name ?? null;
  }

  return {
    id: season.id,
    seasonNumber: season.season_number,
    status: season.status as SeasonStatus,
    scheduleCycles: season.schedule_cycles as ScheduleCycles,
    rosterMode: season.roster_mode as RosterMode | null,
    totalRounds: season.total_rounds,
    currentRoundNumber: latestRound?.number ?? null,
    currentRoundStartsAt: latestRound?.starts_at ?? null,
    currentRoundEndsAt: latestRound?.ends_at ?? null,
    currentRoundStatus: (latestRound?.status as SeasonSummary["currentRoundStatus"]) ?? null,
    championFantasyTeamId: season.champion_fantasy_team_id,
    championTeamName,
  };
}

export interface SeasonListEntry {
  id: string;
  seasonNumber: number;
  status: SeasonStatus;
  scheduleCycles: ScheduleCycles;
  rosterMode: RosterMode | null;
  championTeamName: string | null;
}

/**
 * Every season this league has ever had, most recent first — the Season
 * Archive's index (brief 12B §1: "a league member must be able to inspect
 * completed seasons"). Includes the current season too (whatever its
 * status), since there is nothing to hide about it; the archive DETAIL
 * view (`getSeasonArchiveDetail`) is what a member opens from here.
 */
export async function listSeasons(leagueId: string): Promise<SeasonListEntry[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = await createClient();

  const { data: seasons } = await supabase
    .from("seasons")
    .select("id, season_number, status, schedule_cycles, roster_mode, champion_fantasy_team_id")
    .eq("league_id", leagueId)
    .order("season_number", { ascending: false });
  if (!seasons || seasons.length === 0) return [];

  const championIds = Array.from(new Set(seasons.map((s) => s.champion_fantasy_team_id).filter((id): id is string => Boolean(id))));
  const { data: teams } = championIds.length
    ? await supabase.from("fantasy_teams").select("id, name").in("id", championIds)
    : { data: [] as { id: string; name: string }[] };
  const nameById = new Map((teams ?? []).map((t) => [t.id, t.name]));

  return seasons.map((s) => ({
    id: s.id,
    seasonNumber: s.season_number,
    status: s.status as SeasonStatus,
    scheduleCycles: s.schedule_cycles as ScheduleCycles,
    rosterMode: s.roster_mode as RosterMode | null,
    championTeamName: s.champion_fantasy_team_id ? (nameById.get(s.champion_fantasy_team_id) ?? null) : null,
  }));
}

export interface SeasonArchiveDetail {
  id: string;
  seasonNumber: number;
  status: SeasonStatus;
  scheduleCycles: ScheduleCycles;
  rosterMode: RosterMode | null;
  totalRounds: number | null;
  championFantasyTeamId: string | null;
  championTeamName: string | null;
  standings: StandingsRow[];
  results: LeagueMatchupSummary[];
}

/**
 * Full detail for ONE EXPLICIT historical season, looked up by its
 * `seasonNumber` within `leagueId` (never "the current season" — see
 * `getStandingsForSeason`'s own doc comment on why historical views must
 * never go through a current-season resolver). `null` if that league has
 * no season with that number. Standings and results are both derived
 * ONLY from that season's own finalized matchups, so a completed season's
 * archive can never be affected by anything happening in a later season.
 */
export async function getSeasonArchiveDetail(leagueId: string, seasonNumber: number): Promise<SeasonArchiveDetail | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = await createClient();

  const { data: season } = await supabase
    .from("seasons")
    .select("id, season_number, status, schedule_cycles, roster_mode, total_rounds, champion_fantasy_team_id")
    .eq("league_id", leagueId)
    .eq("season_number", seasonNumber)
    .maybeSingle();
  if (!season) return null;

  let championTeamName: string | null = null;
  if (season.champion_fantasy_team_id) {
    const { data: team } = await supabase.from("fantasy_teams").select("name").eq("id", season.champion_fantasy_team_id).maybeSingle();
    championTeamName = team?.name ?? null;
  }

  const [standings, results] = await Promise.all([
    getStandingsForSeason(supabase, season.id),
    getSeasonMatchupResults(supabase, season.id),
  ]);

  return {
    id: season.id,
    seasonNumber: season.season_number,
    status: season.status as SeasonStatus,
    scheduleCycles: season.schedule_cycles as ScheduleCycles,
    rosterMode: season.roster_mode as RosterMode | null,
    totalRounds: season.total_rounds,
    championFantasyTeamId: season.champion_fantasy_team_id,
    championTeamName,
    standings,
    results,
  };
}

export type SetSeasonScheduleFormatErrorCode =
  | "NOT_AUTHENTICATED"
  | "INVALID_SCHEDULE_FORMAT"
  | "NOT_COMMISSIONER"
  | "SEASON_ALREADY_STARTED"
  | "UNKNOWN";

export class SetSeasonScheduleFormatError extends Error {
  code: SetSeasonScheduleFormatErrorCode;
  constructor(code: SetSeasonScheduleFormatErrorCode, message?: string) {
    super(message ?? code);
    this.code = code;
    this.name = "SetSeasonScheduleFormatError";
  }
}

const KNOWN_CODES: readonly SetSeasonScheduleFormatErrorCode[] = [
  "NOT_AUTHENTICATED",
  "INVALID_SCHEDULE_FORMAT",
  "NOT_COMMISSIONER",
  "SEASON_ALREADY_STARTED",
];

/**
 * Commissioner-only, pre-season-only schedule format control (brief
 * section 9's "minimum clean control") — calls `set_season_schedule_format`
 * (supabase/migrations/20261002000000_season_engine.sql). Once a season
 * exists in ANY state (even SETUP from an earlier call), the RPC itself
 * rejects a further change with SEASON_ALREADY_STARTED — "no destructive
 * mid-season format changes."
 */
export async function setSeasonScheduleFormat(leagueId: string, cycles: ScheduleCycles): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_season_schedule_format", { p_league_id: leagueId, p_cycles: cycles });
  if (error) {
    const code = KNOWN_CODES.find((c) => c === error.message);
    throw new SetSeasonScheduleFormatError(code ?? "UNKNOWN", error.message);
  }
}

export interface StartNextSeasonResult {
  seasonId: string;
  seasonNumber: number;
  /** Only present for REDRAFT — null for KEEP_ROSTERS, which creates no draft. */
  draftId: string | null;
}

/**
 * Commissioner-only "Start Next Season" (brief 12B §2/§3) — calls
 * `start_next_season` (supabase/migrations/20261003000000_multi_season_lifecycle.sql),
 * which atomically creates Season N+1 and applies the chosen roster
 * mode's ownership side effects in one transaction. For REDRAFT, the new
 * draft is already `in_progress` by the time this returns — the Draft
 * page picks it up the same way it already does any draft (see
 * `getDraftStatus`'s own Pass 12B update). For KEEP_ROSTERS, THIS
 * function does not itself open Season N+1's first round — the calling
 * Server Action must follow up via the fantasy-engine layer's
 * `activateKeptRosterSeason` (never call the admin-client engine from
 * this data-access file directly — see src/lib/fantasy-engine/season.ts).
 */
export async function startNextSeason(
  leagueId: string,
  rosterMode: RosterMode,
  scheduleCycles: ScheduleCycles
): Promise<StartNextSeasonResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("start_next_season", {
    p_league_id: leagueId,
    p_roster_mode: rosterMode,
    p_schedule_cycles: scheduleCycles,
  });
  if (error || !data || data.length === 0) throw toSeasonActionError(error?.message);
  const row = data[0];
  return { seasonId: row.season_id, seasonNumber: row.season_number, draftId: row.draft_id };
}
