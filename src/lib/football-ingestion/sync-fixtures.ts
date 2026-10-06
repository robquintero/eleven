import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { providerSnapshotRow, saveProviderSnapshots } from "./provider-snapshots.ts";
import { getFixtures } from "../football-providers/api-football/client.ts";
import { normalizeFixture } from "../football-providers/api-football/adapter.ts";
import { createMappings, getExistingMappings } from "./identity.ts";
import { emptySyncCounts, planReconciliation } from "./reconcile.ts";
import { isQualifyingRound } from "./rounds.ts";
import type { CompetitionSyncTarget, SyncResult } from "./types.ts";
import type { Database } from "@/lib/supabase/database.types";

export interface SyncFixturesOptions {
  /** YYYY-MM-DD — bounds the sync to a date range instead of a whole season at once (brief §9). */
  from?: string;
  to?: string;
  page?: number;
  /** Completed history only; excludes future/unplayed metadata requests. */
  completedBefore?: string;
  /** UEFA competitions only — excludes qualifying-round/play-off fixtures (see rounds.ts), keeping only the main League Stage/knockout competition. No-op for domestic leagues, which have no qualifying rounds. */
  excludeQualifying?: boolean;
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
  config: CompetitionSyncTarget,
  options: SyncFixturesOptions = {}
): Promise<SyncResult> {
  const counts = emptySyncCounts();
  const errors: string[] = [];
  const scope = {
    competitionCode: config.code,
    from: options.from,
    to: options.to,
    page: options.page,
    excludeQualifying: options.excludeQualifying ? "true" : undefined,
  };
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
      status: options.completedBefore ? "FT-AET-PEN" : undefined,
    });

    if (options.completedBefore && data.response.some(f =>
      f.league.id !== config.providerLeagueId || f.league.season !== competitionRow.season ||
      !["FT", "AET", "PEN"].includes(f.fixture.status.short) ||
      new Date(f.fixture.date).getTime() > new Date(options.completedBefore!).getTime() ||
      (options.from && new Date(f.fixture.date).getTime() < new Date(`${options.from}T00:00:00Z`).getTime())
    )) throw new Error("OUT_OF_SCOPE_PROVIDER_FIXTURE_STOP");

    const received = options.completedBefore ? data.response.filter(f => new Date(f.fixture.date).getTime() <= new Date(options.completedBefore!).getTime() && ["FT", "AET", "PEN"].includes(f.fixture.status.short)) : data.response;
    const rawNormalized = received.map(normalizeFixture);
    const normalized = options.excludeQualifying
      ? rawNormalized.filter((f) => {
          const isQualifying = isQualifyingRound(f.round);
          if (isQualifying) {
            errors.push(`Skipping fixture ${f.externalId}: qualifying round ("${f.round}"), not the main competition.`);
            counts.skipped += 1;
          }
          return !isQualifying;
        })
      : rawNormalized;

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
            home_score: f.homeScore ?? null,
            away_score: f.awayScore ?? null,
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
          // Always overwritten on every sync (never merged/max'd) — scores
          // only ever come from the provider's current response, matching
          // status/kickoff_at's existing "trust the latest sync" behavior.
          home_score: item.homeScore ?? null,
          away_score: item.awayScore ?? null,
        })
        .eq("id", internalId);

      if (updateError) {
        errors.push(`Failed to update fixture ${item.externalId}: ${updateError.message}`);
        counts.failed += 1;
      } else {
        counts.updated += 1;
      }
    }

    const canonicalFixtures = await getExistingMappings(admin, "fixture", resolvable.map(f => f.externalId));
    const fetchedAt = new Date().toISOString();
    await saveProviderSnapshots(admin, received.flatMap(item => {
      const externalId = String(item.fixture.id), fixtureId = canonicalFixtures.get(externalId);
      return fixtureId ? [providerSnapshotRow("/fixtures", externalId, fixtureId, item, fetchedAt, normalizeFixture(item).status)] : [];
    }));

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
