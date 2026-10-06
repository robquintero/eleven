import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getFixturePlayers } from "../football-providers/api-football/client.ts";
import { normalizeFixturePlayerStats } from "../football-providers/api-football/adapter.ts";
import { providerSnapshotRow, saveProviderSnapshots } from "./provider-snapshots.ts";
import { PROVIDER } from "./identity.ts";
import { emptySyncCounts } from "./reconcile.ts";
import type { SyncResult } from "./types.ts";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Syncs one completed fixture's per-player statistics — one
 * `GET /fixtures/players` request. `player_match_stats` already has a
 * natural unique key (`player_id`, `fixture_id` — see
 * supabase/migrations/20260929141127_football_foundation.sql), so this
 * upserts directly by that key rather than needing `planReconciliation`.
 * A player with no local `provider_mappings` row (not ingested via
 * `sync players` yet) is skipped, never inserted under a guessed identity
 * — see brief §16 "stat provenance."
 */
export async function syncFixtureStats(
  admin: SupabaseClient<Database>,
  fixtureExternalId: string,
  storedResponse?: { data: Awaited<ReturnType<typeof getFixturePlayers>>["data"]; fetchedAt: string }
): Promise<SyncResult> {
  const counts = emptySyncCounts();
  const errors: string[] = [];
  const scope = { fixtureExternalId };
  const fail = (message: string, requestsUsed = 0): SyncResult => {
    errors.push(message);
    counts.failed += 1;
    return { operation: "sync-fixture-stats", scope, counts, requestsUsed, quota: {}, errors, stoppedForQuota: false };
  };

  const { data: fixtureMapping } = await admin
    .from("provider_mappings")
    .select("internal_entity_id")
    .eq("provider", PROVIDER)
    .eq("internal_entity_type", "fixture")
    .eq("external_id", fixtureExternalId)
    .maybeSingle();

  if (!fixtureMapping) {
    return fail(`Fixture ${fixtureExternalId} not synced yet — run "sync fixtures" for its competition first.`);
  }
  const fixtureId = fixtureMapping.internal_entity_id;

  const { data: fixture, error: fixtureError } = await admin.from("fixtures").select("status").eq("id", fixtureId).maybeSingle();
  if (fixtureError || !fixture) return fail(`Cannot resolve fixture provenance: ${fixtureError?.message ?? "missing fixture"}`);

  try {
    const { data, meta } = storedResponse ? { data: storedResponse.data, meta: { quota: {} } } : await getFixturePlayers({ fixture: Number(fixtureExternalId) });
    if (data.parameters?.fixture && String(data.parameters.fixture) !== fixtureExternalId) throw new Error("PROVIDER_FIXTURE_ID_MISMATCH_STOP");
    await saveProviderSnapshots(admin, [providerSnapshotRow("/fixtures/players", fixtureExternalId, fixtureId, data, storedResponse?.fetchedAt ?? new Date().toISOString(), fixture.status)]);
    const rows = normalizeFixturePlayerStats(data.response, fixtureExternalId);

    const playerExternalIds = rows.map((r) => r.playerExternalId);
    const { data: playerMappings, error: mappingError } = await admin
      .from("provider_mappings")
      .select("external_id, internal_entity_id")
      .eq("provider", PROVIDER)
      .eq("internal_entity_type", "player")
      .in("external_id", playerExternalIds);
    if (mappingError) return fail(`Cannot resolve player identities: ${mappingError.message}`, storedResponse ? 0 : 1);
    const playerIdByExternalId = new Map((playerMappings ?? []).map((m) => [m.external_id, m.internal_entity_id]));

    const resolvedRows = rows
      .map((r) => ({ row: r, playerId: playerIdByExternalId.get(r.playerExternalId) }))
      .filter((entry): entry is { row: (typeof rows)[number]; playerId: string } => {
        if (!entry.playerId) {
          errors.push(`Skipping player ${entry.row.playerExternalId}: not ingested via "sync players" yet.`);
          counts.skipped += 1;
          return false;
        }
        return true;
      });

    if (resolvedRows.length > 0) {
      const { data: existingStats, error: existingError } = await admin
        .from("player_match_stats")
        .select("player_id, scoring_position")
        .eq("fixture_id", fixtureId)
        .in(
          "player_id",
          resolvedRows.map((e) => e.playerId)
        );
      if (existingError) return fail(`Cannot preserve scoring provenance: ${existingError.message}`, storedResponse ? 0 : 1);
      const existingPlayerIds = new Set((existingStats ?? []).map((r) => r.player_id));
      const pinnedPositions = new Map((existingStats ?? []).map(r => [r.player_id, r.scoring_position]));
      const [{ data: players, error: playerError }, { data: teams, error: teamError }] = await Promise.all([
        admin.from("players").select("id, position").in("id", resolvedRows.map(r => r.playerId)),
        admin.from("provider_mappings").select("external_id, internal_entity_id").eq("provider", PROVIDER)
          .eq("internal_entity_type", "club").in("external_id", data.response.map(team => String(team.team.id))),
      ]);
      if (playerError || teamError) return fail(`Cannot resolve scoring provenance: ${playerError?.message ?? teamError?.message}`, storedResponse ? 0 : 1);
      const positions = new Map((players ?? []).map(p => [p.id, p.position]));
      const teamIds = new Map((teams ?? []).map(t => [t.external_id, t.internal_entity_id]));


      const { error: upsertError } = await admin.from("player_match_stats").upsert(
        resolvedRows.map(({ row, playerId }) => fixtureStatPersistenceRow(row, playerId, fixtureId,
          teamIds.get(row.participationTeamExternalId ?? "") ?? null,
          pinnedPositions.get(playerId) ?? positions.get(playerId) ?? null)),
        { onConflict: "player_id,fixture_id" }
      );

      if (upsertError) {
        errors.push(`Failed to upsert player_match_stats: ${upsertError.message}`);
        counts.failed += resolvedRows.length;
      } else {
        for (const { playerId } of resolvedRows) {
          if (existingPlayerIds.has(playerId)) counts.updated += 1;
          else counts.created += 1;
        }
      }
    }

    return {
      operation: "sync-fixture-stats",
      scope: { ...scope, providerPerformances: rows.length, mappedPerformances: resolvedRows.length, unmappedPerformances: counts.skipped,
        playersWithoutStatistics: data.response.reduce((n, t) => n + t.players.filter(p => !p.statistics?.length).length, 0) },
      counts,
      requestsUsed: storedResponse ? 0 : 1,
      quota: meta.quota,
      errors,
      stoppedForQuota: false,
    };
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err), storedResponse ? 0 : 1);
  }
}

/** Shared by the production upsert and offline adapter→storage→score tests. */
export function fixtureStatPersistenceRow(row: import("../football-providers/types.ts").NormalizedFixturePlayerStats, playerId: string, fixtureId: string, participationClubId: string | null, scoringPosition: string | null) {
  return {
    player_id: playerId, fixture_id: fixtureId,
    minutes: row.minutes, started: row.started, goals: row.goals, assists: row.assists,
    shots_on_target: row.shotsOnTarget, chances_created: row.chancesCreated,
    tackles: row.tackles, interceptions: row.interceptions, blocks: row.blocks, saves: row.saves,
    yellow_cards: row.yellowCards, red_cards: row.redCards, clean_sheet: row.cleanSheet ?? null,
    reported_stats: row.reportedStats ?? null, participation_club_id: participationClubId, scoring_position: scoringPosition,
  };
}
