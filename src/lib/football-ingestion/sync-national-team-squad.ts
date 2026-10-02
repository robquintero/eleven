import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getPlayers } from "../football-providers/api-football/client.ts";
import { getExistingMappings, PROVIDER } from "./identity.ts";
import { emptySyncCounts } from "./reconcile.ts";
import type { SyncResult } from "./types.ts";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Pass 14 (brief §5/§Phase 5): associates existing canonical Eleven
 * players with a national team — deliberately NOT `syncPlayersForClub`
 * (`sync-players.ts`), whose update path unconditionally overwrites
 * `players.club_id` with whatever team context it's called with. Pointing
 * that function at a national team would silently reassign every
 * called-up player's canonical club to their country — exactly the
 * failure mode this pass exists to prevent.
 *
 * This function instead:
 *   1. Calls the SAME `GET /players?team=&season=` endpoint
 *      `sync-players.ts` already uses (it works identically for any
 *      provider team id, club or national team — confirmed live,
 *      see docs/international-scoring.md), looping through EVERY page —
 *      a real international roster easily spans several pages (a squad
 *      call-up history, not just the current 23-26 named players), and a
 *      single-page fetch silently associated only whichever players
 *      happened to land on page 1 (found live during Pass 14 go-live
 *      Gate 2's real bootstrap run).
 *   2. Resolves each returned player's identity READ-ONLY via
 *      `provider_mappings` — exactly like `sync-fixture-stats.ts` already
 *      does for match-stat rows. A player with no existing mapping (not
 *      yet known to Eleven at all) is skipped, never created — this pass
 *      does not expand the player universe.
 *   3. Upserts into `player_national_teams` only.
 *
 * It never reads or writes `players.club_id`, `players.competition_id`,
 * or any other player-identity column — structurally incapable of
 * overwriting canonical club membership, not just disciplined about it.
 */
export async function syncNationalTeamSquadByClubId(
  admin: SupabaseClient<Database>,
  nationalTeamClubId: string,
  season: number
): Promise<SyncResult> {
  const counts = emptySyncCounts();
  const errors: string[] = [];
  const scope = { nationalTeamClubId, season };
  const fail = (message: string, requestsUsed = 0): SyncResult => {
    errors.push(message);
    counts.failed += 1;
    return { operation: "sync-national-team-squad", scope, counts, requestsUsed, quota: {}, errors, stoppedForQuota: false };
  };

  const { data: mappingRow } = await admin
    .from("provider_mappings")
    .select("external_id")
    .eq("provider", PROVIDER)
    .eq("internal_entity_type", "club")
    .eq("internal_entity_id", nationalTeamClubId)
    .maybeSingle();
  if (!mappingRow) {
    return fail(`National team ${nationalTeamClubId} has no provider mapping — run "sync clubs" for it first.`);
  }
  const providerTeamId = Number(mappingRow.external_id);

  let requestsUsed = 0;
  let lastQuota: SyncResult["quota"] = {};
  let lastPagination: SyncResult["pagination"];

  try {
    for (let page = 1; ; page += 1) {
      const { data, meta } = await getPlayers({ team: providerTeamId, season, page: page === 1 ? undefined : page });
      requestsUsed += 1;
      lastQuota = meta.quota;
      lastPagination = meta.pagination;

      const externalPlayerIds = data.response.map((item) => String(item.player.id));
      const existingPlayerMappings = await getExistingMappings(admin, "player", externalPlayerIds);

      const toAssociate: { playerId: string; externalId: string }[] = [];
      for (const item of data.response) {
        const externalId = String(item.player.id);
        const playerId = existingPlayerMappings.get(externalId);
        if (!playerId) {
          // Not yet known to Eleven under any club — correctly skipped,
          // never fabricated as a new "international-only" player (brief:
          // "this is NOT an expansion of the draftable player universe").
          counts.skipped += 1;
          continue;
        }
        toAssociate.push({ playerId, externalId });
      }

      if (toAssociate.length > 0) {
        const { error: upsertError } = await admin.from("player_national_teams").upsert(
          toAssociate.map(({ playerId }) => ({
            player_id: playerId,
            national_team_club_id: nationalTeamClubId,
          })),
          { onConflict: "player_id,national_team_club_id" }
        );

        if (upsertError) {
          errors.push(`Failed to upsert player_national_teams (page ${page}): ${upsertError.message}`);
          counts.failed += toAssociate.length;
        } else {
          counts.updated += toAssociate.length;
        }
      }

      if (!meta.pagination || meta.pagination.currentPage >= meta.pagination.totalPages) break;
    }

    return {
      operation: "sync-national-team-squad",
      scope,
      counts,
      requestsUsed,
      quota: lastQuota,
      pagination: lastPagination,
      errors,
      stoppedForQuota: false,
    };
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err));
    counts.failed += 1;
    return { operation: "sync-national-team-squad", scope, counts, requestsUsed: requestsUsed + 1, quota: lastQuota, errors, stoppedForQuota: false };
  }
}

/**
 * Human-friendly wrapper around `syncNationalTeamSquadByClubId` for the
 * CLI's single-team invocation (`national-squad --code FRA --season
 * 2026`), where a developer knows a readable code. NOT used by the bulk
 * `international-bootstrap` orchestration, which resolves every team by
 * its real `clubs.id` directly instead — see that module's own doc
 * comment on why: `clubs.code` is only unique per `(competition_id,
 * code)`, so two genuinely different countries whose names both start
 * with the same 3 letters (Belgium/Belarus, Chile/China, Mali/Malta,
 * etc.) CAN legitimately collide across two different international
 * competitions, making a plain code lookup ambiguous across the whole
 * table. For a human manually running this for one specific team they
 * already know the code of, that's an acceptable (and clearly surfaced)
 * edge case; for 240 teams in an unattended batch, it is not.
 */
export async function syncNationalTeamSquad(
  admin: SupabaseClient<Database>,
  nationalTeamClubCode: string,
  season: number
): Promise<SyncResult> {
  const scope = { nationalTeamClubCode, season };
  const { data: clubRow } = await admin
    .from("clubs")
    .select("id")
    .eq("code", nationalTeamClubCode)
    .eq("is_national_team", true)
    .maybeSingle();
  if (!clubRow) {
    return {
      operation: "sync-national-team-squad",
      scope,
      counts: { ...emptySyncCounts(), failed: 1 },
      requestsUsed: 0,
      quota: {},
      errors: [`No national-team club found for code ${nationalTeamClubCode} — run "sync clubs --code <an international competition>" first.`],
      stoppedForQuota: false,
    };
  }
  const result = await syncNationalTeamSquadByClubId(admin, clubRow.id, season);
  return { ...result, scope };
}
