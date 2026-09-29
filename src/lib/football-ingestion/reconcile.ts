/**
 * Pure reconciliation logic behind every sync operation — no Supabase, no
 * network, no I/O. Split out so "idempotent upsert," "duplicate
 * prevention," and "player identity survives a club change" are all
 * testable with plain `node --test` against in-memory data, the same way
 * `api-football/adapter.ts`'s normalizers are (see reconcile.test.ts).
 *
 * The actual I/O callers (`sync-*.ts`) look up existing provider mappings
 * first, hand the result to `planReconciliation`, then execute exactly the
 * plan it returns — the decision of "is this a create or an update" never
 * happens ad hoc inline in a Supabase call site.
 */

export interface HasExternalId {
  externalId: string;
}

export interface ReconciliationPlan<T extends HasExternalId> {
  /** Items with no existing provider mapping — a canonical row + mapping must be created. */
  toCreate: T[];
  /** Items whose provider mapping already resolves to an Eleven row — that row gets updated in place (this is how e.g. a player's current club changes without a new player being created). */
  toUpdate: Array<{ internalId: string; item: T }>;
}

/**
 * `existingMappingsByExternalId` is whatever the caller already looked up
 * from `provider_mappings` for this batch's external ids (see
 * `identity.ts`) — this function makes no assumption about how that
 * lookup happened, which is what keeps it pure/testable.
 */
export function planReconciliation<T extends HasExternalId>(
  items: T[],
  existingMappingsByExternalId: ReadonlyMap<string, string>
): ReconciliationPlan<T> {
  const toCreate: T[] = [];
  const toUpdate: Array<{ internalId: string; item: T }> = [];

  for (const item of items) {
    const internalId = existingMappingsByExternalId.get(item.externalId);
    if (internalId) {
      toUpdate.push({ internalId, item });
    } else {
      toCreate.push(item);
    }
  }

  return { toCreate, toUpdate };
}

export interface SyncCounts {
  created: number;
  updated: number;
  skipped: number;
  failed: number;
}

export function emptySyncCounts(): SyncCounts {
  return { created: 0, updated: 0, skipped: 0, failed: 0 };
}
