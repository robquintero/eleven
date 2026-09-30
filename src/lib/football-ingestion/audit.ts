import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getPlayers } from "../football-providers/api-football/client.ts";
import { normalizePlayer } from "../football-providers/api-football/adapter.ts";
import { PROVIDER } from "./identity.ts";
import type { CompetitionSyncTarget } from "./types.ts";
import type { Database } from "@/lib/supabase/database.types";

const BIG_FIVE_CODES = ["ENG", "ESP", "GER", "ITA", "FRA"] as const;

/**
 * Cheap (no provider request), rerunnable-anytime database-integrity
 * checks for the Big Five player universe — see docs/football-data-system.md
 * "Player universe integrity." Answers "is what we've already ingested
 * internally consistent," as distinct from `compareProviderSquadToEleven`
 * below, which answers "does what we've ingested match the provider" (and
 * costs one real request per club it checks).
 */
export interface DatabaseIntegrityReport {
  playersByCompetition: Record<string, number>;
  totalPlayers: number;
  /** Should always be 0 — every ingested player is currently eligible; a positive count here means `normalizePlayer`'s `active` field started being respected somewhere without this report being updated. */
  inactivePlayers: number;
  /** Player rows whose competition_id isn't one of the five Big Five competitions — should always be 0 (see docs "Player eligibility"). */
  playersOutsideBigFive: number;
  duplicatePlayerExternalIds: number;
  providerMappingCount: number;
  expectedProviderMappingCount: number;
  mappingCountMatches: boolean;
  recentSkipReasons: Record<string, number>;
}

export async function getDatabaseIntegrityReport(
  admin: SupabaseClient<Database>
): Promise<DatabaseIntegrityReport> {
  const { data: comps } = await admin.from("competitions").select("id, code");
  const bigFiveIds = new Set((comps ?? []).filter((c) => (BIG_FIVE_CODES as readonly string[]).includes(c.code)).map((c) => c.id));

  const playersByCompetition: Record<string, number> = {};
  let totalPlayers = 0;
  for (const c of comps ?? []) {
    const { count } = await admin.from("players").select("*", { count: "exact", head: true }).eq("competition_id", c.id);
    if (bigFiveIds.has(c.id)) {
      playersByCompetition[c.code] = count ?? 0;
      totalPlayers += count ?? 0;
    }
  }

  const { count: inactivePlayers } = await admin
    .from("players")
    .select("*", { count: "exact", head: true })
    .eq("active", false)
    .in("competition_id", Array.from(bigFiveIds));

  const { count: playersOutsideBigFive } = await admin
    .from("players")
    .select("*", { count: "exact", head: true })
    .not("competition_id", "in", `(${Array.from(bigFiveIds).join(",")})`);

  const { data: playerMappings } = await admin
    .from("provider_mappings")
    .select("external_id")
    .eq("provider", PROVIDER)
    .eq("internal_entity_type", "player");
  const seen = new Set<string>();
  let duplicatePlayerExternalIds = 0;
  for (const m of playerMappings ?? []) {
    if (seen.has(m.external_id)) duplicatePlayerExternalIds += 1;
    seen.add(m.external_id);
  }

  const [{ count: providerMappingCount }, { count: compCount }, { count: clubCount }, { count: playerCount }, { count: fixtureCount }] =
    await Promise.all([
      admin.from("provider_mappings").select("*", { count: "exact", head: true }),
      admin.from("competitions").select("*", { count: "exact", head: true }),
      admin.from("clubs").select("*", { count: "exact", head: true }),
      admin.from("players").select("*", { count: "exact", head: true }),
      admin.from("fixtures").select("*", { count: "exact", head: true }),
    ]);
  const expectedProviderMappingCount = (compCount ?? 0) + (clubCount ?? 0) + (playerCount ?? 0) + (fixtureCount ?? 0);

  const { data: skipEvents } = await admin
    .from("domain_events")
    .select("payload")
    .in("event_type", ["FOOTBALL_SYNC_SYNC-PLAYERS", "FOOTBALL_SYNC_SYNC-FIXTURE-STATS"])
    .order("created_at", { ascending: false })
    .limit(500);

  const recentSkipReasons: Record<string, number> = {};
  for (const event of skipEvents ?? []) {
    const errors = (event.payload as { errors?: string[] })?.errors ?? [];
    for (const err of errors) {
      const reason = err.includes("no recognized position")
        ? "no recognized position (any competition)"
        : err.includes("not ingested via")
          ? "player not yet ingested (likely non-Big-Five opponent or not yet synced)"
          : err.includes("qualifying round")
            ? "qualifying round excluded"
            : "other";
      recentSkipReasons[reason] = (recentSkipReasons[reason] ?? 0) + 1;
    }
  }

  return {
    playersByCompetition,
    totalPlayers,
    inactivePlayers: inactivePlayers ?? 0,
    playersOutsideBigFive: playersOutsideBigFive ?? 0,
    duplicatePlayerExternalIds,
    providerMappingCount: providerMappingCount ?? 0,
    expectedProviderMappingCount,
    mappingCountMatches: (providerMappingCount ?? 0) === expectedProviderMappingCount,
    recentSkipReasons,
  };
}

