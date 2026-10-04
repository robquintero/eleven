import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { determineFixtureSyncCadence, isDueForSync } from "../../domain/football/sync-cadence.ts";
import type { FixtureStatus } from "../../domain/football/types.ts";
import { syncFixtures } from "./sync-fixtures.ts";
import { syncFixtureStats } from "./sync-fixture-stats.ts";
import { resolveCompetition } from "./resolve-competition.ts";
import { recordSyncEvent } from "./record-sync-event.ts";
import { shouldStopForQuota } from "./quota.ts";
import { PROVIDER } from "./identity.ts";
import { backfillScores } from "../scoring/backfill.ts";
import { reconcileFantasyStateForFixtures } from "../fantasy-engine/reconciliation.ts";
import type { Database } from "../supabase/database.types.ts";
import type { ProviderQuota } from "../football-providers/types.ts";

export interface LiveSyncTickResult {
  now: string;
  fixturesConsidered: number;
  fixturesNeedingSync: number;
  competitionsTouched: string[];
  fixtureStatsSynced: number;
  scoresRecomputed: number;
  /** Pass 14.1: fantasy rounds (any league) whose locks/scores were reconciled because one of their fixtures just got fresh stats this tick. */
  roundsReconciled: number;
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
  // Gate 1 finding: real quota IS parsed from every provider response
  // (client.ts's parseQuotaHeaders) and used live for the circuit breaker
  // below, but this tick's own recorded domain_events row previously
  // hardcoded `quota: {}` -- the real numbers were never actually
  // observable after the fact from the automatic cron's own history, only
  // from a manual CLI run. Tracked here so the LAST real quota seen this
  // tick (if any provider call was made at all) gets persisted.
  let lastQuota: ProviderQuota = {};

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
    last_live_sync_at: string | null;
    competitions: { code: string } | null;
  };
  let candidates: CandidateFixture[] = [];
  {
    let from = 0;
    for (;;) {
      const { data, error } = await admin
        .from("fixtures")
        .select("id, status, kickoff_at, competition_id, last_live_sync_at, competitions(code)")
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
          roundsReconciled: 0,
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

  // Pass 14 go-live Gate 1 fix: `determineFixtureSyncCadence`'s own
  // `suggestedIntervalMinutes` was never enforced before this -- every
  // fixture within its approaching-kickoff/recently-final window got
  // re-synced on literally every one-minute tick for the window's entire
  // duration (a real Big Five matchday was calculated at 16,000+
  // provider requests/day this way, over double the 7,500/day budget,
  // before any international load). `isDueForSync` applies the already-
  // intended interval on top of the phase decision, using the persisted
  // `last_live_sync_at` column (a cron invocation has no in-memory state
  // to carry an interval across ticks on its own) -- see sync-cadence.ts.
  const decisionByFixtureId = new Map(
    candidates.map((f) => [
      f.id,
      determineFixtureSyncCadence({ status: f.status as FixtureStatus, kickoffAt: f.kickoff_at }, now),
    ])
  );
  const needingSync = candidates.filter((f) =>
    isDueForSync(decisionByFixtureId.get(f.id)!, f.last_live_sync_at ? new Date(f.last_live_sync_at) : null, now)
  );

  const competitionCodes = Array.from(
    new Set(needingSync.map((f) => (f.competitions as { code: string } | null)?.code).filter((c): c is string => Boolean(c)))
  );

  const today = now.toISOString().slice(0, 10);

  // Only the approaching-kickoff phase needs its throttle marked here --
  // live/ht and recently-final fixtures get their own individual
  // `syncFixtureStats` call below, which is what actually refreshes their
  // data and is where their `last_live_sync_at` gets updated instead.
  // Marked ONLY after this competition's own syncFixtures call actually
  // succeeds, so a failed/quota-stopped competition correctly stays due
  // on the very next tick rather than silently going quiet for 30 minutes.
  //
  // Pass 14.7 Phase 9: "actually succeeds" means `result.counts.failed ===
  // 0`, never just "didn't throw" -- `syncFixtures` deliberately swallows
  // its own provider-call failure internally (its own try/catch around
  // `getFixtures`, see sync-fixtures.ts) and returns a normal SyncResult
  // with `counts.failed` incremented rather than throwing, specifically so
  // one bad competition doesn't abort the whole tick's loop. The missing
  // `API_FOOTBALL_KEY` production incident exploited exactly this: the
  // `catch` block below never ran (nothing threw), so every approaching-
  // kickoff fixture in that competition was marked as freshly synced even
  // though the real provider call never happened, silently delaying the
  // next real attempt by a full throttle interval. `counts.failed` is
  // reliable here (unlike `errors`, which also carries benign skip
  // messages for things like UEFA qualifying-round fixtures on an
  // otherwise fully successful sync).
  const approachingFixtureIdsToMark: string[] = [];

  for (const code of competitionCodes) {
    if (stoppedForQuota) break;
    try {
      const result = await syncFixtures(admin, resolveCompetition(code), { from: today, to: today });
      requestsUsed += result.requestsUsed;
      errors.push(...result.errors);
      lastQuota = result.quota;
      if (shouldStopForQuota(result.quota)) stoppedForQuota = true;
      if (result.counts.failed === 0) {
        for (const f of needingSync) {
          if ((f.competitions as { code: string } | null)?.code !== code) continue;
          if (decisionByFixtureId.get(f.id)?.reason === "approaching-kickoff") approachingFixtureIdsToMark.push(f.id);
        }
      }
    } catch (err) {
      errors.push(`syncFixtures failed for ${code}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (approachingFixtureIdsToMark.length > 0) {
    await admin.from("fixtures").update({ last_live_sync_at: now.toISOString() }).in("id", approachingFixtureIdsToMark);
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
          lastQuota = result.quota;
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
  let roundsReconciled = 0;
  if (touchedFixtureIds.length > 0) {
    const backfillResult = await backfillScores(admin, { fixtureIds: touchedFixtureIds });
    scoresRecomputed = backfillResult.scored;
    errors.push(...backfillResult.errors);

    // Marks exactly the fixtures that just got a REAL, successful stats
    // refresh -- live/ht fixtures land here every tick (their interval
    // bypasses the throttle, see isDueForSync), and recently-final
    // fixtures land here at most once per POST_FINAL_RECONCILIATION_INTERVAL_MINUTES,
    // which is the actual fix for the quota overage this Gate 1 finding
    // describes.
    await admin.from("fixtures").update({ last_live_sync_at: now.toISOString() }).in("id", touchedFixtureIds);

    // Pass 14.1: "fixture data changes -> identify affected fixture/
    // player/round, reconcile only affected fantasy state" -- bounded to
    // exactly the fixtures this tick actually refreshed stats for (the
    // same set already used above), never a blind full-league scan.
    // Database work only, no extra provider calls.
    const reconcileResult = await reconcileFantasyStateForFixtures(admin, touchedFixtureIds);
    roundsReconciled = reconcileResult.roundIds.length;
  }

  const result: LiveSyncTickResult = {
    now: now.toISOString(),
    fixturesConsidered: candidates?.length ?? 0,
    fixturesNeedingSync: needingSync.length,
    competitionsTouched: competitionCodes,
    fixtureStatsSynced,
    scoresRecomputed,
    roundsReconciled,
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
    quota: lastQuota,
    errors,
    stoppedForQuota,
  });

  return result;
}
