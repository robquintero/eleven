import type { SyncCounts } from "@/lib/football-ingestion/reconcile";
import type { ProviderPagination, ProviderQuota } from "@/lib/football-providers/types";

/**
 * The minimal shape every `sync-*.ts` function actually needs from a
 * competition config — deliberately NOT `BigFiveCompetitionConfig`
 * (src/lib/football-providers/api-football/big-five-competitions.ts).
 * That type specifically gates Eleven's *draftable player* eligibility
 * (brief §2) and must stay scoped to the five domestic leagues; the sync
 * functions themselves don't care whether a competition is Big Five or
 * UEFA, so they accept this narrower structural type instead. Both
 * `BigFiveCompetitionConfig` and `UefaCompetitionConfig`
 * (src/lib/football-providers/api-football/uefa-competitions.ts) satisfy
 * it without needing a shared base type.
 */
export interface CompetitionSyncTarget {
  code: string;
  providerLeagueId: number;
  providerSeason: number;
}

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
