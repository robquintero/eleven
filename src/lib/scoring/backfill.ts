import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
// Relative imports, not "@/..." aliases: this module is run directly via
// `node --experimental-strip-types` from a CLI entry point, which does not
// resolve TypeScript path aliases for VALUE imports (only tsc/webpack/Next.js
// do) — see docs/football-data-system.md and the same pattern throughout
// src/lib/football-ingestion/.
import { calculateFantasyScore, SCORING_RULE_VERSION } from "../../domain/fantasy/scoring.ts";
import { isEligibleFixtureKickoff, isScoringEligibleCompetitionCode } from "../football-ingestion/competition-eligibility.ts";
import type { PlayerPosition } from "../../domain/football/types.ts";
import type { Database } from "../supabase/database.types.ts";

export interface BackfillResult {
  scoringRuleVersion: string;
  eligiblePerformances: number;
  scored: number;
  skipped: number;
  failed: number;
  byPosition: Record<string, number>;
  byCompetition: Record<string, number>;
  errors: string[];
}

/**
 * Calculates and upserts `fantasy_player_scores` for every eligible
 * stored performance — no provider request, no current-clock dependency,
 * no UI dependency (brief §Phase 3/4). "Eligible" falls out of the query
 * itself rather than a separate filter list:
 *
 *   - `fixtures.season = 2026` excludes every 2023 validation fixture —
 *     they were never given a 2026 season value (see
 *     docs/football-data-system.md "Season resolution").
 *   - `fixtures.status = 'final'` excludes scheduled/live/postponed
 *     fixtures — never score an incomplete match.
 *   - Qualifying-round UCL/UEL fixtures were never written to `fixtures`
 *     at all (ingested with `--exclude-qualifying`), so they can't appear
 *     here regardless of season/status.
 *   - Every row in `player_match_stats` already belongs to a Big Five
 *     player by construction — non-Big-Five opponents were never given a
 *     `players` row in the first place (see docs/football-data-system.md
 *     "Non-Big-Five opponent clubs").
 *   - (Pass 14) a fixture's own competition must be scoring-eligible
 *     (`competition-eligibility.ts`) — explicit, scoring-engine-level
 *     defense in depth, not just "ineligible competitions are never
 *     ingested." This is what makes "international friendlies do not
 *     score" hold unconditionally rather than only as long as ingestion
 *     stays disciplined.
 *
 * Always recomputes and upserts the full score from current canonical
 * raw stats — never increments. Running this twice on unchanged data
 * produces byte-identical rows both times (see scoring.test.ts's
 * determinism test for the pure-function half of that guarantee).
 *
 * `options.fixtureIds`, when given, bypasses the season/status filter and
 * recomputes exactly those fixtures regardless of status — this is what
 * live sync (Phase 6) uses to refresh a handful of currently-live or
 * just-finished fixtures' scores after a stats sync, without re-scanning
 * the entire season. Deliberately still the SAME function: "recompute
 * from current canonical raw stats" is one behavior whether it's applied
 * to 11,000 historical rows or 22 rows from one live match.
 */
