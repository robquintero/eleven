import type { FixtureStatus } from "@/domain/football/types";

/**
 * Decides whether ONE stored fixture needs a fresh provider sync right now,
 * and how urgently. Pure and deterministic: `now` is always an explicit
 * argument, never read from `Date.now()`/`new Date()` internally — the
 * production call site passes the real clock, tests pass a fixed instant
 * (brief §Phase 5: "game/scoring logic must not depend directly on
 * scattered Date.now()/new Date()").
 *
 * This function makes exactly ONE decision for ONE fixture. It never loops,
 * sleeps, or schedules anything itself — "every 10 minutes while live" is
 * enforced by however often the caller (a cron tick, or a developer running
 * the CLI) invokes this decision, not by anything in here. That's what
 * keeps the interval configurable without a redesign (brief §Phase 6):
 * moving from 10-minute to 1-minute live refreshes is an unrelated
 * scheduling change, not a change to this function.
 */

export type SyncCadenceReason =
  | "too-far-from-kickoff"
  | "approaching-kickoff"
  | "live"
  | "recently-final-reconciliation"
  | "settled";

export interface FixtureSyncCadenceInput {
  status: FixtureStatus;
  kickoffAt: string;
}

export interface FixtureSyncCadenceDecision {
  shouldSync: boolean;
  reason: SyncCadenceReason;
  /** Advisory: how often a fixture in this state wants to be re-checked. Not enforced here — see module doc comment. */
  suggestedIntervalMinutes: number;
}

/** How long before kickoff a scheduled fixture starts getting checked more often, to catch the scheduled→live transition promptly. */
const APPROACHING_KICKOFF_WINDOW_MINUTES = 120;
const APPROACHING_KICKOFF_INTERVAL_MINUTES = 30;

/**
 * Pass 9 (brief §Phase 6) started conservatively at 10 minutes, explicitly
 * flagging this as "the one constant to change when moving toward
 * 5/2/1-minute cadence later." Pass 12D is that moment: a live
 * `npm run football:check` against the real account (docs/
 * football-data-system.md "Production cron activation") confirmed a
 * 7,500/day, 300/minute budget — comfortably enough to run the cron at
 * Vercel Cron's own 1-minute minimum granularity without risk, given
 * `runLiveSyncTick`'s own already-proven zero-cost-when-nothing-is-near
 * behavior and the raised `DEFAULT_QUOTA_SAFETY_MARGIN` circuit breaker
 * (quota.ts). This value is advisory (see this module's own doc comment —
 * the actual cadence enforced is "however often the caller invokes this
 * decision"), but is now kept truthful to match the real cron schedule
 * (`vercel.json`) rather than describing a cadence nothing actually runs.
 */
const LIVE_INTERVAL_MINUTES = 1;

/**
 * Covers both the brief's "+1h post-FT reconciliation" and "overnight final
 * reconciliation" as one combined window, rather than two separately
 * tracked states — Eleven has no `fixtures.reconciled_at` column (no
 * migration needed for this), so "still within N hours of kickoff" is the
 * signal instead of an explicit reconciliation flag.
 */
const POST_FINAL_RECONCILIATION_WINDOW_MINUTES = 24 * 60;
const POST_FINAL_RECONCILIATION_INTERVAL_MINUTES = 60;

export function determineFixtureSyncCadence(
  fixture: FixtureSyncCadenceInput,
  now: Date
): FixtureSyncCadenceDecision {
  const minutesSinceKickoff = (now.getTime() - new Date(fixture.kickoffAt).getTime()) / 60_000;

  if (fixture.status === "live" || fixture.status === "ht") {
    return { shouldSync: true, reason: "live", suggestedIntervalMinutes: LIVE_INTERVAL_MINUTES };
  }

  if (fixture.status === "final") {
    if (minutesSinceKickoff <= POST_FINAL_RECONCILIATION_WINDOW_MINUTES) {
      return {
        shouldSync: true,
        reason: "recently-final-reconciliation",
        suggestedIntervalMinutes: POST_FINAL_RECONCILIATION_INTERVAL_MINUTES,
      };
    }
    return { shouldSync: false, reason: "settled", suggestedIntervalMinutes: Infinity };
  }

  if (fixture.status === "postponed") {
    return { shouldSync: false, reason: "settled", suggestedIntervalMinutes: Infinity };
  }

  // status === "scheduled"
  if (minutesSinceKickoff >= -APPROACHING_KICKOFF_WINDOW_MINUTES) {
    return {
      shouldSync: true,
      reason: "approaching-kickoff",
      suggestedIntervalMinutes: APPROACHING_KICKOFF_INTERVAL_MINUTES,
    };
  }
  return { shouldSync: false, reason: "too-far-from-kickoff", suggestedIntervalMinutes: 24 * 60 };
}

/**
 * Pass 14 go-live Gate 1 finding: `suggestedIntervalMinutes` above was
 * computed but never actually enforced anywhere — every fixture in the
 * "approaching-kickoff" or "recently-final-reconciliation" phase got
 * re-synced on literally every one-minute cron tick for the ENTIRE
 * duration of that phase (up to ~22 hours of redundant per-minute
 * `GET /fixtures/players` calls per finished fixture), which a single
 * real Big Five matchday showed costs 16,000+ provider requests against
 * the 7,500/day budget — over double the daily allowance from one
 * league's one day, before any international load. This is the actual
 * enforcement, applied on top of `determineFixtureSyncCadence`'s
 * decision by the caller (`live-sync.ts`), which also persists
 * `lastSyncedAt` per fixture across ticks (a Vercel cron invocation has
 * no in-memory state to carry an interval across ticks itself).
 *
 * The "live"/"ht" phase's `suggestedIntervalMinutes` (1) is a no-op
 * here by design — live fixtures must still sync every tick; this
 * function only ever makes an already-due decision LESS frequent, never
 * more frequent, so it can safely wrap every phase without a special
 * case for "live" at the call site.
 */
export function isDueForSync(decision: FixtureSyncCadenceDecision, lastSyncedAt: Date | null, now: Date): boolean {
  if (!decision.shouldSync) return false;
  // The live/ht phase's 1-minute "suggested" interval must behave as
  // "always sync," not "at most once per 60.000 seconds" -- the cron
  // itself already only ticks once a minute, so a strict >= comparison
  // here would risk skipping a live fixture on a tick that lands even a
  // few seconds under a minute after the previous one (cron jitter,
  // variable function duration), which is exactly the live-score
  // freshness this fix must never regress.
  if (decision.suggestedIntervalMinutes <= 1) return true;
  if (!lastSyncedAt) return true;
  const minutesSinceLastSync = (now.getTime() - lastSyncedAt.getTime()) / 60_000;
  return minutesSinceLastSync >= decision.suggestedIntervalMinutes;
}
