import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getPlayers } from "../football-providers/api-football/client.ts";
import { normalizePlayer } from "../football-providers/api-football/adapter.ts";
import type { BigFiveCompetitionConfig } from "../football-providers/api-football/big-five-competitions.ts";
import { createMappings, getExistingMappings, PROVIDER } from "./identity.ts";
import { emptySyncCounts, planReconciliation } from "./reconcile.ts";
import type { SyncResult } from "./types.ts";
import type { Database } from "@/lib/supabase/database.types";
import type { NormalizedPlayer } from "@/lib/football-providers/types";

/**
 * Syncs one PAGE of one club's players — one `GET /players` request, never
 * an automatic all-pages loop (brief §8: bounded, resumable — call again
 * with the next `page` to continue). `players` has no natural unique key
 * (brief §12: a footballer's identity must survive a club change), so
 * create-vs-update is decided by `planReconciliation` against
 * `provider_mappings`, not by any column on `players` itself. All players
 * returned by this call are treated as currently belonging to `clubCode`'s
 * club — that's what lets a transferred player's next sync (under their
 * new club's `team` id) update `club_id` in place rather than creating a
 * second row.
 */
export async function syncPlayersForClub(
  admin: SupabaseClient<Database>,
  config: BigFiveCompetitionConfig,
  clubCode: string,
  page = 1
): Promise<SyncResult> {
  const counts = emptySyncCounts();
  const errors: string[] = [];
  const scope = { competitionCode: config.code, clubCode, page };
  const fail = (message: string, requestsUsed = 0): SyncResult => {
    errors.push(message);
    counts.failed += 1;
    return { operation: "sync-players", scope, counts, requestsUsed, quota: {}, errors, stoppedForQuota: false };
  };

  const { data: competitionRow } = await admin
    .from("competitions")
    .select("id, season")
    .eq("code", config.code)
    .maybeSingle();
  if (!competitionRow?.season) {
    return fail(`Competition ${config.code} not synced yet — run "sync competitions --code ${config.code}" first.`);
  }

  const { data: clubRow } = await admin
    .from("clubs")
    .select("id")
    .eq("competition_id", competitionRow.id)
    .eq("code", clubCode)
    .maybeSingle();
  if (!clubRow) {
    return fail(`Club ${clubCode} not found in ${config.code} — run "sync clubs --code ${config.code}" first.`);
  }

  // provider_mappings is keyed externalId -> internalId; we need the
  // reverse (our club id -> the provider's numeric team id) to call
  // `GET /players?team=`, so this queries by internal_entity_id directly
  // rather than going through `getExistingMappings`.
  const { data: mappingRow } = await admin
    .from("provider_mappings")
    .select("external_id")
    .eq("provider", PROVIDER)
    .eq("internal_entity_type", "club")
    .eq("internal_entity_id", clubRow.id)
    .maybeSingle();
  if (!mappingRow) {
    return fail(`Club ${clubCode} has no provider mapping — run "sync clubs --code ${config.code}" first.`);
  }
  const providerTeamId = Number(mappingRow.external_id);

  try {
    const { data, meta } = await getPlayers({ team: providerTeamId, season: competitionRow.season, page });

    const normalized: NormalizedPlayer[] = [];
    for (const item of data.response) {
      const player = normalizePlayer(item, mappingRow.external_id, String(config.providerLeagueId));
      if (player) {
        normalized.push(player);
      } else {
        counts.skipped += 1;
      }
    }

    const existing = await getExistingMappings(
      admin,
      "player",
      normalized.map((p) => p.externalId)
    );
    const plan = planReconciliation(normalized, existing);

    if (plan.toCreate.length > 0) {
      const { data: inserted, error: insertError } = await admin
        .from("players")
        .insert(
          plan.toCreate.map((p) => ({
            club_id: clubRow.id,
            competition_id: competitionRow.id,
            name: p.name,
            short_name: p.shortName,
            position: p.position,
            shirt_number: p.shirtNumber ?? null,
            nationality: p.nationality ?? null,
            active: p.active,
            availability_status: p.availabilityStatus ?? null,
          }))
        )
        .select("id");

      if (insertError || !inserted) {
        errors.push(`Failed to insert players: ${insertError?.message}`);
        counts.failed += plan.toCreate.length;
      } else {
        await createMappings(
          admin,
          "player",
          plan.toCreate.map((p, i) => ({ externalId: p.externalId, internalId: inserted[i].id }))
        );
        counts.created += inserted.length;
      }
    }

    for (const { internalId, item } of plan.toUpdate) {
      const { error: updateError } = await admin
        .from("players")
        .update({
          club_id: clubRow.id,
          name: item.name,
          short_name: item.shortName,
          position: item.position,
          shirt_number: item.shirtNumber ?? null,
          nationality: item.nationality ?? null,
          active: item.active,
          availability_status: item.availabilityStatus ?? null,
        })
        .eq("id", internalId);

      if (updateError) {
        errors.push(`Failed to update player ${item.name}: ${updateError.message}`);
        counts.failed += 1;
      } else {
        counts.updated += 1;
      }
    }

    return {
      operation: "sync-players",
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
