import { NextResponse } from "next/server";
import { createAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/admin";
import { runLiveSyncTick } from "@/lib/football-ingestion/live-sync";

/**
 * The production-safe job entry point for Eleven's centralized live-sync
 * foundation (brief §Phase 6) — an HTTP wrapper around the same
 * `runLiveSyncTick` the `npm run football:sync -- live-tick` CLI command
 * calls, so a deployed cron and a developer's manual run share identical
 * behavior.
 *
 * NOT wired to anything yet. Existing does not mean scheduled: no
 * `vercel.json` `crons` entry points at this route, so nothing calls it
 * automatically after deployment — see docs/football-data-system.md
 * "Live sync — activating the cron" for the exact remaining steps (adding
 * a crons entry + setting CRON_SECRET), which this pass deliberately
 * documents rather than performs (brief: "do not silently create
 * expensive polling").
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

  const result = await runLiveSyncTick(createAdminClient());
  return NextResponse.json(result);
}
