import "server-only";
import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
// Relative imports (not the usual `@/...` aliases) -- same reasoning as
// src/data-access/players.ts's own import-block comment: keeps
// `querySquad` importable from a plain Node integration test.
// `../lib/supabase/server.ts` itself is NOT statically imported (see
// `resolveClient` below) since it pulls in `next/headers`.
import { isSupabaseConfigured } from "../lib/supabase/config.ts";
import { bigFiveLeagueFromCompetitionCode } from "../lib/leagues.ts";
import { deriveFormationLabel } from "../domain/fantasy/constants.ts";
import { isLocked } from "../domain/fantasy/lineup-lock.ts";
import { scoringVersion } from "../lib/scoring/versions.ts";
import { getRoundPlayerState } from "./matchups.ts";
import { layoutStartingXi } from "../lib/selectors/pitch-layout.ts";
import type { RoundWindow } from "../domain/fantasy/round-calendar.ts";
import type { Database } from "../lib/supabase/database.types.ts";
import type { Player, PlayerPosition, Squad } from "../lib/types/fantasy.ts";

/** Dynamically imported so this module -- specifically `querySquad` -- stays importable from a plain Node integration test; see this file's own import-block comment. */
async function resolveClient() {
  const { createClient } = await import("../lib/supabase/server.ts");
  return createClient();
}

