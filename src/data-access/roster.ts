import "server-only";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { bigFiveLeagueFromCompetitionCode } from "@/lib/leagues";
import { deriveFormationLabel } from "@/domain/fantasy/constants";
import { isLocked } from "@/domain/fantasy/lineup-lock";
import { layoutStartingXi } from "@/lib/selectors/pitch-layout";
import type { Player, PlayerPosition, Squad } from "@/lib/types/fantasy";

interface RosterRow {
  id: string;
  player_id: string;
  players: {
    id: string;
    name: string;
    short_name: string;
    position: string;
    shirt_number: number | null;
    availability_status: string | null;
    club_id: string;
    clubs: {
      id: string;
      name: string;
      short_name: string;
      competition_id: string;
      competitions: { code: string } | null;
    } | null;
  } | null;
}

function toPlayer(row: RosterRow): Player | null {
  if (!row.players) return null;
  const player = row.players;
  const club = player.clubs;
  const competitionCode = club?.competitions?.code ?? null;

  return {
    id: player.id,
    externalId: "",
    name: player.name,
    club: {
      id: club?.id ?? "unknown",
      name: club?.name ?? "Unknown club",
      shortName: club?.short_name ?? "—",
      league: bigFiveLeagueFromCompetitionCode(competitionCode),
      crestColor: "#6e6e73",
    },
    position: player.position as PlayerPosition,
    number: player.shirt_number ?? undefined,
    fantasyPoints: 0,
    availability: (player.availability_status as Player["availability"]) ?? "available",
  };
}

/**
 * The signed-in user's real squad in one league: real `roster_entries`
 * joined to the CURRENT (most recent) round's `lineup_slots` when one
 * exists. A starter's pitch position is derived from a real, persisted
 * lineup choice (`layoutStartingXi`) — never invented. Before any round
 * has ever opened for this league (pre-draft, or drafted but no round
 * scheduled yet), every roster player is bench-unassigned, which is the
 * correct, truthful state, not a bug to work around.
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

  const playerByRosterEntryId = new Map<string, Player>();
  for (const entry of entries as RosterRow[]) {
    const player = toPlayer(entry);
    if (player) playerByRosterEntryId.set(entry.id, player);
  }

  const { data: currentRound } = await supabase
    .from("fantasy_rounds")
    .select("id")
    .eq("league_id", leagueId)
    .order("number", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!currentRound) {
    return { formation: "—", starters: [], bench: Array.from(playerByRosterEntryId.values()) };
  }

  const { data: slots } = await supabase
    .from("lineup_slots")
    .select("roster_entry_id, starter, locked_at")
    .eq("fantasy_round_id", currentRound.id)
    .in("roster_entry_id", Array.from(playerByRosterEntryId.keys()));

  const slotByRosterEntryId = new Map((slots ?? []).map((s) => [s.roster_entry_id, s]));
  const now = new Date();

  const starterEntries: Array<{ rosterEntryId: string; player: Player; locked: boolean }> = [];
  const bench: Player[] = [];

  for (const [rosterEntryId, player] of playerByRosterEntryId) {
    const slot = slotByRosterEntryId.get(rosterEntryId);
    if (slot?.starter) {
      starterEntries.push({
        rosterEntryId,
        player,
        locked: isLocked(slot.locked_at ? new Date(slot.locked_at) : null, now),
      });
    } else {
      bench.push(player);
    }
  }

  const counts: Partial<Record<PlayerPosition, number>> = {};
  for (const s of starterEntries) counts[s.player.position] = (counts[s.player.position] ?? 0) + 1;

  const laidOut = layoutStartingXi(starterEntries.map((s) => ({ position: s.player.position, value: s })));

  const starters = laidOut.map(({ value, x, y }) => ({
    id: value.rosterEntryId,
    position: value.player.position,
    x,
    y,
    player: value.player,
    locked: value.locked,
  }));

  return {
    formation: starterEntries.length > 0 ? deriveFormationLabel(counts) : "—",
    starters,
    bench,
  };
}
