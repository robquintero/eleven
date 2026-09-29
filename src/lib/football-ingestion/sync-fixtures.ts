import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getFixtures } from "../football-providers/api-football/client.ts";
import { normalizeFixture } from "../football-providers/api-football/adapter.ts";
import type { BigFiveCompetitionConfig } from "../football-providers/api-football/big-five-competitions.ts";
import { createMappings, getExistingMappings } from "./identity.ts";
import { emptySyncCounts, planReconciliation } from "./reconcile.ts";
import type { SyncResult } from "./types.ts";
import type { Database } from "@/lib/supabase/database.types";

export interface SyncFixturesOptions {
  /** YYYY-MM-DD — bounds the sync to a date range instead of a whole season at once (brief §9). */
  from?: string;
  to?: string;
  page?: number;
}

/**
 * Syncs one page (optionally date-bounded) of one competition's fixtures —
 * one `GET /fixtures` request. `fixtures` has no natural unique key, so
 * (like players) create-vs-update goes through `planReconciliation` +
 * `provider_mappings` — this is also what makes fixture status changes
 * (scheduled → live → final, or a postponement) safe re-syncs rather than
 * duplicate rows (brief §17).
 */
export async function syncFixtures(
  admin: SupabaseClient<Database>,
  config: BigFiveCompetitionConfig,
  options: SyncFixturesOptions = {}
): Promise<SyncResult> {
  const counts = emptySyncCounts();
  const errors: string[] = [];
  const scope = { competitionCode: config.code, ...options };
  const fail = (message: string, requestsUsed = 0): SyncResult => {
    errors.push(message);
    counts.failed += 1;
    return { operation: "sync-fixtures", scope, counts, requestsUsed, quota: {}, errors, stoppedForQuota: false };
  };

  const { data: competitionRow } = await admin
    .from("competitions")
    .select("id, season")
    .eq("code", config.code)
    .maybeSingle();
  if (!competitionRow?.season) {
    return fail(`Competition ${config.code} not synced yet — run "sync competitions --code ${config.code}" first.`);
  }

  try {
    const { data, meta } = await getFixtures({
      league: config.providerLeagueId,
      season: competitionRow.season,
      page: options.page,
      from: options.from,
      to: options.to,
    });

    const normalized = data.response.map(normalizeFixture);
    const clubExternalIds = Array.from(
      new Set(normalized.flatMap((f) => [f.homeClubExternalId, f.awayClubExternalId]))
    );
    const clubMappings = await getExistingMappings(admin, "club", clubExternalIds);

    const resolvable = normalized.filter((f) => {
      const ok = clubMappings.has(f.homeClubExternalId) && clubMappings.has(f.awayClubExternalId);
      if (!ok) {
        errors.push(`Skipping fixture ${f.externalId}: home/away club not synced yet.`);
        counts.skipped += 1;
      }
      return ok;
    });

    const existing = await getExistingMappings(
      admin,
      "fixture",
      resolvable.map((f) => f.externalId)
    );
    const plan = planReconciliation(resolvable, existing);

    if (plan.toCreate.length > 0) {
      const { data: inserted, error: insertError } = await admin
        .from("fixtures")
        .insert(
          plan.toCreate.map((f) => ({
            competition_id: competitionRow.id,
            home_club_id: clubMappings.get(f.homeClubExternalId)!,
            away_club_id: clubMappings.get(f.awayClubExternalId)!,
            kickoff_at: f.kickoffAt,
            status: f.status,
            season: competitionRow.season!,
          }))
        )
        .select("id");

      if (insertError || !inserted) {
        errors.push(`Failed to insert fixtures: ${insertError?.message}`);
        counts.failed += plan.toCreate.length;
      } else {
        await createMappings(
          admin,
          "fixture",
          plan.toCreate.map((f, i) => ({ externalId: f.externalId, internalId: inserted[i].id }))
        );
        counts.created += inserted.length;
      }
    }

    for (const { internalId, item } of plan.toUpdate) {
      const { error: updateError } = await admin
        .from("fixtures")
        .update({
          home_club_id: clubMappings.get(item.homeClubExternalId)!,
          away_club_id: clubMappings.get(item.awayClubExternalId)!,
          kickoff_at: item.kickoffAt,
          status: item.status,
        })
        .eq("id", internalId);

      if (updateError) {
        errors.push(`Failed to update fixture ${item.externalId}: ${updateError.message}`);
        counts.failed += 1;
      } else {
        counts.updated += 1;
      }
    }

    return {
      operation: "sync-fixtures",
      scope,
      counts,
      requestsUsed: 1,
      quota: meta.quota,
      pagination: meta.pagination,
      errors,
      stoppedForQuota: false,
    };
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err), 1);
  }
}
