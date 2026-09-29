import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getTeams } from "../football-providers/api-football/client.ts";
import { normalizeClub } from "../football-providers/api-football/adapter.ts";
import type { BigFiveCompetitionConfig } from "../football-providers/api-football/big-five-competitions.ts";
import { createMappings, getExistingMappings } from "./identity.ts";
import { emptySyncCounts, planReconciliation } from "./reconcile.ts";
import type { SyncResult } from "./types.ts";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Syncs every club for one already-synced competition — one
 * `GET /teams?league=&season=` request (API-Football returns a whole
 * league's clubs in a single page; no pagination loop needed here).
 *
 * Identity is resolved via `provider_mappings` (`planReconciliation()`),
 * exactly like players/fixtures — NOT by the `(competition_id, code)`
 * natural key. This matters the moment a club competes in more than one
 * synced competition (a Big Five club also playing in the Champions
 * League, say): the natural key alone can't tell "this club already
 * exists under a different competition_id" from "this is a genuinely new
 * club," and would silently create a second, orphaned row for the same
 * real club. Resolving by provider mapping first means: a club Eleven has
 * already seen gets its `name`/`short_name` refreshed in place and its
 * *existing* `competition_id` is left untouched (a club's primary/domestic
 * competition is set once, on first sight, and never reassigned by a
 * later sync from a different competition); only a club with no existing
 * mapping is created fresh, attributed to whichever competition this call
 * is syncing.
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

    const existing = await getExistingMappings(
      admin,
      "club",
      normalized.map((c) => c.externalId)
    );
    const plan = planReconciliation(normalized, existing);

    if (plan.toCreate.length > 0) {
      const { data: inserted, error: insertError } = await admin
        .from("clubs")
        .insert(
          plan.toCreate.map((c) => ({
            competition_id: competitionRow.id,
            code: c.code,
            name: c.name,
            short_name: c.shortName,
          }))
        )
        .select("id");

      if (insertError || !inserted) {
        errors.push(`Failed to insert clubs: ${insertError?.message}`);
        counts.failed += plan.toCreate.length;
      } else {
        await createMappings(
          admin,
          "club",
          plan.toCreate.map((c, i) => ({ externalId: c.externalId, internalId: inserted[i].id }))
        );
        counts.created += inserted.length;
      }
    }

    for (const { internalId, item } of plan.toUpdate) {
      // Deliberately NOT updating competition_id — see module doc comment.
      const { error: updateError } = await admin
        .from("clubs")
        .update({ name: item.name, short_name: item.shortName })
        .eq("id", internalId);

      if (updateError) {
        errors.push(`Failed to update club ${item.name}: ${updateError.message}`);
        counts.failed += 1;
      } else {
        counts.updated += 1;
      }
    }

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
