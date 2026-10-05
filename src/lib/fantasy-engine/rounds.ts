import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { findNextEligibleWindow, getEligibleFixtureIds } from "./round-eligibility.ts";
import { createRoundLineupSlots } from "./lineup.ts";
import { generateRoundRobinCycle, pairingsForSeasonRound } from "../../domain/fantasy/schedule.ts";
import { determineFixtureSyncCadence } from "../../domain/football/sync-cadence.ts";
import { SCORING_RULE_VERSION } from "../../domain/fantasy/scoring.ts";
import { computeTotalRounds, DEFAULT_SCHEDULE_CYCLES, type ScheduleCycles } from "../../domain/fantasy/season.ts";
import type { RoundWindow } from "../../domain/fantasy/round-calendar.ts";
import type { FixtureStatus } from "../../domain/football/types.ts";
import type { Database } from "../supabase/database.types.ts";

export type OpenRoundResult =
  | { ok: true; roundId: string; roundNumber: number; window: RoundWindow }
  | { ok: false; error: "PREVIOUS_ROUND_STILL_OPEN" | "NO_ELIGIBLE_FIXTURES_FOUND" | "NOT_ENOUGH_TEAMS" | "SEASON_COMPLETE" };

export interface ActiveSeason {
  id: string;
  seasonNumber: number;
  scheduleCycles: ScheduleCycles;
  totalRounds: number;
}

/**
 * Resolves this league's ACTIVE season, bootstrapping one if none exists
 * yet. Lives here (not in the season-engine layer) because it is only
 * ever called from `openNextRound` itself, as an implementation detail --
 * this is deliberate: ~17 existing call sites across integration tests and
 * `simulate.ts` call `openNextRound` directly, several without ever
 * running a draft, so season creation can never be a separate step that
 * only the draft-completion path triggers.
 *
 * Promotes an existing SETUP row (created by a commissioner's pre-season
 * `set_season_schedule_format` choice) to ACTIVE if one exists; otherwise
 * creates a fresh ACTIVE season with the default schedule (TWICE).
 * `total_rounds` is computed ONCE here, from the real team count at this
 * exact moment, and never recomputed afterward -- this is also the engine
 * side of "no destructive mid-season format changes."
 *
 * Race-safe: the partial unique index `seasons_one_active_per_league`
 * (one row per league with status='ACTIVE') is the actual guard, same
 * pattern as `sign_player`'s unique_violation handling -- a concurrent
 * create attempt converts into a harmless re-fetch of whichever season
 * really won.
 */
