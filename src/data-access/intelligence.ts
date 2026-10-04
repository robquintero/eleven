import "server-only";
// Relative imports (not `@/...`) -- same reasoning as players.ts/matchups.ts's
// own import-block comments: keeps `queryHotFreeAgents` importable from a
// plain Node script/test, never requiring a live Next.js request.
import { isSupabaseConfigured } from "../lib/supabase/config.ts";
import { bigFiveLeagueFromCompetitionCode } from "../lib/leagues.ts";
import { getFantasyScoreAggregates, type SupabaseClientType } from "./players.ts";
import { SCORING_RULE_VERSION } from "../domain/fantasy/scoring.ts";
import type { Player, PlayerPosition } from "../lib/types/fantasy.ts";

async function resolveClient() {
  const { createClient } = await import("../lib/supabase/server.ts");
  return createClient();
}

/** How far back a "recent" eligible performance can be and still count toward recent form. */
const RECENT_WINDOW_DAYS = 21;
/** Fewer than this many recent performances isn't a real form signal -- a single huge game from an otherwise idle player would misleadingly top the list. */
const MIN_RECENT_APPEARANCES = 2;
/** At most this many of a player's most recent performances feed the average/sparkline. */
const RECENT_APPEARANCES_CONSIDERED = 3;
const DEFAULT_LIMIT = 5;

export interface HotFreeAgent {
  player: Player;
  recentAveragePoints: number;
  /**
   * Pass 14.7 Phase 3: "recent-form" means `recentAveragePoints` is a real
   * average over >= MIN_RECENT_APPEARANCES eligible performances in the
   * last RECENT_WINDOW_DAYS -- a genuine "hot right now" signal.
   * "season-total" is the honest fallback used only to fill out the list
   * when too few free agents have enough recent data (e.g. early in a
   * league's life) -- never silently relabeled as "recent form," per the
   * brief's "do not fabricate trends unsupported by stored data."
   */
  basis: "recent-form" | "season-total";
}

interface CandidatePlayerRow {
  id: string;
  name: string;
  position: string;
  shirt_number: number | null;
  nationality: string | null;
  availability_status: string | null;
  club_id: string;
  clubs: {
    id: string;
    name: string;
    short_name: string;
    competition_id: string;
    competitions: { code: string } | null;
  } | null;
}

function toPlayer(
  row: CandidatePlayerRow,
  recentForm: number[] | undefined,
  totalPoints: number | undefined,
  averagePoints: number | undefined
): Player {
  const club = row.clubs;
  return {
    id: row.id,
    externalId: "",
    name: row.name,
    club: {
      id: club?.id ?? row.club_id,
      name: club?.name ?? "—",
      shortName: club?.short_name ?? "—",
      league: bigFiveLeagueFromCompetitionCode(club?.competitions?.code ?? null),
      crestColor: "#6e6e73",
    },
    position: row.position as PlayerPosition,
    number: row.shirt_number ?? undefined,
    nationality: row.nationality,
    // No owning team/round context here (these are free agents) -- the
    // round-matchup semantics `fantasyPoints` normally carries don't apply,
    // so this is truthfully 0, never a repurposed stand-in for the real
    // recent-form/season numbers below (which the UI reads separately).
    fantasyPoints: 0,
    totalPoints,
    averagePoints,
    recentForm,
    availability: (row.availability_status as Player["availability"]) ?? "available",
    ownership: "free",
  };
}

/**
 * Pass 14.7 Phase 3: "who should I be paying attention to right now" --
 * free agents (not owned in THIS league) with the best recent real V3 form,
 * falling back to season-total leaders only when too few free agents have
 * enough recent data to make "recent form" a meaningful signal at all (see
 * `HotFreeAgent.basis`). Entirely derived from stored `fantasy_player_scores`
 * -- zero provider calls, zero fabricated projections/trends.
 */
export async function getHotFreeAgents(leagueId: string, limit: number = DEFAULT_LIMIT): Promise<HotFreeAgent[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = await resolveClient();
  return queryHotFreeAgents(supabase, leagueId, limit);
}