interface RosterRow {
  id: string;
  player_id: string;
  /** Pass 14.6: when THIS roster entry acquired the player -- the "no retroactive point inheritance" cutoff, see getRoundPlayerState. */
  acquired_at: string;
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

function toPlayer(
  row: RosterRow,
  pointsByPlayerId: Map<string, number>,
  fixtureByPlayerId: Map<string, Player["fixture"]>,
  preAcquisitionPointsByPlayerId: Map<string, number>
): Player | null {
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
    // Pass 14.5: real, round-scoped points (same aggregation
    // `queryMatchupSquads` uses for the Matchup page) -- `0` is a real,
    // known zero (no round yet, or the round hasn't started) whenever no
    // round-player-state lookup ran, never a placeholder masquerading as
    // "no data."
    fantasyPoints: Math.round((pointsByPlayerId.get(player.id) ?? 0) * 100) / 100,
    preAcquisitionPoints: preAcquisitionPointsByPlayerId.has(player.id)
      ? Math.round(preAcquisitionPointsByPlayerId.get(player.id)! * 100) / 100
      : undefined,
    availability: (player.availability_status as Player["availability"]) ?? "available",
    fixture: fixtureByPlayerId.get(player.id),
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
export const getUserSquad = cache(async function getUserSquad(leagueId: string, fantasyTeamId: string): Promise<Squad> {
  if (!isSupabaseConfigured()) return { formation: "—", starters: [], bench: [] };
  const supabase = await resolveClient();
  return querySquad(supabase, leagueId, fantasyTeamId);
});

/**
 * The actual query logic behind `getUserSquad`, parameterized by an
 * already-resolved Supabase client — same split as `queryPlayerDatabase`/
 * `getPlayerDatabase` and `queryMatchupSquads`/`getMatchupSquads`, and for
 * the same reason: `getUserSquad` itself needs a live Next.js request's
 * cookies and can't be called from a plain integration test, but this can,
 * against the real database, via an admin client.
 */
export async function querySquad(
  supabase: SupabaseClient<Database>,
  leagueId: string,
  fantasyTeamId: string
): Promise<Squad> {
  const empty: Squad = { formation: "—", starters: [], bench: [] };

  const [{ data: entries, error }, { data: currentRound }] = await Promise.all([
    supabase
    .from("roster_entries")
    .select(
      "id, player_id, acquired_at, players(id, name, short_name, position, shirt_number, nationality, availability_status, club_id, clubs!players_club_id_fkey(id, name, short_name, competition_id, competitions(code)))"
    )
    .eq("league_id", leagueId)
    .eq("fantasy_team_id", fantasyTeamId)
    .eq("status", "active"),
    supabase
    .from("fantasy_rounds")
    .select("id, starts_at, ends_at, scoring_rule_version")
    .eq("league_id", leagueId)
    .order("number", { ascending: false })
    .limit(1)
    .maybeSingle(),
  ]);
  if (error) console.error(`getUserSquad: roster_entries fetch failed for team ${fantasyTeamId}:`, error);
  if (error || !entries || entries.length === 0) return empty;
  const rosterRows = entries as RosterRow[];

  // Pass 14.5: real, round-scoped points + fixture/lock display state --
  // the SAME derivation `queryMatchupSquads` uses for the Matchup page
  // (`getRoundPlayerState`), so Home's Starting XI and the Team page never
  // show a second, divergent ("always 0 points, no lock indicator")
  // truth. Empty maps (honest zero/no-fixture) whenever no round has
  // opened for this league yet.
  const playerIds = rosterRows.map((r) => r.player_id);
  const acquiredAtByPlayerId = new Map(rosterRows.map((r) => [r.player_id, r.acquired_at]));
  const [{ pointsByPlayerId, preAcquisitionPointsByPlayerId, fixtureByPlayerId }, { data: slots }] = await Promise.all([
    currentRound
    ? getRoundPlayerState(
        supabase,
        playerIds,
        { startsAt: new Date(currentRound.starts_at), endsAt: new Date(currentRound.ends_at) } satisfies RoundWindow,
        acquiredAtByPlayerId, true, scoringVersion(currentRound.scoring_rule_version)
      )
    : {
        pointsByPlayerId: new Map<string, number>(),
        preAcquisitionPointsByPlayerId: new Map<string, number>(),
        fixtureByPlayerId: new Map<string, Player["fixture"]>(),
      },
    currentRound ? supabase
    .from("lineup_slots")
    .select("roster_entry_id, starter, locked_at")
    .eq("fantasy_round_id", currentRound.id)
    .in("roster_entry_id", rosterRows.filter((r) => r.players).map((r) => r.id)) : Promise.resolve({ data: [] }),
  ]);

  const playerByRosterEntryId = new Map<string, Player>();
  for (const entry of rosterRows) {
    const player = toPlayer(entry, pointsByPlayerId, fixtureByPlayerId, preAcquisitionPointsByPlayerId);
    if (player) {
      if (currentRound) player.scoringRuleVersion = scoringVersion(currentRound.scoring_rule_version);
      playerByRosterEntryId.set(entry.id, player);
    }
  }

  if (!currentRound) {
    return { formation: "—", starters: [], bench: Array.from(playerByRosterEntryId.values()) };
  }


  const slotByRosterEntryId = new Map((slots ?? []).map((s) => [s.roster_entry_id, s]));
  const now = new Date();

  const starterEntries: Array<{ rosterEntryId: string; player: Player; locked: boolean }> = [];
  const bench: Player[] = [];

  for (const [rosterEntryId, rawPlayer] of playerByRosterEntryId) {
    const slot = slotByRosterEntryId.get(rosterEntryId);
    const locked = isLocked(slot?.locked_at ? new Date(slot.locked_at) : null, now);
    // Same state-rewrite `buildMatchupTeamSquad` (data-access/matchups.ts)
    // applies: a lock is a LINEUP concept, not a real-world match state,
    // so it only overrides a still-"upcoming" raw fixture state -- once
    // the real fixture is already "live"/"final" that's strictly more
    // informative and is never suppressed. Applies to BENCH players too
    // (brief §Phase 1: "locked bench players must visibly show that they
    // cannot be moved") -- `lineup_slots` rows exist for bench entries as
    // well, each with their own real `locked_at`.
    const shouldShowLocked = locked && rawPlayer.fixture?.state === "upcoming";
    const player = shouldShowLocked ? { ...rawPlayer, fixture: { ...rawPlayer.fixture!, state: "locked" as const } } : rawPlayer;

    if (slot?.starter) {
      starterEntries.push({ rosterEntryId, player, locked });
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

  const supabase = await resolveClient();

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

/** Batched, RLS-scoped composition choices, fetched only when a trade opens. */
export async function getLeagueRosterPlayersByTeam(leagueId: string): Promise<Record<string, RosterPlayerOption[]>> {
  if (!isSupabaseConfigured()) return {};
  const supabase = await resolveClient();
  return queryLeagueRosterPlayersByTeam(supabase, leagueId);
}

export async function queryLeagueRosterPlayersByTeam(supabase: SupabaseClient<Database>, leagueId: string): Promise<Record<string, RosterPlayerOption[]>> {
  const result: Record<string, RosterPlayerOption[]> = {};
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from("roster_entries")
      .select("fantasy_team_id, players(id, name, position)")
      .eq("league_id", leagueId).eq("status", "active")
      .order("id", { ascending: true }).range(from, from + 999);
    if (error) throw new Error("Couldn't load trade rosters.");
    for (const row of data ?? []) {
      if (!row.players) continue;
      (result[row.fantasy_team_id] ??= []).push({ ...row.players, position: row.players.position as PlayerPosition });
    }
    if (!data || data.length < 1000) break;
  }
  return result;
}
