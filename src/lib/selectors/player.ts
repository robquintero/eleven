/**
 * Selectors — pure functions that derive presentation-ready values from the
 * existing UI-facing `Player` view-model (`@/lib/types/fantasy`). Domain
 * logic like this belongs here, not inline in page components; see
 * docs/architecture.md "Mock data — test/illustration only, never runtime"
 * for how this relates to the newer canonical types in `@/domain`.
 */

import { fixtureOpponentLabel } from "../team-fixture.ts";
import type { Player } from "@/lib/types/fantasy";

/** The name Eleven shows for a player — a seam for future formatting changes. */
export function getPlayerDisplayName(player: Player): string {
  return player.name;
}

/** First word of a fantasy team name, e.g. "Camden Wolves" → "CAMDEN". */
export function shortTeamName(name: string): string {
  return name.split(" ")[0].toUpperCase();
}

/** "FREE" / "MINE" / "OWNED / CAMDEN" / "WAIVERS" — see DESIGN.md §10 ownership vocabulary. */
export function getOwnershipLabel(player: Player): string {
  switch (player.ownership) {
    case "mine":
      return "MINE";
    case "owned":
      return player.ownerTeamName
        ? `OWNED / ${shortTeamName(player.ownerTeamName)}`
        : "OWNED";
    case "waivers":
      return "WAIVERS";
    case "free":
    default:
      return "FREE";
  }
}

/** "vs TOT" / "@ TOT" for a player's next fixture, or null if they have none. */
export const getNextFixtureLabel = fixtureOpponentLabel;

/** Mean of `recentForm`, or null if there's no form data yet. */
export function getRecentFormAverage(player: Player): number | null {
  if (!player.recentForm || player.recentForm.length === 0) return null;
  const sum = player.recentForm.reduce((total, points) => total + points, 0);
  return sum / player.recentForm.length;
}

export interface PlayerDatabaseSummary {
  free: number;
  owned: number;
  waivers: number;
  flagged: number;
}

/** Whole-database ownership/availability tallies — powers the Players page's summary strip. */
export function getDatabaseSummary(players: Player[]): PlayerDatabaseSummary {
  const summary: PlayerDatabaseSummary = { free: 0, owned: 0, waivers: 0, flagged: 0 };
  for (const player of players) {
    const ownership = player.ownership ?? "free";
    if (ownership === "free") summary.free += 1;
    else if (ownership === "owned") summary.owned += 1;
    else if (ownership === "waivers") summary.waivers += 1;
    if (player.availability === "injured" || player.availability === "suspended") {
      summary.flagged += 1;
    }
  }
  return summary;
}
