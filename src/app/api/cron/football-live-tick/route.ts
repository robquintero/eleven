import { NextResponse } from "next/server";
import { createAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/admin";
import { runLiveSyncTick } from "@/lib/football-ingestion/live-sync";
import { progressAllActiveSeasons } from "@/lib/fantasy-engine/season";

/**
 * The production-safe job entry point for Eleven's centralized live-sync
 * foundation (brief §Phase 6) — an HTTP wrapper around the same
 * `runLiveSyncTick` the `npm run football:sync -- live-tick` CLI command
 * calls, so a deployed cron and a developer's manual run share identical
 * behavior.
 *
 * Pass 12D: now scheduled — `vercel.json` at the repo root has a `crons`
 * entry invoking this route every minute. That cadence was not guessed:
 * a live, single-request `npm run football:check` against the real
 * account confirmed a 7,500/day, 300/minute quota, comfortably enough for
 * minute-level live refreshes given this route's own already-proven
 * zero-cost-when-nothing-is-near behavior (see docs/football-data-system.md
 * "Production cron activation" and `src/domain/football/sync-cadence.ts`'s
 * own `LIVE_INTERVAL_MINUTES`). The ONE remaining manual step this pass
 * cannot perform itself is setting the actual `CRON_SECRET` value in the
 * Vercel project's environment variables and deploying — see that same
 * doc section for the exact command. Vercel's own Cron Jobs feature
 * automatically sends `Authorization: Bearer ${CRON_SECRET}` on every
 * invocation once that env var is set, which is exactly what this route
 * already checks below — no second auth path is needed.
 *
 * Fails closed: refuses to run at all unless CRON_SECRET is configured
 * AND the caller's Authorization header matches it — an unauthenticated
 * version of this endpoint would let anyone trigger provider requests
 * against Eleven's quota on demand.
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
  const liveSync = await runLiveSyncTick(admin);
  // Round progression runs AFTER the sync above, so every league's current
  // round sees the just-refreshed fixtures/stats/scores before
  // `progressSeason` (the unmodified Pass 12A engine) decides whether to
  // finalize it, advance to the next round, or complete the season — see
  // `progressAllActiveSeasons`'s own doc comment.
  const seasonProgression = await progressAllActiveSeasons(admin, new Date());
  return NextResponse.json({ liveSync, seasonProgression });
}
