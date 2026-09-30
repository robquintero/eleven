import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { calculateFantasyScore, SCORING_RULE_VERSION } from "../../domain/fantasy/scoring.ts";
import type { PlayerPosition } from "../../domain/football/types.ts";
import type { Database } from "../supabase/database.types.ts";

export interface ReplayPlayerResult {
  playerId: string;
  storedPoints: number | null;
  recomputedPoints: number;
  changed: boolean;
}

export interface ReplayFixtureResult {
  fixtureId: string;
  scoringRuleVersion: string;
  performances: number;
  players: ReplayPlayerResult[];
  anyChanged: boolean;
}

/**
 * Replays ONE stored fixture against real historical data (brief §Phase 5:
 * "must be able to replay a completed fixture... using stored historical
 * data, not waiting for live football"). Recomputes every player's score
 * from the fixture's CURRENT `player_match_stats` rows and diffs against
 * whatever is currently in `fantasy_player_scores` for that fixture —
 * `changed: false` for every player proves the same deterministic result
 * comes back out, exactly what "replay the same fixture repeatedly ->
 * identical result" (brief §Testing) means for real (not synthetic) data.
 *
 * Read-only: does not upsert. Re-run `npm run scoring:backfill` (or a
 * targeted `backfillScores({ fixtureIds })`) if a real recompute+write is
 * wanted instead of just an audit.
 */
export async function replayFixture(
  admin: SupabaseClient<Database>,
  fixtureId: string
): Promise<ReplayFixtureResult> {
  const { data: fixture, error: fixtureError } = await admin
    .from("fixtures")
    .select("id, home_club_id, away_club_id, home_score, away_score")
    .eq("id", fixtureId)
    .maybeSingle();

  if (fixtureError || !fixture) {
    throw new Error(`Fixture ${fixtureId} not found: ${fixtureError?.message ?? "no matching row"}`);
  }

  const { data: statsRows, error: statsError } = await admin
    .from("player_match_stats")
    .select(
      "player_id, minutes, goals, assists, shots_on_target, chances_created, tackles, interceptions, blocks, saves, yellow_cards, red_cards"
    )
    .eq("fixture_id", fixtureId);

  if (statsError) throw new Error(`Failed to load player_match_stats: ${statsError.message}`);

  const playerIds = (statsRows ?? []).map((r) => r.player_id);
  const { data: players } = await admin.from("players").select("id, position, club_id").in("id", playerIds);
  const playerById = new Map((players ?? []).map((p) => [p.id, p]));

  const { data: existingScores } = await admin
    .from("fantasy_player_scores")
    .select("player_id, points")
    .eq("fixture_id", fixtureId)
    .eq("scoring_rule_version", SCORING_RULE_VERSION);
  const existingByPlayer = new Map((existingScores ?? []).map((s) => [s.player_id, s.points]));

  const results: ReplayPlayerResult[] = [];
  for (const row of statsRows ?? []) {
    const player = playerById.get(row.player_id);
    if (!player) continue;

    let concededByOwnClub: number | null = null;
    if (fixture.home_score !== null && fixture.away_score !== null) {
      if (player.club_id === fixture.home_club_id) concededByOwnClub = fixture.away_score;
      else if (player.club_id === fixture.away_club_id) concededByOwnClub = fixture.home_score;
    }

    const breakdown = calculateFantasyScore({
      position: player.position as PlayerPosition,
      minutes: row.minutes,
      goals: row.goals,
      assists: row.assists,
      shotsOnTarget: row.shots_on_target,
      chancesCreated: row.chances_created,
      tackles: row.tackles,
      interceptions: row.interceptions,
      blocks: row.blocks,
      saves: row.saves,
      yellowCards: row.yellow_cards,
      redCards: row.red_cards,
      concededByOwnClub,
    });

    const storedPoints = existingByPlayer.get(row.player_id) ?? null;
    results.push({
      playerId: row.player_id,
      storedPoints,
      recomputedPoints: breakdown.total,
      changed: storedPoints !== null && storedPoints !== breakdown.total,
    });
  }

  return {
    fixtureId,
    scoringRuleVersion: SCORING_RULE_VERSION,
    performances: results.length,
    players: results,
    anyChanged: results.some((r) => r.changed),
  };
}
