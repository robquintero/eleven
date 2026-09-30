import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { determineFixtureSyncCadence } from "../../domain/football/sync-cadence.ts";
import type { FixtureStatus } from "../../domain/football/types.ts";
import { syncFixtures } from "./sync-fixtures.ts";
import { syncFixtureStats } from "./sync-fixture-stats.ts";
import { resolveCompetition } from "./resolve-competition.ts";
import { recordSyncEvent } from "./record-sync-event.ts";
import { shouldStopForQuota } from "./quota.ts";
import { PROVIDER } from "./identity.ts";
import { backfillScores } from "../scoring/backfill.ts";
import type { Database } from "../supabase/database.types.ts";

export interface LiveSyncTickResult {
  now: string;
  fixturesConsidered: number;
  fixturesNeedingSync: number;
  competitionsTouched: string[];
  fixtureStatsSynced: number;
  scoresRecomputed: number;
  requestsUsed: number;
  stoppedForQuota: boolean;
  errors: string[];
}

/**
 * ONE bounded pass of Eleven's centralized live-sync foundation (brief
 * §Phase 6). Manually invocable (`npm run football:sync -- live-tick`) and
 * safe to invoke as often as a future cron chooses — this function does not
 * loop or sleep internally; "every 10 minutes" is entirely a property of
 * how often something calls this, never of code in here (see
 * `sync-cadence.ts`'s module doc comment).
 *
 * Deliberately NOT "poll every competition every tick" (brief: "do NOT
 * blindly poll every competition every 10 min 24/7"). The provider-request
 * cost of one tick scales with how many STORED fixtures are actually near
 * kickoff, live, or recently final — competitions with nothing happening
 * today cost zero requests. Steps:
 *
 *   1. Read every stored fixture that isn't provably settled forever
 *      (scheduled, live/ht, or final within the last 24h) across every
 *      Big Five + UEFA competition.
 *   2. Run each through `determineFixtureSyncCadence(fixture, now)` — pure,
 *      clock-injected (brief §Phase 5) — to decide which actually need
 *      attention right now.
 *   3. For each DISTINCT competition with at least one such fixture, one
 *      `syncFixtures` call (date-bounded to today) refreshes status/score —
 *      this is what catches a scheduled→live or live→final transition.
 *   4. Re-reads just the fixtures that are now live or newly final and
 *      syncs each one's player stats (`syncFixtureStats`) — one request per
 *      fixture, not per competition.
 *   5. Recomputes `fantasy_player_scores` for exactly the fixtures touched
 *      in step 4 via `backfillScores({ fixtureIds })` — never a full
 *      season rescan for a live tick.
 *   6. Records one `domain_events` row via `recordSyncEvent` for
 *      observability (brief §Sync state/observability) — no new table.
 *
 * Stops early and reports `stoppedForQuota: true` if the provider quota
 * reported by any call along the way drops below the safety margin (same
 * `shouldStopForQuota` used by every other sync operation).
 */
