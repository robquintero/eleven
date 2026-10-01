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
    nationality: player.nationality,
    fantasyPoints: 0,
    availability: (player.availability_status as Player["availability"]) ?? "available",
    // Every player this function returns is, by construction, on the
    // CALLER's own roster in this league -- "mine", never "owned" (which
    // means someone else's) or undefined (Pass 10.5B fix: undefined here
    // is what made the player drawer show a false "join a league" CTA for
    // an already-owned player opened from Team/Home).
    ownership: "mine",
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
      "id, player_id, players(id, name, short_name, position, shirt_number, nationality, availability_status, club_id, clubs(id, name, short_name, competition_id, competitions(code)))"
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

  // `lineup_slots` has no durable column recording WHICH specific pitch
  // slot a starter occupies (only the coarse GK/DEF/MID/FWD/BENCH
  // `slot` bucket) -- so which starter lands on, say, "left CB" vs
  // "right CB" is NOT preserved across a refresh/navigation today (Pass
  // 10.5C.2A: a prior pass sorted by `updated_at` to approximate this,
  // but that's an audit timestamp that can change for unrelated reasons
  // and was rejected as a canonical placement mechanism -- see this
  // pass's own report for the minimal schema change that would actually
  // fix this: a durable `slot_id` column). Sorting by roster_entry_id
  // gives a stable, deterministic (if not manager-chosen) placement on
  // every read instead, so a refresh never re-shuffles randomly, and each
  // *editing session* still places players exactly where the manager put
  // them (`team-workspace.tsx`'s own stable client-side slot ids).
  starterEntries.sort((a, b) => a.rosterEntryId.localeCompare(b.rosterEntryId));

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
    // Pass 10.5C.5: Eleven V1 is 4-4-2 only, so this is always "4-4-2"
    // once a round exists -- `deriveFormationLabel` (not hardcoded) so an
    // unexpected/incomplete composition still renders an honest label
    // instead of lying "4-4-2" when it isn't.
    formation: starterEntries.length > 0 ? deriveFormationLabel(counts) : "—",
    starters,
    bench,
  };
}

export interface RosterPlayerOption {
  id: string;
  name: string;
  position: PlayerPosition;
}

/**
 * A team's active roster as a flat, lineup-agnostic list — Pass 11's trade
 * proposal UI only needs id/name/position for picking offered/requested
 * assets, never the starter/bench/lock detail `getUserSquad` computes.
 */
export async function getTeamRosterPlayers(
  leagueId: string,
  fantasyTeamId: string
): Promise<RosterPlayerOption[]> {
  if (!isSupabaseConfigured()) return [];

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("roster_entries")
    .select("players(id, name, position)")
    .eq("league_id", leagueId)
    .eq("fantasy_team_id", fantasyTeamId)
    .eq("status", "active");

  if (error || !data) return [];

  return data
    .map((row) => row.players)
    .filter((p): p is { id: string; name: string; position: string } => Boolean(p))
    .map((p) => ({ id: p.id, name: p.name, position: p.position as PlayerPosition }));
}