/** Client-injectable core of `getHotFreeAgents` -- same reasoning as `queryPlayerDatabase`/`queryMatchupSquads`. */
export async function queryHotFreeAgents(
  supabase: SupabaseClientType,
  leagueId: string,
  limit: number = DEFAULT_LIMIT
): Promise<HotFreeAgent[]> {
  const { data: owned } = await supabase.from("league_player_ownership").select("player_id").eq("league_id", leagueId);
  const ownedIds = new Set((owned ?? []).map((o) => o.player_id));

  const now = new Date();
  const windowStart = new Date(now.getTime() - RECENT_WINDOW_DAYS * 24 * 3600_000);
  const { data: recentFixtures } = await supabase
    .from("fixtures")
    .select("id, kickoff_at")
    .eq("status", "final")
    .gte("kickoff_at", windowStart.toISOString())
    .lte("kickoff_at", now.toISOString());
  const kickoffByFixtureId = new Map((recentFixtures ?? []).map((f) => [f.id, f.kickoff_at]));
  const fixtureIds = Array.from(kickoffByFixtureId.keys());

  const recentScoresByPlayer = new Map<string, Array<{ points: number; kickoffAt: string }>>();
  if (fixtureIds.length > 0) {
    const { data: scores } = await supabase
      .from("fantasy_player_scores")
      .select("player_id, fixture_id, points")
      .eq("scoring_rule_version", SCORING_RULE_VERSION)
      .in("fixture_id", fixtureIds);
    for (const row of scores ?? []) {
      if (ownedIds.has(row.player_id)) continue;
      const kickoffAt = kickoffByFixtureId.get(row.fixture_id);
      if (!kickoffAt) continue;
      const list = recentScoresByPlayer.get(row.player_id) ?? [];
      list.push({ points: row.points, kickoffAt });
      recentScoresByPlayer.set(row.player_id, list);
    }
  }

  const recentCandidates: { playerId: string; recentForm: number[]; average: number }[] = [];
  for (const [playerId, list] of recentScoresByPlayer) {
    const mostRecentFirst = list
      .slice()
      .sort((a, b) => new Date(b.kickoffAt).getTime() - new Date(a.kickoffAt).getTime())
      .slice(0, RECENT_APPEARANCES_CONSIDERED);
    if (mostRecentFirst.length < MIN_RECENT_APPEARANCES) continue;
    const average = mostRecentFirst.reduce((sum, s) => sum + s.points, 0) / mostRecentFirst.length;
    recentCandidates.push({
      playerId,
      // "most recent last" (Player.recentForm's own documented convention).
      recentForm: mostRecentFirst.slice().reverse().map((s) => s.points),
      average,
    });
  }
  recentCandidates.sort((a, b) => b.average - a.average);

  const picked = recentCandidates.slice(0, limit);
  const pickedIds = new Set(picked.map((c) => c.playerId));

  // Fallback: too few free agents have enough recent data (e.g. early in a
  // league's life, or a quiet international window) -- fill remaining
  // slots with real season-total leaders among the OTHER free agents,
  // honestly labeled "season-total" rather than pretending it's form.
  let fallbackCandidates: { playerId: string; totalPoints: number }[] = [];
  if (picked.length < limit) {
    const seasonAll = await getFantasyScoreAggregates(supabase);
    fallbackCandidates = Array.from(seasonAll.entries())
      .filter(([playerId]) => !ownedIds.has(playerId) && !pickedIds.has(playerId))
      .map(([playerId, agg]) => ({ playerId, totalPoints: agg.totalPoints }))
      .sort((a, b) => b.totalPoints - a.totalPoints)
      .slice(0, limit - picked.length);
  }

  const allIds = [...picked.map((c) => c.playerId), ...fallbackCandidates.map((c) => c.playerId)];
  if (allIds.length === 0) return [];

  const { data: playerRows } = await supabase
    .from("players")
    .select(
      "id, name, position, shirt_number, nationality, availability_status, active, club_id, clubs!players_club_id_fkey(id, name, short_name, competition_id, competitions(code))"
    )
    .in("id", allIds)
    .eq("active", true);
  const playerById = new Map(((playerRows ?? []) as unknown as CandidatePlayerRow[]).map((p) => [p.id, p]));

  const seasonAggregates = await getFantasyScoreAggregates(supabase, allIds);

  const result: HotFreeAgent[] = [];
  for (const c of picked) {
    const row = playerById.get(c.playerId);
    if (!row) continue; // not active anymore -- never recommend a retired/inactive player
    const season = seasonAggregates.get(c.playerId);
    result.push({
      recentAveragePoints: Math.round(c.average * 100) / 100,
      basis: "recent-form",
      player: toPlayer(row, c.recentForm, season?.totalPoints, season?.averagePoints),
    });
  }
  for (const c of fallbackCandidates) {
    const row = playerById.get(c.playerId);
    if (!row) continue;
    const season = seasonAggregates.get(c.playerId);
    result.push({
      recentAveragePoints: season?.averagePoints ?? 0,
      basis: "season-total",
      player: toPlayer(row, undefined, season?.totalPoints, season?.averagePoints),
    });
  }

  return result;
}
