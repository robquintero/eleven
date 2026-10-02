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
 *      see docs/international-scoring.md).
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
export async function syncNationalTeamSquad(
  admin: SupabaseClient<Database>,
  nationalTeamClubCode: string,
  season: number
): Promise<SyncResult> {
  const counts = emptySyncCounts();
  const errors: string[] = [];
  const scope = { nationalTeamClubCode, season };
  const fail = (message: string, requestsUsed = 0): SyncResult => {
    errors.push(message);
    counts.failed += 1;
    return { operation: "sync-national-team-squad", scope, counts, requestsUsed, quota: {}, errors, stoppedForQuota: false };
  };

  const { data: clubRow } = await admin
    .from("clubs")
    .select("id, is_national_team")
    .eq("code", nationalTeamClubCode)
    .eq("is_national_team", true)
    .maybeSingle();
  if (!clubRow) {
    return fail(
      `No national-team club found for code ${nationalTeamClubCode} — run "sync clubs --code <an international competition>" first.`
    );
  }

  const { data: mappingRow } = await admin
    .from("provider_mappings")
    .select("external_id")
    .eq("provider", PROVIDER)
    .eq("internal_entity_type", "club")
    .eq("internal_entity_id", clubRow.id)
    .maybeSingle();
  if (!mappingRow) {
    return fail(`National team ${nationalTeamClubCode} has no provider mapping — run "sync clubs" for it first.`);
  }
  const providerTeamId = Number(mappingRow.external_id);

  try {
    const { data, meta } = await getPlayers({ team: providerTeamId, season });

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
          national_team_club_id: clubRow.id,
        })),
        { onConflict: "player_id,national_team_club_id" }
      );

      if (upsertError) {
        errors.push(`Failed to upsert player_national_teams: ${upsertError.message}`);
        counts.failed += toAssociate.length;
      } else {
        counts.updated += toAssociate.length;
      }
    }

    return {
      operation: "sync-national-team-squad",
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
