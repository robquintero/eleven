import type { SyncCounts } from "@/lib/football-ingestion/reconcile";
import type { ProviderPagination, ProviderQuota } from "@/lib/football-providers/types";

/**
 * What every `sync-*.ts` operation returns — the "useful structured
 * result" the Pass 8 brief asks for (§6/§18), printed by the CLI and
 * suitable for recording as a domain_events row. Never hides partial
 * failure: `errors` always lists what actually went wrong, `counts.failed`
 * is never silently swallowed into `skipped`.
 */
export interface SyncResult {
  operation: string;
  scope: Record<string, string | number | undefined>;
  counts: SyncCounts;
  requestsUsed: number;
  quota: ProviderQuota;
  pagination?: ProviderPagination;
  errors: string[];
  stoppedForQuota: boolean;
}
