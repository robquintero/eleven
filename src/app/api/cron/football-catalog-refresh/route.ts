import { NextResponse } from "next/server";
import { createAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/admin";
import { bootstrapInternationalCompetitions } from "@/lib/football-ingestion/bootstrap-international";
import { recordSyncEvent } from "@/lib/football-ingestion/record-sync-event";

/**
 * Pass 14 go-live Gate 3: the automatic job entry point that makes
 * international competitions NOT depend on a human manually running the
 * `international-bootstrap` CLI command during every international
 * break. `vercel.json` schedules this once a day.
 *
 * Reuses the exact same `bootstrapInternationalCompetitions` the one-time
 * manual Gate 2 bootstrap used (idempotent by construction — see its own
 * doc comment) with `includeFixtureStats: false`: this job's only real
 * purpose is DISCOVERY -- catching a newly-scheduled fixture, a
 * rescheduled postponement, a season rollover, or (the specific recurring
 * need named in the brief) a new national-team call-up between
 * international windows. Once a fixture exists in `fixtures` at all, the
 * existing per-minute `football-live-tick` cron already finds and syncs
 * its live status/stats on its own correctly-throttled cadence (Gate 1) —
 * this job re-fetching every already-final fixture's stats too, every
 * single day forever, would grow unbounded as a season accumulates
 * completed matches, which is exactly the "redo work the per-minute tick
 * already owns" waste Gate 1 fixed for the live path.
 *
 * Same fail-closed auth as football-live-tick — refuses to run at all
 * unless CRON_SECRET is configured and the caller's Authorization header
 * matches it.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET is not configured — refusing to run." }, { status: 503 });
  }

  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isSupabaseAdminConfigured()) {
    return NextResponse.json({ error: "Supabase admin client is not configured." }, { status: 503 });
  }

  const admin = createAdminClient();
  const result = await bootstrapInternationalCompetitions(admin, { includeFixtureStats: false });

  for (const step of result.steps) {
    await recordSyncEvent(admin, step);
  }

  return NextResponse.json({
    stepsRun: result.steps.length,
    requestsUsed: result.requestsUsed,
    stoppedForQuota: result.stoppedForQuota,
  });
}