export async function backfillScores(
  admin: SupabaseClient<Database>,
  options: { season?: number; fixtureIds?: string[] } = {}
): Promise<BackfillResult> {
  const season = options.season ?? 2026;
  const errors: string[] = [];
  const byPosition: Record<string, number> = {};
  const byCompetition: Record<string, number> = {};
  let scored = 0;
  let skipped = 0;
  let failed = 0;

  const fixturesQuery = admin
    .from("fixtures")
    .select("id, home_club_id, away_club_id, home_score, away_score, competition_id, kickoff_at");
  const { data: fixtures, error: fixturesError } = await (options.fixtureIds
    ? fixturesQuery.in("id", options.fixtureIds)
    : fixturesQuery.eq("season", season).eq("status", "final"));

  if (fixturesError) {
    return {
      scoringRuleVersion: SCORING_RULE_VERSION,
      eligiblePerformances: 0,
      scored: 0,
      skipped: 0,
      failed: 1,
      byPosition,
      byCompetition,
      errors: [`Failed to load fixtures: ${fixturesError.message}`],
    };
  }
  const { data: comps } = await admin.from("competitions").select("id, code");
  const compCodeById = new Map((comps ?? []).map((c) => [c.id, c.code]));

  // Pass 14: explicit, scoring-engine-level allowlist check — defense in
  // depth on top of "ineligible competitions are never ingested in the
  // first place." Neither this function nor round-aggregation
  // (round-eligibility.ts's getEligibleFixtureIds) otherwise has any
  // competition filter at all, so without this check a fixture that
  // somehow entered `fixtures` under a non-allowlisted competition (e.g.
  // a friendly, manually inserted or a future ingestion bug) would still
  // score and still count toward a fantasy round — exactly what the
  // brief's "international friendlies do not score" requires to hold
  // unconditionally, not just "as long as ingestion stays disciplined."
  //
  // Pass 14 go-live product-scope correction: an international fixture
  // must ALSO kick off at or after INTERNATIONAL_SCORING_EPOCH (the real
  // first UEFA Nations League fixture after the real 2026 World Cup
  // final) — Eleven's international scoring HISTORY starts there, not at
  // the start of whatever historical fixture metadata a competition's
  // season happens to include. Older international fixture metadata is
  // fine to keep ingested for catalog/schedule purposes; this is the one
  // authoritative point that decides whether it may ever be SCORED.
  // isEligibleFixtureKickoff is a no-op for Big Five/UEFA codes.
  const eligibleFixtures = (fixtures ?? []).filter((f) => {
    const code = compCodeById.get(f.competition_id);
    const eligible =
      code !== undefined && isScoringEligibleCompetitionCode(code) && isEligibleFixtureKickoff(code, new Date(f.kickoff_at));
    // Not counted in `skipped` here (the per-stat-row loop below already
    // counts and reports each affected player_match_stats row once the
    // fixture is excluded from `fixtureById`) -- this message exists
    // purely so a non-eligible fixture's PRESENCE is diagnosable without
    // having to cross-reference every row it affected individually.
    if (!eligible) errors.push(`Excluding fixture ${f.id}: competition "${code ?? f.competition_id}" is not scoring-eligible (or precedes the international scoring epoch).`);
    return eligible;
  });
  const fixtureById = new Map(eligibleFixtures.map((f) => [f.id, f]));

  const fixtureIds = Array.from(fixtureById.keys());
  if (fixtureIds.length === 0) {
    return { scoringRuleVersion: SCORING_RULE_VERSION, eligiblePerformances: 0, scored: 0, skipped: 0, failed: 0, byPosition, byCompetition, errors };
  }

  // player_match_stats can exceed PostgREST's default 1000-row page —
  // page through it explicitly rather than trusting a single request.
  let statsRows: Array<{
    player_id: string;
    fixture_id: string;
    minutes: number;
    goals: number;
    assists: number;
    shots_on_target: number;
    chances_created: number;
    tackles: number;
    interceptions: number;
    blocks: number;
    saves: number;
    yellow_cards: number;
    red_cards: number;
  }> = [];
  {
    let from = 0;
    for (;;) {
      const { data, error } = await admin
        .from("player_match_stats")
        .select(
          "player_id, fixture_id, minutes, goals, assists, shots_on_target, chances_created, tackles, interceptions, blocks, saves, yellow_cards, red_cards"
        )
        .in("fixture_id", fixtureIds)
        .range(from, from + 999);
      if (error) {
        errors.push(`Failed to load player_match_stats page at offset ${from}: ${error.message}`);
        failed += 1;
        break;
      }
      statsRows = statsRows.concat(data);
      if (data.length < 1000) break;
      from += 1000;
    }
  }

  // Fetch every player rather than filtering by `.in("id", chunk)`: a
  // chunk of even 500 UUIDs produces a >19KB request URL, which exceeds
  // Node undici's 16KB header limit and fails the whole request (found
  // live while first running this backfill — see the
  // HeadersOverflowError this comment replaces). The players table is a
  // few thousand rows total (Big Five + UEFA-only-fixture universe), so
  // one unfiltered, paginated read is both simpler and immune to the
  // limit regardless of how many distinct players this backfill touches.
  const playerById = new Map<string, { position: PlayerPosition; club_id: string }>();
  {
    let from = 0;
    for (;;) {
      const { data, error } = await admin.from("players").select("id, position, club_id").range(from, from + 999);
      if (error) {
        errors.push(`Failed to load players page at offset ${from}: ${error.message}`);
        failed += 1;
        break;
      }
      for (const p of data) playerById.set(p.id, { position: p.position as PlayerPosition, club_id: p.club_id });
      if (data.length < 1000) break;
      from += 1000;
    }
  }

  // Pass 14: every national-team id a player could ALSO be playing a
  // fixture as, in addition to their own club_id -- without this, a
  // player's international clean-sheet credit (below) silently never
  // applies, since their permanent club_id never equals either side of an
  // international fixture. Same unfiltered-paginated-read reasoning as
  // the players fetch above (this table is bounded by squad sizes, never
  // large enough to need per-player chunking).
  const nationalTeamIdsByPlayerId = new Map<string, string[]>();
  {
    let from = 0;
    for (;;) {
      const { data, error } = await admin.from("player_national_teams").select("player_id, national_team_club_id").range(from, from + 999);
      if (error) {
        errors.push(`Failed to load player_national_teams page at offset ${from}: ${error.message}`);
        failed += 1;
        break;
      }
      for (const row of data) {
        const list = nationalTeamIdsByPlayerId.get(row.player_id);
        if (list) list.push(row.national_team_club_id);
        else nationalTeamIdsByPlayerId.set(row.player_id, [row.national_team_club_id]);
      }
      if (data.length < 1000) break;
      from += 1000;
    }
  }

  const upsertRows: Array<{
    player_id: string;
    fixture_id: string;
    fantasy_round_id: null;
    points: number;
    breakdown: Record<string, number>;
    scoring_rule_version: string;
  }> = [];

  for (const row of statsRows) {
    const player = playerById.get(row.player_id);
    const fixture = fixtureById.get(row.fixture_id);
    if (!player || !fixture) {
      errors.push(`Skipping player_match_stats row (player=${row.player_id}, fixture=${row.fixture_id}): missing player or fixture record.`);
      skipped += 1;
      continue;
    }

    let concededByOwnClub: number | null = null;
    if (fixture.home_score !== null && fixture.away_score !== null) {
      // Pass 14: the player's own club OR any national team they're
      // associated with — a club_id-only check would always miss an
      // international fixture (neither side is ever the player's
      // permanent club).
      const teamIds = nationalTeamIdsByPlayerId.get(row.player_id) ?? [];
      if (player.club_id === fixture.home_club_id || teamIds.includes(fixture.home_club_id)) {
        concededByOwnClub = fixture.away_score;
      } else if (player.club_id === fixture.away_club_id || teamIds.includes(fixture.away_club_id)) {
        concededByOwnClub = fixture.home_score;
      }
      // else: neither the player's current club nor any known national
      // team matches either side of this historical fixture — most likely
      // a transfer since this match was played (club case) or a squad
      // association not yet/no-longer recorded (international case).
      // Never guess which side they were actually on; leave
      // concededByOwnClub null (no clean-sheet credit for this row) — see
      // docs/scoring-model.md "Known limitations."
    }

    const breakdown = calculateFantasyScore({
      position: player.position,
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

    upsertRows.push({
      player_id: row.player_id,
      fixture_id: row.fixture_id,
      fantasy_round_id: null,
      points: breakdown.total,
      breakdown: breakdown.components,
      scoring_rule_version: breakdown.scoringRuleVersion,
    });

    byPosition[player.position] = (byPosition[player.position] ?? 0) + 1;
    const compCode = compCodeById.get(fixture.competition_id) ?? "UNKNOWN";
    byCompetition[compCode] = (byCompetition[compCode] ?? 0) + 1;
  }

  for (let i = 0; i < upsertRows.length; i += 500) {
    const chunk = upsertRows.slice(i, i + 500);
    const { error } = await admin
      .from("fantasy_player_scores")
      .upsert(chunk, { onConflict: "player_id,fixture_id,scoring_rule_version" });
    if (error) {
      errors.push(`Failed to upsert scores batch at offset ${i}: ${error.message}`);
      failed += chunk.length;
    } else {
      scored += chunk.length;
    }
  }

  return {
    scoringRuleVersion: SCORING_RULE_VERSION,
    eligiblePerformances: statsRows.length,
    scored,
    skipped,
    failed,
    byPosition,
    byCompetition,
    errors,
  };
}
