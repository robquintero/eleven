import "server-only";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { bigFiveLeagueFromCompetitionCode } from "@/lib/leagues";
import type { Player, Squad } from "@/lib/types/fantasy";

/**
 * The signed-in user's real squad in one league: whatever `roster_entries`
 * actually exist for their `fantasy_teams` row, mapped to the UI's `Squad`
 * view-model. There is no draft engine yet (Pass 8+), so for every league
 * in the product today this resolves to `{ starters: [], bench: [] }` —
 * that's the correct, truthful answer, not a bug to work around.
 *
 * Roster entries with no `lineup_slots` row for the league's current round
 * (or when the league has no current round at all) are placed on the bench
 * rather than invented a pitch position for — an unassigned real player is
 * still real, it just isn't part of a starting XI yet.
 */
export async function getUserSquad(leagueId: string, fantasyTeamId: string): Promise<Squad> {
  const empty: Squad = { formation: "—", starters: [], bench: [] };
  if (!isSupabaseConfigured()) return empty;

  const supabase = await createClient();

  const { data: entries, error } = await supabase
    .from("roster_entries")
    .select(
      "id, player_id, players(id, name, short_name, position, shirt_number, availability_status, club_id, clubs(id, name, short_name, competition_id, competitions(code)))"
    )
    .eq("league_id", leagueId)
    .eq("fantasy_team_id", fantasyTeamId)
    .eq("status", "active");

  if (error || !entries || entries.length === 0) return empty;

  const players: Player[] = entries
    .filter((entry) => entry.players)
    .map((entry) => {
      const row = entry.players!;
      const club = row.clubs;
      const competitionCode = club?.competitions?.code ?? null;

      return {
        id: row.id,
        externalId: "",
        name: row.name,
        club: {
          id: club?.id ?? "unknown",
          name: club?.name ?? "Unknown club",
          shortName: club?.short_name ?? "—",
          league: bigFiveLeagueFromCompetitionCode(competitionCode),
          crestColor: "#6e6e73",
        },
        position: row.position as Player["position"],
        number: row.shirt_number ?? undefined,
        fantasyPoints: 0,
        availability: (row.availability_status as Player["availability"]) ?? "available",
      };
    });

  // No lineup-slot assignment exists yet for any league (no round scheduler
  // is built) — every real roster player is bench-unassigned rather than
  // placed at an invented pitch coordinate.
  return { formation: "—", starters: [], bench: players };
}
