import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ScoringRuleVersion } from "../../domain/fantasy/scoring.ts";
import { scoringVersion, scoreStoredPerformance } from "./versions.ts";
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
  fixtureId: string,
  version: ScoringRuleVersion
): Promise<ReplayFixtureResult> {
  scoringVersion(version);
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
      "player_id, minutes, goals, assists, shots_on_target, chances_created, tackles, interceptions, blocks, saves, yellow_cards, red_cards, reported_stats, participation_club_id, scoring_position"
    )
    .eq("fixture_id", fixtureId);

  if (statsError) throw new Error(`Failed to load player_match_stats: ${statsError.message}`);

  const playerIds = (statsRows ?? []).map((r) => r.player_id);
  const { data: players } = await admin.from("players").select("id, position, club_id").in("id", playerIds);
  const playerById = new Map((players ?? []).map((p) => [p.id, p]));
  const { data: nationalTeams } = await admin.from("player_national_teams").select("player_id, national_team_club_id").in("player_id", playerIds);
  const sidesByPlayer = new Map<string, string[]>();
  for (const team of nationalTeams ?? []) sidesByPlayer.set(team.player_id, [...(sidesByPlayer.get(team.player_id) ?? []), team.national_team_club_id]);

  const { data: existingScores } = await admin
    .from("fantasy_player_scores")
    .select("player_id, points")
    .eq("fixture_id", fixtureId)
    .eq("scoring_rule_version", version);
  const existingByPlayer = new Map((existingScores ?? []).map((s) => [s.player_id, s.points]));

  const results: ReplayPlayerResult[] = [];
  for (const row of statsRows ?? []) {
    const player = playerById.get(row.player_id);
    if (!player) continue;

    let concededByOwnClub: number | null = null;
    if (fixture.home_score !== null && fixture.away_score !== null) {
      if ([player.club_id, ...(sidesByPlayer.get(row.player_id) ?? [])].includes(fixture.home_club_id)) concededByOwnClub = fixture.away_score;
      else if ([player.club_id, ...(sidesByPlayer.get(row.player_id) ?? [])].includes(fixture.away_club_id)) concededByOwnClub = fixture.home_score;
    }

    if (version === "ELEVEN_STANDARD_V4") {
      const side = row.participation_club_id;
      concededByOwnClub = side === fixture.home_club_id ? fixture.away_score : side === fixture.away_club_id ? fixture.home_score : null;
    }
    const breakdown = scoreStoredPerformance(version, row, player.position as PlayerPosition, concededByOwnClub);

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
    scoringRuleVersion: version,
    performances: results.length,
    players: results,
    anyChanged: results.some((r) => r.changed),
  };
}
