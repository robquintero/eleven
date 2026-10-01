import "server-only";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import type { ScheduleCycles } from "@/domain/fantasy/season";

export type SeasonStatus = "SETUP" | "ACTIVE" | "COMPLETED";
export type { ScheduleCycles };

export interface SeasonSummary {
  id: string;
  seasonNumber: number;
  status: SeasonStatus;
  scheduleCycles: ScheduleCycles;
  /** `null` while still SETUP -- not computed until the real team count is known at the first round's open (see resolveOrCreateActiveSeason). */
  totalRounds: number | null;
  /** The highest-numbered fantasy round opened so far this season, or `null` if none has opened yet. */
  currentRoundNumber: number | null;
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
    .select("id, season_number, status, schedule_cycles, total_rounds, champion_fantasy_team_id")
    .eq("league_id", leagueId)
    .order("season_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!season) return null;

  const { data: latestRound } = await supabase
    .from("fantasy_rounds")
    .select("number")
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
    totalRounds: season.total_rounds,
    currentRoundNumber: latestRound?.number ?? null,
    championFantasyTeamId: season.champion_fantasy_team_id,
    championTeamName,
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
