import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/database.types";
import type { SyncResult } from "@/lib/football-ingestion/types";

/**
 * Sync observability (brief §18) reuses the existing `domain_events` table
 * rather than a new sync-state migration — it's already exactly "an
 * append-only log of meaningful actions" (see its own table comment in
 * supabase/migrations/20260929141139_transactions_events.sql). A football
 * sync isn't league-scoped, so `league_id`/`actor_user_id`/
 * `fantasy_team_id` are all null here; RLS's `domain_events` SELECT policy
 * requires a non-null `league_id`, so these rows are readable only via the
 * service-role admin client, same as everything else this pass writes —
 * there is no UI surface for sync history yet.
 */
export async function recordSyncEvent(
  admin: SupabaseClient<Database>,
  result: SyncResult
): Promise<void> {
  const { error } = await admin.from("domain_events").insert({
    event_type: `FOOTBALL_SYNC_${result.operation.toUpperCase()}`,
    entity_type: "football_sync",
    payload: {
      scope: result.scope,
      counts: result.counts,
      requestsUsed: result.requestsUsed,
      quota: result.quota,
      pagination: result.pagination ?? null,
      errors: result.errors,
      stoppedForQuota: result.stoppedForQuota,
    } as unknown as Json,
  });

  if (error) {
    // Observability must never fail the sync itself — log and move on.
    console.error(`Failed to record sync event: ${error.message}`);
  }
}
