import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { INTERNATIONAL_COMPETITIONS } from "../football-providers/api-football/international-competitions.ts";
import { syncCompetition } from "./sync-competitions.ts";
import { syncClubs } from "./sync-clubs.ts";
import { syncFixtures } from "./sync-fixtures.ts";
import { syncFixtureStats } from "./sync-fixture-stats.ts";
import { syncNationalTeamSquadByClubId } from "./sync-national-team-squad.ts";
import { hasMorePages, shouldStopForQuota } from "./quota.ts";
import { PROVIDER } from "./identity.ts";
import type { SyncResult } from "./types.ts";
import type { Database } from "../supabase/database.types.ts";

/** The season national-team squad calls (`GET /players?team=&season=`) resolve against -- today's real current international season, independent of whichever historical season tag each individual competition's config happens to carry (see international-competitions.ts's own doc comment on why those vary). */
const NATIONAL_SQUAD_SEASON = 2026;

export interface BootstrapInternationalResult {
  steps: SyncResult[];
  stoppedForQuota: boolean;
  requestsUsed: number;
}

/**
 * Pass 14 go-live Gate 2: activates the already-built international
 * ingestion pipeline for every enabled competition in
 * `INTERNATIONAL_COMPETITIONS` (the 20-competition allowlist audited and
 * approved during Pass 14 -- see docs/international-scoring.md). Does
 * NOT expand Eleven's draftable universe and NEVER touches
 * `players.club_id`/`players.competition_id` -- see
 * `sync-national-team-squad.ts`'s own doc comment for why that's
 * structural, not just disciplined.
 *
 * Idempotent and safe to re-run: every step it calls already upserts by
 * provider identity (`syncCompetition`, `syncClubs`) or a natural unique
 * key (`syncNationalTeamSquad`'s `(player_id, national_team_club_id)`,
 * `syncFixtures`'s provider-mapping reconciliation, `syncFixtureStats`'s
 * `(player_id, fixture_id)`). Re-running this after a partial/quota-
 * stopped run simply re-confirms already-ingested rows (no-op upserts)
 * and continues from wherever it left off -- there is no separate
 * "resume" bookkeeping to maintain because nothing here is write-once.
 *
 * Order matters for correctness, not just efficiency: a competition's
 * `season` must be resolved (step 1) before its clubs/fixtures can be
 * synced (both read the stored `competitions.season` column); a national
 * team's `clubs` row and provider mapping must exist (step 2) before its
 * squad can be associated (step 3, by `clubs.code` -- see
 * `sync-national-team-squad.ts`); fixtures (step 4) must exist before
 * their stats can be synced (step 5, by provider fixture id).
 *
 * `syncClubs` resolves identity by `provider_mappings` BEFORE the
 * `(competition_id, code)` natural key (see its own doc comment) -- a
 * country appearing in several of these 20 competitions (France in both
 * UEFA_NL and FIFA_WCQ_EUR, say) gets exactly ONE `clubs` row total,
 * attributed to whichever competition synced it first; this is what
 * makes `syncNationalTeamSquad`'s plain `clubs.code` lookup (no
 * competition filter) safe rather than ambiguous.
 *
 * Stops early (and is safe to re-run later) the moment any step reports
 * quota is nearly exhausted -- never a scope/step-type carve-out, since a
 * long-running historical fixture-stats backfill for one popular
 * competition could otherwise starve every later competition's catalog
 * sync of its fair share of a single day's budget.
 */
