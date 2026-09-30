import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { findNextEligibleWindow, getEligibleFixtureIds } from "./round-eligibility.ts";
import { createRoundLineupSlots } from "./lineup.ts";
import { generateRoundRobinCycle, pairingsForSeasonRound } from "../../domain/fantasy/schedule.ts";
import { determineFixtureSyncCadence } from "../../domain/football/sync-cadence.ts";
import { SCORING_RULE_VERSION } from "../../domain/fantasy/scoring.ts";
import type { RoundWindow } from "../../domain/fantasy/round-calendar.ts";
import type { FixtureStatus } from "../../domain/football/types.ts";
import type { Database } from "../supabase/database.types.ts";

export type OpenRoundResult =
  | { ok: true; roundId: string; roundNumber: number; window: RoundWindow }
  | { ok: false; error: "PREVIOUS_ROUND_STILL_OPEN" | "NO_ELIGIBLE_FIXTURES_FOUND" | "NOT_ENOUGH_TEAMS" };

/**
 * Opens Eleven fantasy round N+1 for a league: finds the next eligible
 * (non-blank) calendar window, generates that round's H2H pairings
 * (round 1 generates and effectively "founds" the round-robin cycle every
 * later round reuses), creates every team's lineup_slots for the round,
 * and records ROUND_OPENED. Rounds are opened one at a time — see
 * docs/game-rules.md "Round generation."
 */
