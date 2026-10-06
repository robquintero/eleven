import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "../supabase/database.types.ts";
import { PROVIDER } from "./identity.ts";

/** Preserve the complete received JSON, never reconstruct it from normalized
 * fields. One latest snapshot per endpoint/fixture also retains unmapped players. */
export function providerSnapshotRow(endpoint: "/fixtures" | "/fixtures/players", externalId: string, fixtureId: string, payload: unknown, fetchedAt: string, fixtureStatus: string | null = null) {
  return { provider: PROVIDER, endpoint, external_id: externalId, fixture_id: fixtureId,
    payload: payload as Json, fetched_at: fetchedAt, observed_fixture_status: fixtureStatus, schema_version: 1 };
}
export async function saveProviderSnapshots(admin: SupabaseClient<Database>, rows: ReturnType<typeof providerSnapshotRow>[]) {
  if (!rows.length) return;
  const { error } = await admin.from("football_provider_snapshots").upsert(rows, { onConflict: "provider,endpoint,external_id" });
  if (error) throw new Error(`Cannot preserve provider evidence: ${error.message}`);
}
