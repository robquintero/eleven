import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getTeams } from "../football-providers/api-football/client.ts";
import { normalizeClub } from "../football-providers/api-football/adapter.ts";
import type { BigFiveCompetitionConfig } from "../football-providers/api-football/big-five-competitions.ts";
import { createMappings, getExistingMappings } from "./identity.ts";
import { emptySyncCounts } from "./reconcile.ts";
import type { SyncResult } from "./types.ts";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Syncs every club for one already-synced competition — one
 * `GET /teams?league=&season=` request (API-Football returns a whole
 * league's clubs in a single page; no pagination loop needed here). `clubs`
 * has a natural unique key (`competition_id`, `code`), so every item is
 * upserted by that key unconditionally (idempotent by the DB constraint
 * itself) — `provider_mappings` is then backfilled only for external ids
 * that don't have one yet, same end result as the players/fixtures
 * reconciliation but without needing the generic plan for an entity that
 * already has a natural key.
 */
export async function syncClubs(
  admin: SupabaseClient<Database>,
  config: BigFiveCompetitionConfig
): Promise<SyncResult> {
  const counts = emptySyncCounts();
  const errors: string[] = [];
  const scope = { competitionCode: config.code };
  const failResult = (requestsUsed: number, quota: SyncResult["quota"]): SyncResult => ({
    operation: "sync-clubs",
    scope,
    counts,
    requestsUsed,
    quota,
    errors,
    stoppedForQuota: false,
  });

  const { data: competitionRow, error: competitionError } = await admin
    .from("competitions")
    .select("id, season")
    .eq("code", config.code)
    .maybeSingle();

  if (competitionError || !competitionRow) {
    errors.push(`Competition ${config.code} not found — run "sync competitions --code ${config.code}" first.`);
    counts.failed += 1;
    return failResult(0, {});
  }
  if (!competitionRow.season) {
    errors.push(`Competition ${config.code} has no resolved season yet — re-run "sync competitions --code ${config.code}".`);
    counts.failed += 1;
    return failResult(0, {});
  }

  try {
    const { data, meta } = await getTeams({
      league: config.providerLeagueId,
      season: competitionRow.season,
    });

    const normalized = data.response.map((item) => normalizeClub(item, String(config.providerLeagueId)));

    for (const club of normalized) {
      const { error: upsertError } = await admin
        .from("clubs")
        .upsert(
          {
            competition_id: competitionRow.id,
            code: club.code,
            name: club.name,
            short_name: club.shortName,
          },
          { onConflict: "competition_id,code" }
        );
      if (upsertError) {
        errors.push(`Failed to upsert club ${club.name}: ${upsertError.message}`);
        counts.failed += 1;
      }
    }

    // Backfill provider_mappings for whichever of these clubs don't have one yet.
    const externalIds = normalized.map((c) => c.externalId);
    const existingMappings = await getExistingMappings(admin, "club", externalIds);
    const unmapped = normalized.filter((c) => !existingMappings.has(c.externalId));

    if (unmapped.length > 0) {
      const { data: rows, error: selectError } = await admin
        .from("clubs")
        .select("id, code")
        .eq("competition_id", competitionRow.id)
        .in(
          "code",
          unmapped.map((c) => c.code)
        );

      if (selectError || !rows) {
        errors.push(`Failed to resolve newly-created club ids: ${selectError?.message}`);
        counts.failed += unmapped.length;
      } else {
        const idByCode = new Map(rows.map((r) => [r.code, r.id]));
        const pairs = unmapped
          .map((c) => ({ externalId: c.externalId, internalId: idByCode.get(c.code) }))
          .filter((p): p is { externalId: string; internalId: string } => Boolean(p.internalId));
        await createMappings(admin, "club", pairs);
        counts.created += pairs.length;
      }
    }
    counts.updated += normalized.length - unmapped.length - counts.failed;

    return {
      operation: "sync-clubs",
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
    return failResult(1, {});
  }
}