export async function runLiveSyncTick(
  admin: SupabaseClient<Database>,
  now: Date = new Date()
): Promise<LiveSyncTickResult> {
  const errors: string[] = [];
  let requestsUsed = 0;
  let stoppedForQuota = false;

  // Paginated explicitly: a full season across 7 competitions comfortably
  // exceeds PostgREST's default 1000-row page (found live while first
  // running this tick — 2,058 candidate fixtures silently truncated to
  // 1,000 without an explicit .range() loop, the same class of bug fixed
  // in backfill.ts's player read).
  type CandidateFixture = {
    id: string;
    status: string;
    kickoff_at: string;
    competition_id: string;
    competitions: { code: string } | null;
  };
  let candidates: CandidateFixture[] = [];
  {
    let from = 0;
    for (;;) {
      const { data, error } = await admin
        .from("fixtures")
        .select("id, status, kickoff_at, competition_id, competitions(code)")
        .in("status", ["scheduled", "live", "ht", "final"])
        .range(from, from + 999);
      if (error) {
        return {
          now: now.toISOString(),
          fixturesConsidered: 0,
          fixturesNeedingSync: 0,
          competitionsTouched: [],
          fixtureStatsSynced: 0,
          scoresRecomputed: 0,
          requestsUsed: 0,
          stoppedForQuota: false,
          errors: [`Failed to load candidate fixtures: ${error.message}`],
        };
      }
      candidates = candidates.concat(data);
      if (data.length < 1000) break;
      from += 1000;
    }
  }

  const needingSync = (candidates ?? []).filter((f) =>
    determineFixtureSyncCadence({ status: f.status as FixtureStatus, kickoffAt: f.kickoff_at }, now).shouldSync
  );

  const competitionCodes = Array.from(
    new Set(needingSync.map((f) => (f.competitions as { code: string } | null)?.code).filter((c): c is string => Boolean(c)))
  );

  const today = now.toISOString().slice(0, 10);

  for (const code of competitionCodes) {
    if (stoppedForQuota) break;
    try {
      const result = await syncFixtures(admin, resolveCompetition(code), { from: today, to: today });
      requestsUsed += result.requestsUsed;
      errors.push(...result.errors);
      if (shouldStopForQuota(result.quota)) stoppedForQuota = true;
    } catch (err) {
      errors.push(`syncFixtures failed for ${code}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Re-read status after the refresh above — a fixture in `needingSync`
  // may have just transitioned (scheduled -> live, or live -> final).
  const needingSyncIds = needingSync.map((f) => f.id);
  let fixtureStatsSynced = 0;
  const touchedFixtureIds: string[] = [];

  if (needingSyncIds.length > 0 && !stoppedForQuota) {
    const { data: refreshed } = await admin
      .from("fixtures")
      .select("id, status")
      .in("id", needingSyncIds)
      .in("status", ["live", "ht", "final"]);

    const fixtureIdsToStatSync = (refreshed ?? []).map((f) => f.id);

    if (fixtureIdsToStatSync.length > 0) {
      const { data: mappings } = await admin
        .from("provider_mappings")
        .select("internal_entity_id, external_id")
        .eq("provider", PROVIDER)
        .eq("internal_entity_type", "fixture")
        .in("internal_entity_id", fixtureIdsToStatSync);

      for (const mapping of mappings ?? []) {
        if (stoppedForQuota) break;
        try {
          const result = await syncFixtureStats(admin, mapping.external_id);
          requestsUsed += result.requestsUsed;
          errors.push(...result.errors);
          if (result.counts.failed === 0) {
            fixtureStatsSynced += 1;
            touchedFixtureIds.push(mapping.internal_entity_id);
          }
          if (shouldStopForQuota(result.quota)) stoppedForQuota = true;
        } catch (err) {
          errors.push(`syncFixtureStats failed for fixture ${mapping.internal_entity_id}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }
  }

  let scoresRecomputed = 0;
  if (touchedFixtureIds.length > 0) {
    const backfillResult = await backfillScores(admin, { fixtureIds: touchedFixtureIds });
    scoresRecomputed = backfillResult.scored;
    errors.push(...backfillResult.errors);
  }

  const result: LiveSyncTickResult = {
    now: now.toISOString(),
    fixturesConsidered: candidates?.length ?? 0,
    fixturesNeedingSync: needingSync.length,
    competitionsTouched: competitionCodes,
    fixtureStatsSynced,
    scoresRecomputed,
    requestsUsed,
    stoppedForQuota,
    errors,
  };

  await recordSyncEvent(admin, {
    operation: "live-sync-tick",
    scope: { competitionsTouched: competitionCodes.join(",") || undefined },
    counts: {
      created: 0,
      updated: fixtureStatsSynced,
      skipped: 0,
      failed: errors.length > 0 ? 1 : 0,
    },
    requestsUsed,
    quota: {},
    errors,
    stoppedForQuota,
  });

  return result;
}
