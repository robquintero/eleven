import "server-only";
import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../supabase/database.types.ts";
import type { ScoringRuleVersion } from "../../domain/fantasy/scoring.ts";
import { scoringVersion } from "./versions.ts";

/** Active catalog policy, never the newest implemented scorer. Request-scoped
 * memoization only: a later request observes an activation without deployment.
 * Failure is explicit; a silent V3 fallback could publish wrong rankings. */
export const getCatalogScoringVersion = cache(async (client: SupabaseClient<Database>): Promise<ScoringRuleVersion> => {
  const { data, error } = await client.rpc("get_catalog_scoring_version");
  if (error) throw new Error(`Cannot resolve catalog scoring policy: ${error.message}`);
  return scoringVersion(data);
});

export const getCurrentCatalogScoringVersion = cache(async (): Promise<ScoringRuleVersion> => {
  const { createClient } = await import("../supabase/server.ts");
  return getCatalogScoringVersion(await createClient());
});