export async function resolveOrCreateActiveSeason(
  admin: SupabaseClient<Database>,
  leagueId: string,
  teamCount: number
): Promise<ActiveSeason> {
  const { data: active } = await admin
    .from("seasons")
    .select("id, season_number, schedule_cycles, total_rounds")
    .eq("league_id", leagueId)
    .eq("status", "ACTIVE")
    .maybeSingle();

  if (active && active.total_rounds !== null) {
    return {
      id: active.id,
      seasonNumber: active.season_number,
      scheduleCycles: active.schedule_cycles as ScheduleCycles,
      totalRounds: active.total_rounds,
    };
  }

  if (active) {
    const totalRounds = computeTotalRounds(teamCount, active.schedule_cycles as ScheduleCycles);
    await admin.from("seasons").update({ total_rounds: totalRounds }).eq("id", active.id);
    return { id: active.id, seasonNumber: active.season_number, scheduleCycles: active.schedule_cycles as ScheduleCycles, totalRounds };
  }

  const { data: setup } = await admin
    .from("seasons")
    .select("id, season_number, schedule_cycles")
    .eq("league_id", leagueId)
    .eq("status", "SETUP")
    .order("season_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (setup) {
    const totalRounds = computeTotalRounds(teamCount, setup.schedule_cycles as ScheduleCycles);
    const { error } = await admin
      .from("seasons")
      .update({ status: "ACTIVE", total_rounds: totalRounds, starts_at: new Date().toISOString() })
      .eq("id", setup.id);
    if (error?.code === "23505") return refetchActiveSeason(admin, leagueId);
    return { id: setup.id, seasonNumber: setup.season_number, scheduleCycles: setup.schedule_cycles as ScheduleCycles, totalRounds };
  }

  const { data: maxSeason } = await admin
    .from("seasons")
    .select("season_number")
    .eq("league_id", leagueId)
    .order("season_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  const seasonNumber = (maxSeason?.season_number ?? 0) + 1;
  const totalRounds = computeTotalRounds(teamCount, DEFAULT_SCHEDULE_CYCLES);

  const { data: created, error } = await admin
    .from("seasons")
    .insert({
      league_id: leagueId,
      season_number: seasonNumber,
      status: "ACTIVE",
      schedule_cycles: DEFAULT_SCHEDULE_CYCLES,
      total_rounds: totalRounds,
      starts_at: new Date().toISOString(),
    })
    .select("id, season_number, schedule_cycles, total_rounds")
    .single();

  if (error?.code === "23505") return refetchActiveSeason(admin, leagueId);
  if (error || !created) throw new Error(`Failed to create season for league ${leagueId}: ${error?.message}`);

  return {
    id: created.id,
    seasonNumber: created.season_number,
    scheduleCycles: created.schedule_cycles as ScheduleCycles,
    totalRounds: created.total_rounds!,
  };
}

async function refetchActiveSeason(admin: SupabaseClient<Database>, leagueId: string): Promise<ActiveSeason> {
  const { data: active, error } = await admin
    .from("seasons")
    .select("id, season_number, schedule_cycles, total_rounds")
    .eq("league_id", leagueId)
    .eq("status", "ACTIVE")
    .single();
  if (error || !active) throw new Error(`Expected an active season to exist for league ${leagueId} after a concurrent-create race`);
  return {
    id: active.id,
    seasonNumber: active.season_number,
    scheduleCycles: active.schedule_cycles as ScheduleCycles,
    totalRounds: active.total_rounds!,
  };
}

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
  const { data: teams } = await admin
    .from("fantasy_teams")
    .select("id, draft_orders(position)")
    .eq("league_id", leagueId);

  if (!teams || teams.length < 2) return { ok: false, error: "NOT_ENOUGH_TEAMS" };

  const season = await resolveOrCreateActiveSeason(admin, leagueId, teams.length);

  const { data: previousRound } = await admin
    .from("fantasy_rounds")
    .select("id, number, starts_at, ends_at, status")
    .eq("season_id", season.id)
    .order("number", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (previousRound && previousRound.status !== "completed") {
    return { ok: false, error: "PREVIOUS_ROUND_STILL_OPEN" };
  }

  const roundNumber = (previousRound?.number ?? 0) + 1;
  if (roundNumber > season.totalRounds) return { ok: false, error: "SEASON_COMPLETE" };

  const previousWindow: RoundWindow | null = previousRound
    ? { startsAt: new Date(previousRound.starts_at), endsAt: new Date(previousRound.ends_at) }
    : null;

  const window = await findNextEligibleWindow(admin, previousWindow, now);
  if (!window) return { ok: false, error: "NO_ELIGIBLE_FIXTURES_FOUND" };

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

  const { data: roundRow, error: roundError } = await admin
    .from("fantasy_rounds")
    .insert({
      league_id: leagueId,
      season_id: season.id,
      number: roundNumber,
      starts_at: window.startsAt.toISOString(),
      ends_at: window.endsAt.toISOString(),
      status: "in_progress",
    })
    .select("id")
    .single();

  if (roundError?.code === "23505") {
    // Pass 10.5C.3: two concurrent openers for the same league's next
    // round (e.g. one manager's own pick-timer expiry racing another
    // manager's manual final pick, both triggering `maybeOpenFirstRound`
    // around the same moment) both pass the `previousRound` check above
    // before either INSERT lands, then collide on
    // `fantasy_rounds_season_id_number_key`. This is the SAME outcome as
    // the ordinary `PREVIOUS_ROUND_STILL_OPEN` case -- someone else just
    // opened this round -- not a genuine failure, so it must resolve the
    // same clean, non-throwing way instead of propagating an uncaught
    // exception that `ensureFirstRoundOpened`'s try/catch can only log
    // and swallow (see this pass's own report on why that mattered: a
    // thrown-and-swallowed error here is still a successfully-created
    // round under the hood, but surfacing it as an uncaught exception
    // made it looked like a general-purpose failure rather than this
    // specific, harmless, race).
    return { ok: false, error: "PREVIOUS_ROUND_STILL_OPEN" };
  }
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

/**
 * Self-healing "open round 1 the moment this league's draft is complete"
 * check (Pass 10.5C) — a completed draft with no round yet should never
 * be a permanent, unrecoverable state. Originally this only ran once, as
 * a best-effort side effect of the pick that completed the draft
 * (`src/app/(app)/draft/actions.ts`'s old `maybeOpenFirstRound`, silently
 * swallowing any failure so it could never break the pick's own
 * response) — if that single attempt didn't succeed for any reason
 * (a transient error, `openNextRound` itself returning `{ok:false}`,
 * etc.), nothing ever retried it, leaving every roster stuck bench-only
 * indefinitely (the "all 16 players on the bench" regression). Calling
 * this from the Team page's own read path too means the very next time
 * anyone looks at their squad, it gets a chance to self-heal — without
 * touching `createRoundLineupSlots`/`chooseAutomaticStartingXi` at all,
 * which were never the broken layer. Cheap to call unconditionally: both
 * early-return checks make it a no-op in the overwhelmingly common case
 * (a complete round already exists).
 *
 * Pass 10.5C.3: "a round already exists" used to be treated as proof the
 * ENTIRE round was successfully initialized, which was the real gap in
 * this self-heal's own design — `openNextRound`'s per-team loop isn't
 * transactional, so if it ever failed partway (a genuine write error now
 * surfaces loudly from `createRoundLineupSlots`, see its own comment; a
 * concurrent opener race; any other transient issue), the `fantasy_rounds`
 * row it had already inserted would permanently short-circuit every
 * future self-heal attempt via this same early return, even though one or
 * more teams never actually got their `lineup_slots` rows at all — stuck
 * all-bench forever, with "a round exists" masking the real problem. Now
 * verifies every team's roster actually HAS lineup_slots for round 1
 * specifically (the only round this function is ever responsible for —
 * see `repairIncompleteRoundOne`'s own comment for why checking only
 * round 1 is sufficient) and repairs exactly the teams missing them,
 * using the SAME `createRoundLineupSlots` round 1 already used — never a
 * second auto-lineup implementation, and never touching a team that
 * already has even one lineup_slots row (which would stomp any lineup
 * edits a manager has since made).
 *
 * Pass 12B: a league can now run MORE than one draft over its lifetime
 * (REDRAFT at the start of Season N+1 — `supabase/migrations/
 * 20261003000000_multi_season_lifecycle.sql`), so this can no longer
 * assume "the league's draft" is a single, unambiguous row. It now
 * resolves the draft belonging to the league's CURRENT (latest) season
 * specifically. The league's very first (inaugural) draft predates any
 * season row ever existing (season 1 only comes into being when its
 * first round opens — Pass 12A's own design, unchanged) and so has
 * `season_id = NULL`; that remains the one legacy case handled by
 * leagueId-wide lookups below, and it can only ever apply once per
 * league (every later draft is created by `start_next_season`, which
 * always sets `season_id` explicitly).
 */
export async function ensureFirstRoundOpened(admin: SupabaseClient<Database>, leagueId: string): Promise<void> {
  const { data: latestSeason } = await admin
    .from("seasons")
    .select("id, status")
    .eq("league_id", leagueId)
    .order("season_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!latestSeason) {
    // No season row exists yet at all -- this can only be the league's
    // very first (season-1) draft, created before season 1's own
    // bootstrap (see resolveOrCreateActiveSeason above).
    const { data: draft } = await admin.from("drafts").select("status").eq("league_id", leagueId).is("season_id", null).maybeSingle();
    if (!draft || draft.status !== "completed") return;
    await ensureRoundOneOpenedForSeason(admin, leagueId, null);
    return;
  }

  // A season has fully concluded -- starting the next one is a
  // deliberate, separate commissioner action (start_next_season), never
  // auto-triggered by this self-heal check.
  if (latestSeason.status === "COMPLETED") return;

  // SETUP or ACTIVE: resolve the draft tied to THIS specific season, if
  // any -- a KEEP_ROSTERS season has no draft at all, which is fine: it
  // activates directly via openNextRound below, no draft gate to wait on.
  const { data: draft } = await admin.from("drafts").select("status").eq("season_id", latestSeason.id).maybeSingle();
  if (draft && draft.status !== "completed") return;

  await ensureRoundOneOpenedForSeason(admin, leagueId, latestSeason.id);
}

async function ensureRoundOneOpenedForSeason(
  admin: SupabaseClient<Database>,
  leagueId: string,
  seasonId: string | null
): Promise<void> {
  // Progression beyond round one already establishes initialization. Do
  // not keep scanning historical round one on every Team visit.
  let query = admin.from("fantasy_rounds").select("id, number, starts_at, ends_at").order("number", { ascending: false }).limit(1);
  query = seasonId ? query.eq("season_id", seasonId) : query.eq("league_id", leagueId);
  const { data: existingRound } = await query.maybeSingle();

  if (!existingRound) {
    try {
      const result = await openNextRound(admin, leagueId, new Date());
      if (!result.ok) {
        console.error(`ensureFirstRoundOpened: openNextRound failed for league ${leagueId}: ${result.error}`);
      }
    } catch (err) {
      console.error(`ensureFirstRoundOpened: openNextRound threw for league ${leagueId}`, err);
    }
    return;
  }

  if (existingRound.number !== 1) return;

  try {
    await repairIncompleteRoundOne(admin, leagueId, existingRound.id, {
      startsAt: new Date(existingRound.starts_at),
      endsAt: new Date(existingRound.ends_at),
    });
  } catch (err) {
    console.error(`ensureFirstRoundOpened: repairIncompleteRoundOne threw for league ${leagueId}`, err);
  }
}

/**
 * Finds every team in the league whose active roster has ZERO
 * `lineup_slots` rows for round 1 (meaning `createRoundLineupSlots` never
 * ran for them at all — a prior `openNextRound` attempt that created the
 * round itself but then failed partway through its per-team loop) and
 * initializes exactly those teams' slots, via the SAME
 * `createRoundLineupSlots` round 1 always uses (`previousRoundId: null`,
 * so it gets the normal auto-generated starting XI, not a carried-forward
 * one — correct for round 1 specifically). A team with even one existing
 * lineup_slots row is never touched here, whether or not its count looks
 * complete — once `createRoundLineupSlots` has run for a team, a manager
 * may have already edited that lineup, and this must never overwrite
 * that. Only ever called for round 1 (see `ensureFirstRoundOpened`) — by
 * the time a league has moved on to round 2, round 1 is provably complete
 * already, since `openNextRound`'s own `PREVIOUS_ROUND_STILL_OPEN` guard
 * requires the previous round to already be `completed` before a new one
 * can open at all.
 */
async function repairIncompleteRoundOne(admin: SupabaseClient<Database>, leagueId: string, roundId: string, window: RoundWindow): Promise<void> {
  // A left embed keeps roster entries with NO slots. As before, even one
  // existing slot protects the team's manager-edited lineup from repair.
  // Page the batched read so PostgREST's row cap cannot hide a team.
  const initializedByTeam = new Map<string, boolean>();
  for (let from = 0; ; from += 1000) {
    const { data: entries, error } = await admin
      .from("roster_entries")
      .select("fantasy_team_id, lineup_slots!left(id)")
      .eq("league_id", leagueId)
      .eq("status", "active")
      .eq("lineup_slots.fantasy_round_id", roundId)
      .order("id", { ascending: true })
      .range(from, from + 999);
    if (error) throw new Error(`Failed to check round-one initialization: ${error.message}`);
    for (const entry of entries ?? []) {
      initializedByTeam.set(entry.fantasy_team_id,
        (initializedByTeam.get(entry.fantasy_team_id) ?? false) || entry.lineup_slots.length > 0);
    }
    if (!entries || entries.length < 1000) break;
  }
  for (const [teamId, initialized] of initializedByTeam) {
    if (!initialized) await createRoundLineupSlots(admin, teamId, roundId, window, null);
  }
}

interface StarterRow {
  fantasyTeamId: string;
  playerId: string;
  /** Pass 14.6: when THIS roster_entry (this specific ownership stint) acquired the player -- `roster_entries.acquired_at`, set once at INSERT time (draft/sign/trade), never backfilled. The acquisition-cutoff boundary below. */
  acquiredAt: string;
}

/**
 * Recomputes and persists `matchup_scores.live_points` for every matchup
 * in a round, from current canonical `fantasy_player_scores` — never
 * incremented, always recomputed (Pass 9's rule, extended here). Bench
 * points never count; a player's score is the SUM of every eligible
 * fixture they played within the round's window (the double-match-round
 * feature — docs/game-rules.md "Multi-fixture players").
 *
 * Pass 14.6: "no retroactive point inheritance" — a fixture's points only
 * contribute to THIS roster_entry's team if the player was acquired at or
 * before that fixture's own kickoff. `fantasy_player_scores` itself is
 * never touched (it remains the player's objective, ownership-independent
 * performance record, per docs/scoring-model.md) — the cutoff is applied
 * purely here, at matchup aggregation, the one place that's genuinely
 * league/team-specific. A player's locked/started fixture BEFORE
 * acquisition still correctly contributes 0 to the new owner without
 * needing a second score row or any mutation of the real score.
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
    .select("roster_entries!inner(fantasy_team_id, player_id, acquired_at)")
    .eq("fantasy_round_id", roundId)
    .eq("starter", true)
    .in("roster_entries.fantasy_team_id", teamIds);

  const starters: StarterRow[] = (starterSlots ?? []).map((s) => {
    const re = s.roster_entries as unknown as { fantasy_team_id: string; player_id: string; acquired_at: string };
    return { fantasyTeamId: re.fantasy_team_id, playerId: re.player_id, acquiredAt: re.acquired_at };
  });

  const playerIds = Array.from(new Set(starters.map((s) => s.playerId)));
  // Per-fixture, not pre-summed -- the acquisition cutoff below is
  // evaluated per (starter, fixture), since two different starters could
  // share the same playerId only across different teams, which can't
  // happen (one owner per player per league), but a STARTER'S cutoff is
  // its own roster_entry's `acquired_at`, not a global per-player fact.
  const scoreRowsByPlayerId = new Map<string, Array<{ fixtureId: string; points: number }>>();
  if (playerIds.length > 0 && fixtureIds.length > 0) {
    const { data: scores } = await admin
      .from("fantasy_player_scores")
      .select("player_id, fixture_id, points")
      .eq("scoring_rule_version", SCORING_RULE_VERSION)
      .in("player_id", playerIds)
      .in("fixture_id", fixtureIds);
    for (const row of scores ?? []) {
      const list = scoreRowsByPlayerId.get(row.player_id) ?? [];
      list.push({ fixtureId: row.fixture_id, points: row.points });
      scoreRowsByPlayerId.set(row.player_id, list);
    }
  }

  const kickoffByFixtureId = new Map<string, string>();
  if (fixtureIds.length > 0) {
    const { data: fixtureRows } = await admin.from("fixtures").select("id, kickoff_at").in("id", fixtureIds);
    for (const f of fixtureRows ?? []) kickoffByFixtureId.set(f.id, f.kickoff_at);
  }

  const pointsByTeamId = new Map<string, number>();
  for (const starter of starters) {
    const acquiredAtMs = new Date(starter.acquiredAt).getTime();
    const rows = scoreRowsByPlayerId.get(starter.playerId) ?? [];
    let playerPoints = 0;
    for (const row of rows) {
      const kickoffAt = kickoffByFixtureId.get(row.fixtureId);
      // Acquired at or before kickoff -> counts; acquired after -> the
      // fixture's real points still exist in fantasy_player_scores, they
      // just don't belong to THIS team's matchup total.
      if (kickoffAt && new Date(kickoffAt).getTime() >= acquiredAtMs) playerPoints += row.points;
    }
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