export async function openNextRound(
  admin: SupabaseClient<Database>,
  leagueId: string,
  now: Date
): Promise<OpenRoundResult> {
  const { data: previousRound } = await admin
    .from("fantasy_rounds")
    .select("id, number, starts_at, ends_at, status")
    .eq("league_id", leagueId)
    .order("number", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (previousRound && previousRound.status !== "completed") {
    return { ok: false, error: "PREVIOUS_ROUND_STILL_OPEN" };
  }

  const previousWindow: RoundWindow | null = previousRound
    ? { startsAt: new Date(previousRound.starts_at), endsAt: new Date(previousRound.ends_at) }
    : null;

  const window = await findNextEligibleWindow(admin, previousWindow, now);
  if (!window) return { ok: false, error: "NO_ELIGIBLE_FIXTURES_FOUND" };

  const { data: teams } = await admin
    .from("fantasy_teams")
    .select("id, draft_orders(position)")
    .eq("league_id", leagueId);

  if (!teams || teams.length < 2) return { ok: false, error: "NOT_ENOUGH_TEAMS" };

  // Stable team order for schedule generation: by draft position when a
  // draft exists (it always will, by the time a league can open round 1
  // — see league-lifecycle ACTIVE), falling back to team id otherwise.
  const orderedTeamIds = [...teams]
    .sort((a, b) => {
      const posA = (a.draft_orders as { position: number }[] | null)?.[0]?.position ?? 0;
      const posB = (b.draft_orders as { position: number }[] | null)?.[0]?.position ?? 0;
      return posA - posB || a.id.localeCompare(b.id);
    })
    .map((t) => t.id);

  const roundNumber = (previousRound?.number ?? 0) + 1;

  const { data: roundRow, error: roundError } = await admin
    .from("fantasy_rounds")
    .insert({
      league_id: leagueId,
      number: roundNumber,
      starts_at: window.startsAt.toISOString(),
      ends_at: window.endsAt.toISOString(),
      status: "in_progress",
    })
    .select("id")
    .single();

  if (roundError || !roundRow) throw new Error(`Failed to create fantasy_rounds row: ${roundError?.message}`);

  const cycle = generateRoundRobinCycle(orderedTeamIds);
  const pairings = pairingsForSeasonRound(cycle, roundNumber);

  if (pairings.length > 0) {
    await admin.from("matchups").insert(
      pairings.map((p) => ({
        league_id: leagueId,
        fantasy_round_id: roundRow.id,
        home_fantasy_team_id: p.homeTeamId,
        away_fantasy_team_id: p.awayTeamId,
        status: "scheduled",
      }))
    );
  }

  for (const teamId of orderedTeamIds) {
    await createRoundLineupSlots(admin, teamId, roundRow.id, window, previousRound?.id ?? null);
  }

  await admin.from("domain_events").insert({
    event_type: "ROUND_OPENED",
    league_id: leagueId,
    entity_type: "fantasy_round",
    entity_id: roundRow.id,
    payload: { roundNumber, startsAt: window.startsAt.toISOString(), endsAt: window.endsAt.toISOString(), matchupCount: pairings.length },
  });

  return { ok: true, roundId: roundRow.id, roundNumber, window };
}

interface StarterRow {
  fantasyTeamId: string;
  playerId: string;
}

/**
 * Recomputes and persists `matchup_scores.live_points` for every matchup
 * in a round, from current canonical `fantasy_player_scores` — never
 * incremented, always recomputed (Pass 9's rule, extended here). Bench
 * points never count; a player's score is the SUM of every eligible
 * fixture they played within the round's window (the double-match-round
 * feature — docs/game-rules.md "Multi-fixture players").
 */
export async function refreshMatchupScores(admin: SupabaseClient<Database>, roundId: string): Promise<void> {
  const { data: round } = await admin.from("fantasy_rounds").select("starts_at, ends_at").eq("id", roundId).maybeSingle();
  if (!round) return;

  const window: RoundWindow = { startsAt: new Date(round.starts_at), endsAt: new Date(round.ends_at) };
  const fixtureIds = await getEligibleFixtureIds(admin, window);

  const { data: matchups } = await admin
    .from("matchups")
    .select("id, home_fantasy_team_id, away_fantasy_team_id")
    .eq("fantasy_round_id", roundId);
  if (!matchups || matchups.length === 0) return;

  const teamIds = Array.from(new Set(matchups.flatMap((m) => [m.home_fantasy_team_id, m.away_fantasy_team_id])));

  const { data: starterSlots } = await admin
    .from("lineup_slots")
    .select("roster_entries!inner(fantasy_team_id, player_id)")
    .eq("fantasy_round_id", roundId)
    .eq("starter", true)
    .in("roster_entries.fantasy_team_id", teamIds);

  const starters: StarterRow[] = (starterSlots ?? []).map((s) => {
    const re = s.roster_entries as unknown as { fantasy_team_id: string; player_id: string };
    return { fantasyTeamId: re.fantasy_team_id, playerId: re.player_id };
  });

  const playerIds = Array.from(new Set(starters.map((s) => s.playerId)));
  const pointsByPlayerId = new Map<string, number>();
  if (playerIds.length > 0 && fixtureIds.length > 0) {
    const { data: scores } = await admin
      .from("fantasy_player_scores")
      .select("player_id, points")
      .eq("scoring_rule_version", SCORING_RULE_VERSION)
      .in("player_id", playerIds)
      .in("fixture_id", fixtureIds);
    for (const row of scores ?? []) {
      pointsByPlayerId.set(row.player_id, (pointsByPlayerId.get(row.player_id) ?? 0) + row.points);
    }
  }

  const pointsByTeamId = new Map<string, number>();
  for (const starter of starters) {
    const playerPoints = pointsByPlayerId.get(starter.playerId) ?? 0;
    pointsByTeamId.set(starter.fantasyTeamId, (pointsByTeamId.get(starter.fantasyTeamId) ?? 0) + playerPoints);
  }

  const rows = teamIds.map((teamId) => ({
    fantasy_team_id: teamId,
    matchup_id: matchups.find((m) => m.home_fantasy_team_id === teamId || m.away_fantasy_team_id === teamId)!.id,
    live_points: Math.round((pointsByTeamId.get(teamId) ?? 0) * 100) / 100,
  }));

  await admin.from("matchup_scores").upsert(rows, { onConflict: "matchup_id,fantasy_team_id" });

  // Matchup state: "live" iff at least one of this round's fixtures is
  // currently live/ht, "final" is set separately by finalizeRoundIfReady
  // (a round finalizes as a whole, never one matchup at a time — see
  // docs/game-rules.md "H2H schedule & scoring").
  const { count: liveCount } = await admin
    .from("fixtures")
    .select("*", { count: "exact", head: true })
    .in("id", fixtureIds)
    .in("status", ["live", "ht"]);

  await admin
    .from("matchups")
    .update({ status: liveCount && liveCount > 0 ? "live" : "scheduled" })
    .eq("fantasy_round_id", roundId)
    .neq("status", "final");
}

export type FinalizeRoundResult = { finalized: false } | { finalized: true; roundId: string };

/**
 * Conservative round finalization: only when EVERY fixture in the
 * round's window has reached a terminal state (`final` and past Pass 9's
 * post-FT reconciliation window, or `postponed`) — a single
 * delayed/reconciling fixture holds the whole round open. Reuses Pass
 * 9's `determineFixtureSyncCadence` "settled" reason as the exact
 * definition of "reconciliation has closed for this fixture," so both
 * systems agree on when a fixture's stats are truly final.
 */
export async function finalizeRoundIfReady(
  admin: SupabaseClient<Database>,
  roundId: string,
  now: Date
): Promise<FinalizeRoundResult> {
  const { data: round } = await admin
    .from("fantasy_rounds")
    .select("starts_at, ends_at, status, league_id, number")
    .eq("id", roundId)
    .maybeSingle();
  if (!round || round.status === "completed") return { finalized: false };

  const window: RoundWindow = { startsAt: new Date(round.starts_at), endsAt: new Date(round.ends_at) };
  const { data: fixtures } = await admin
    .from("fixtures")
    .select("status, kickoff_at")
    .gte("kickoff_at", window.startsAt.toISOString())
    .lt("kickoff_at", window.endsAt.toISOString());

  const allSettled = (fixtures ?? []).every((f) => {
    if (f.status === "postponed") return true;
    if (f.status !== "final") return false;
    return determineFixtureSyncCadence({ status: f.status as FixtureStatus, kickoffAt: f.kickoff_at }, now).reason === "settled";
  });

  if (!allSettled) return { finalized: false };

  await refreshMatchupScores(admin, roundId);

  const { data: matchups } = await admin.from("matchups").select("id").eq("fantasy_round_id", roundId);
  for (const matchup of matchups ?? []) {
    const { data: scores } = await admin.from("matchup_scores").select("id, live_points").eq("matchup_id", matchup.id);
    for (const score of scores ?? []) {
      await admin.from("matchup_scores").update({ final_points: score.live_points }).eq("id", score.id);
    }
    await admin.from("domain_events").insert({
      event_type: "MATCHUP_FINALIZED",
      league_id: round.league_id,
      entity_type: "matchup",
      entity_id: matchup.id,
      payload: {},
    });
  }

  await admin.from("matchups").update({ status: "final" }).eq("fantasy_round_id", roundId);
  await admin.from("fantasy_rounds").update({ status: "completed" }).eq("id", roundId);

  await admin.from("domain_events").insert({
    event_type: "ROUND_FINALIZED",
    league_id: round.league_id,
    entity_type: "fantasy_round",
    entity_id: roundId,
    payload: { roundNumber: round.number },
  });

  return { finalized: true, roundId };
}
