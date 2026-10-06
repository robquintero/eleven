import { calculateFantasyScoreV1 } from "../../domain/fantasy/scoring-v1.ts";
import { calculateFantasyScoreV2, calculateFantasyScoreV3, type ScoringInput, type ScoringRuleVersion } from "../../domain/fantasy/scoring.ts";
import { calculateFantasyScoreV4 } from "../../domain/fantasy/scoring-v4.ts";
import type { PlayerPosition } from "../../domain/football/types.ts";

export function scoringVersion(value: unknown): ScoringRuleVersion {
  if (typeof value !== "string" || !["ELEVEN_STANDARD_V1", "ELEVEN_STANDARD_V2", "ELEVEN_STANDARD_V3", "ELEVEN_STANDARD_V4"].includes(value)) throw new Error(`Unknown scoring version: ${String(value)}`);
  return value as ScoringRuleVersion;
}
export interface StoredScoringStats {
  minutes: number; goals: number; assists: number; shots_on_target: number; chances_created: number;
  tackles: number; interceptions: number; blocks: number; saves: number; yellow_cards: number; red_cards: number;
  reported_stats?: unknown; scoring_position?: string | null;
}
/** Legacy scorers use exactly their historical columns; V4 uses preserved
 * nullable provider counts. Legacy fallback is explicitly incomplete. */
export function scoreStoredPerformance(version: ScoringRuleVersion, row: StoredScoringStats, position: PlayerPosition, conceded: number | null, options: { allowIncompleteV4?: boolean } = {}) {
  scoringVersion(version); // Runtime callers cannot silently fall through to the newest formula.
  const input: ScoringInput = { position, minutes: row.minutes, goals: row.goals, assists: row.assists,
    shotsOnTarget: row.shots_on_target, chancesCreated: row.chances_created, tackles: row.tackles,
    interceptions: row.interceptions, blocks: row.blocks, saves: row.saves,
    yellowCards: row.yellow_cards, redCards: row.red_cards, concededByOwnClub: conceded };
  if (version === "ELEVEN_STANDARD_V1") return calculateFantasyScoreV1(input);
  if (version === "ELEVEN_STANDARD_V2") return calculateFantasyScoreV2(input);
  if (version === "ELEVEN_STANDARD_V3") return calculateFantasyScoreV3(input);
  if (row.reported_stats == null && !options.allowIncompleteV4) throw new Error("V4_REQUIRES_REPORTED_STATS: legacy rows are calibration-only until explicitly re-ingested");
  if ((!row.scoring_position || !["GK", "DEF", "MID", "FWD"].includes(row.scoring_position)) && !options.allowIncompleteV4) throw new Error("V4_REQUIRES_SCORING_POSITION: official scores require a captured fantasy position");
  const fallback = { minutes: row.minutes, goals: row.goals, assists: row.assists, shotsOnTarget: row.shots_on_target,
    keyPasses: row.chances_created, tackles: row.tackles, interceptions: row.interceptions, blocks: row.blocks,
    saves: row.saves, yellowCards: row.yellow_cards, redCards: row.red_cards };
  const stats = row.reported_stats && typeof row.reported_stats === "object" && !Array.isArray(row.reported_stats)
    ? row.reported_stats as Record<string, number | null> : fallback;
  const pinnedPosition = row.scoring_position && ["GK", "DEF", "MID", "FWD"].includes(row.scoring_position) ? row.scoring_position as PlayerPosition : position;
  return calculateFantasyScoreV4({ position: pinnedPosition, stats, concededByOwnTeam: conceded });
}