export interface SquadComparisonResult {
  clubCode: string;
  providerSquadSize: number;
  eleveSquadSize: number;
  missingFromEleven: Array<{ externalId: string; name: string; reason: string }>;
  requestsUsed: number;
}

/**
 * The genuine "does Eleven match the provider" check (brief §"systematic
 * completeness audit", signal A vs D) — costs one real `/players` request
 * per page per club, so this is deliberately NOT run automatically for
 * all ~96 clubs; call it for a specific club you want to spot-check.
 */
export async function compareProviderSquadToEleven(
  admin: SupabaseClient<Database>,
  config: CompetitionSyncTarget,
  clubCode: string
): Promise<SquadComparisonResult> {
  const { data: comp } = await admin.from("competitions").select("id, season").eq("code", config.code).single();
  const { data: club } = await admin.from("clubs").select("id").eq("competition_id", comp!.id).eq("code", clubCode).single();
  const { data: mapping } = await admin
    .from("provider_mappings")
    .select("external_id")
    .eq("provider", PROVIDER)
    .eq("internal_entity_type", "club")
    .eq("internal_entity_id", club!.id)
    .single();

  const { data: elevenPlayers } = await admin.from("players").select("id").eq("club_id", club!.id);
  const { data: elevenMappings } = await admin
    .from("provider_mappings")
    .select("external_id")
    .eq("provider", PROVIDER)
    .eq("internal_entity_type", "player")
    .in("internal_entity_id", (elevenPlayers ?? []).map((p) => p.id));
  const elevenExternalIds = new Set((elevenMappings ?? []).map((m) => m.external_id));

  let providerSquadSize = 0;
  let requestsUsed = 0;
  const missingFromEleven: SquadComparisonResult["missingFromEleven"] = [];
  let page = 1;
  for (;;) {
    const { data, meta } = await getPlayers({ team: Number(mapping!.external_id), season: comp!.season!, page });
    requestsUsed += 1;
    providerSquadSize += data.response.length;
    for (const item of data.response) {
      const externalId = String(item.player.id);
      if (elevenExternalIds.has(externalId)) continue;
      const normalized = normalizePlayer(item, mapping!.external_id, String(config.providerLeagueId));
      missingFromEleven.push({
        externalId,
        name: item.player.name,
        reason: normalized ? "in provider response but not in Eleven — investigate" : "no recognized position in any statistics entry for this club",
      });
    }
    if (!meta.pagination || meta.pagination.currentPage >= meta.pagination.totalPages) break;
    page += 1;
  }

  return {
    clubCode,
    providerSquadSize,
    eleveSquadSize: elevenExternalIds.size,
    missingFromEleven,
    requestsUsed,
  };
}