export async function bootstrapInternationalCompetitions(
  admin: SupabaseClient<Database>,
  options: {
    onProgress?: (message: string) => void;
    /**
     * Pass 14 go-live Gate 3: the daily automatic catalog-refresh cron
     * (football-catalog-refresh) calls this SAME function with this set
     * to `false` -- once a fixture exists in `fixtures` at all, the
     * existing per-minute `runLiveSyncTick` (competition-agnostic, see
     * its own doc comment) already finds and syncs its stats on its own
     * correctly-throttled cadence (Gate 1's `isDueForSync`). Re-fetching
     * every already-final international fixture's stats again, every
     * single day, forever, would grow unbounded as a season accumulates
     * completed matches -- exactly the kind of "redo work the per-minute
     * tick already owns" waste Gate 1 fixed for the live path. Defaults
     * to `true` because the one-time manual bootstrap (Gate 2) DOES need
     * it, to backfill scoring for fixtures that already happened before
     * Eleven started tracking this competition at all.
     */
    includeFixtureStats?: boolean;
  } = {}
): Promise<BootstrapInternationalResult> {
  const includeFixtureStats = options.includeFixtureStats ?? true;
  const steps: SyncResult[] = [];
  let requestsUsed = 0;
  let stoppedForQuota = false;
  const log = options.onProgress ?? (() => {});

  const recordStep = (result: SyncResult): boolean => {
    steps.push(result);
    requestsUsed += result.requestsUsed;
    if (shouldStopForQuota(result.quota)) {
      stoppedForQuota = true;
      return true;
    }
    return false;
  };

  const enabled = INTERNATIONAL_COMPETITIONS.filter((c) => c.enabled);

  // Step 1 + 2: competition metadata, then its national-team clubs.
  for (const config of enabled) {
    if (stoppedForQuota) break;
    log(`[competitions] ${config.code}`);
    if (recordStep(await syncCompetition(admin, config))) break;

    log(`[clubs] ${config.code}`);
    if (recordStep(await syncClubs(admin, config))) break;
  }

  // Step 3: every national team discovered above gets its current squad
  // associated -- by clubs.id directly (never clubs.code: that's only
  // unique per (competition_id, code), so two genuinely different
  // countries whose names both start with the same 3 letters --
  // Belgium/Belarus, Chile/China, Mali/Malta, Cameroon/Cambodia, all
  // observed live during this bootstrap -- CAN legitimately collide
  // across two different international competitions, making a plain
  // code lookup ambiguous across the whole table even though each real
  // team still has exactly one row, per syncClubs's own identity
  // resolution).
  if (!stoppedForQuota) {
    const { data: nationalTeams } = await admin.from("clubs").select("id, code").eq("is_national_team", true);
    for (const team of nationalTeams ?? []) {
      if (stoppedForQuota) break;
      log(`[national-squad] ${team.code} (${team.id})`);
      if (recordStep(await syncNationalTeamSquadByClubId(admin, team.id, NATIONAL_SQUAD_SEASON))) break;
    }
  }

  // Step 4: fixtures for every enabled competition -- the full
  // season/cycle (no date bounds), paginated explicitly since this is a
  // one-shot batch call rather than the CLI's single-page-per-invocation
  // convention. `excludeQualifying` is irrelevant here (that flag exists
  // for UEFA's domestic-adjacent competitions, not these already-
  // qualifying-stage-specific international codes).
  if (!stoppedForQuota) {
    for (const config of enabled) {
      if (stoppedForQuota) break;
      // `page: undefined` for the first call, exactly like the CLI's own
      // "fixtures --code X" (no --page) does -- API-Football's real
      // `/fixtures?league=&season=` rejects an explicit `page=1` outright
      // ("The Page field do not exist", found live during this
      // bootstrap's first run). Subsequent pages use the NEXT page number
      // the response itself reports, never a locally-incremented counter.
      let page: number | undefined;
      for (;;) {
        log(`[fixtures] ${config.code} page ${page ?? 1}`);
        const result = await syncFixtures(admin, config, { page });
        if (recordStep(result)) break;
        if (!hasMorePages(result.pagination)) break;
        page = result.pagination!.currentPage + 1;
      }
    }
  }

  // Step 5: stats for every already-final fixture in these 20
  // competitions that doesn't have a fixture-level provider mapping
  // problem -- needed for V2 scoring (Gate 8's real end-to-end proof
  // depends on this). Resolved via provider_mappings, exactly like
  // live-sync.ts's own stats step.
  if (!stoppedForQuota && includeFixtureStats) {
    const competitionIds = (
      await admin
        .from("competitions")
        .select("id")
        .in(
          "code",
          enabled.map((c) => c.code)
        )
    ).data?.map((c) => c.id) ?? [];

    if (competitionIds.length > 0) {
      const { data: finalFixtures } = await admin.from("fixtures").select("id").in("competition_id", competitionIds).eq("status", "final");
      const fixtureIds = (finalFixtures ?? []).map((f) => f.id);

      if (fixtureIds.length > 0) {
        const { data: mappings } = await admin
          .from("provider_mappings")
          .select("internal_entity_id, external_id")
          .eq("provider", PROVIDER)
          .eq("internal_entity_type", "fixture")
          .in("internal_entity_id", fixtureIds);

        for (const mapping of mappings ?? []) {
          if (stoppedForQuota) break;
          log(`[fixture-stats] fixture ${mapping.internal_entity_id}`);
          if (recordStep(await syncFixtureStats(admin, mapping.external_id))) break;
        }
      }
    }
  }

  return { steps, stoppedForQuota, requestsUsed };
}
