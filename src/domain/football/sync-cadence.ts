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

/** Brief §Phase 6: "start conservatively... approximately 10-minute refreshes" — the one constant to change when moving toward 5/2/1-minute cadence later. */
const LIVE_INTERVAL_MINUTES = 10;

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
