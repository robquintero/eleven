import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "../supabase/database.types.ts";

export interface SyncHealthReport {
  /** Most recent `domain_events` row per FOOTBALL_SYNC_* operation, in whatever order they last ran. */
  recentSyncEvents: Array<{
    eventType: string;
    createdAt: string;
    payload: Json;
  }>;
  liveFixtures: {
    count: number;
    fixtureIds: string[];
  };
  lastScoringRecomputation: string | null;
  fantasyPlayerScoreCount: number;
}

/**
 * A compact, structured answer to the brief's sync-observability questions
 * (§Sync state/observability) — no dashboard, no new table. Reuses
 * `domain_events` (already the sync-history log — see
 * `record-sync-event.ts`) plus two direct reads of current state. Safe to
 * call anytime; makes zero provider requests.
 */
export async function getSyncHealth(admin: SupabaseClient<Database>): Promise<SyncHealthReport> {
  const { data: events } = await admin
    .from("domain_events")
    .select("event_type, created_at, payload")
    .like("event_type", "FOOTBALL_SYNC_%")
    .order("created_at", { ascending: false })
    .limit(20);

  const { data: live } = await admin.from("fixtures").select("id").in("status", ["live", "ht"]);

  const { data: lastScore } = await admin
    .from("fantasy_player_scores")
    .select("calculated_at")
    .order("calculated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { count: scoreCount } = await admin
    .from("fantasy_player_scores")
    .select("*", { count: "exact", head: true });

  return {
    recentSyncEvents: (events ?? []).map((e) => ({
      eventType: e.event_type,
      createdAt: e.created_at,
      payload: e.payload,
    })),
    liveFixtures: {
      count: live?.length ?? 0,
      fixtureIds: (live ?? []).map((f) => f.id),
    },
    lastScoringRecomputation: lastScore?.calculated_at ?? null,
    fantasyPlayerScoreCount: scoreCount ?? 0,
  };
}
