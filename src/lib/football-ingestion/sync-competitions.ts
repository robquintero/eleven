import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getLeagues } from "../football-providers/api-football/client.ts";
import { normalizeCompetition } from "../football-providers/api-football/adapter.ts";
import { createMappings, getExistingMappings } from "./identity.ts";
import { emptySyncCounts } from "./reconcile.ts";
import type { CompetitionSyncTarget, SyncResult } from "./types.ts";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Syncs ONE competition's metadata (name/code/country/current season) —
 * one `GET /leagues?id=` request, never a loop across the whole Big Five
 * (see brief §8/§4). Also establishes/refreshes that competition's
 * `provider_mappings` row so `competitionExternalId` on any later
 * normalized club/player/fixture resolves back to this row.
 *
 * `seasonOverride` exists because the account's actual plan tier can
 * restrict which seasons its OTHER endpoints (`/teams`, `/players`,
 * `/fixtures`) will serve, independent of which season `/leagues` reports
 * as "current" — see docs/football-data-system.md "Provider/data
 * limitations discovered." Without it, `clubs`/`players`/`fixtures` syncs
 * would always inherit whatever season `/leagues` resolves, with no way to
 * pin a season the account can actually pull data for.
 */
export async function syncCompetition(
  admin: SupabaseClient<Database>,
  config: CompetitionSyncTarget,
  seasonOverride?: number
): Promise<SyncResult> {
  const counts = emptySyncCounts();
  const errors: string[] = [];
  const scope = { competitionCode: config.code, ...(seasonOverride ? { seasonOverride } : {}) };

  try {
    const { data, meta } = await getLeagues({ id: config.providerLeagueId });
    const item = data.response[0];
    if (!item) {
      errors.push(`No league data returned for ${config.code} (provider id ${config.providerLeagueId})`);
      counts.failed += 1;
      return { operation: "sync-competitions", scope, counts, requestsUsed: 1, quota: meta.quota, errors, stoppedForQuota: false };
    }

    const normalized = normalizeCompetition(item, config);
    if (seasonOverride) normalized.season = seasonOverride;

    const { data: row, error: upsertError } = await admin
      .from("competitions")
      .upsert(
        { code: normalized.code, name: normalized.name, country: normalized.country, season: normalized.season ?? null },
        { onConflict: "code" }
      )
      .select("id")
      .single();

    if (upsertError || !row) {
      errors.push(`Failed to upsert competition ${config.code}: ${upsertError?.message}`);
      counts.failed += 1;
      return { operation: "sync-competitions", scope, counts, requestsUsed: 1, quota: meta.quota, errors, stoppedForQuota: false };
    }

    const existing = await getExistingMappings(admin, "competition", [normalized.externalId]);
    if (existing.has(normalized.externalId)) {
      counts.updated += 1;
    } else {
      await createMappings(admin, "competition", [{ externalId: normalized.externalId, internalId: row.id }]);
      counts.created += 1;
    }

    return {
      operation: "sync-competitions",
      scope,
      counts,
      requestsUsed: 1,
      quota: meta.quota,
      errors,
      stoppedForQuota: false,
    };
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err));
    counts.failed += 1;
    return {
      operation: "sync-competitions",
      scope,
      counts,
      requestsUsed: 1,
      quota: {},
      errors,
      stoppedForQuota: false,
    };
  }
}
