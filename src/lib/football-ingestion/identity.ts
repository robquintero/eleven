import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

export const PROVIDER = "api-football";

export type InternalEntityType = Database["public"]["Tables"]["provider_mappings"]["Row"]["internal_entity_type"];

type AdminClient = SupabaseClient<Database>;

/**
 * Looks up which of `externalIds` already resolve to an Eleven row, via
 * `provider_mappings`. The result feeds `reconcile.ts`'s
 * `planReconciliation` — this function does no reconciliation itself, it
 * only answers "what do we already know."
 */
export async function getExistingMappings(
  admin: AdminClient,
  entityType: InternalEntityType,
  externalIds: string[]
): Promise<Map<string, string>> {
  if (externalIds.length === 0) return new Map();

  const { data, error } = await admin
    .from("provider_mappings")
    .select("external_id, internal_entity_id")
    .eq("provider", PROVIDER)
    .eq("internal_entity_type", entityType)
    .in("external_id", externalIds);

  if (error) throw new Error(`Failed to read provider_mappings: ${error.message}`);

  return new Map((data ?? []).map((row) => [row.external_id, row.internal_entity_id]));
}

/**
 * Records new provider mappings after their canonical rows have been
 * created. Never called for an externalId `getExistingMappings` already
 * resolved — that's what makes re-running a sync idempotent rather than
 * re-inserting a duplicate mapping (which the table's own UNIQUE
 * constraints would reject anyway, but the reconciliation plan is what
 * keeps this from being attempted in the first place).
 */
export async function createMappings(
  admin: AdminClient,
  entityType: InternalEntityType,
  pairs: Array<{ externalId: string; internalId: string }>
): Promise<void> {
  if (pairs.length === 0) return;

  const { error } = await admin.from("provider_mappings").insert(
    pairs.map(({ externalId, internalId }) => ({
      provider: PROVIDER,
      internal_entity_type: entityType,
      internal_entity_id: internalId,
      external_id: externalId,
    }))
  );

  if (error) throw new Error(`Failed to write provider_mappings: ${error.message}`);
}
