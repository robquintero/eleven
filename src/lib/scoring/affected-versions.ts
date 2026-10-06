import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../supabase/database.types.ts";
import { type ScoringRuleVersion } from "../../domain/fantasy/scoring.ts";
import { getCatalogScoringVersion } from "./catalog-version.ts";
import { scoringVersion } from "./versions.ts";

/** Provider corrections must regenerate every pinned model touched by a
 * fixture, including completed rounds. Also regenerate the currently active catalog model. */
export async function getAffectedScoringVersions(admin: SupabaseClient<Database>, fixtureIds: string[]): Promise<ScoringRuleVersion[]> {
  const versions = new Set<ScoringRuleVersion>([await getCatalogScoringVersion(admin)]);
  if (!fixtureIds.length) return [...versions];
  const { data: fixtures, error } = await admin.from("fixtures").select("kickoff_at").in("id", fixtureIds);
  if (error) throw new Error(`Cannot resolve affected scoring versions: ${error.message}`);
  const kickoffs = (fixtures ?? []).map(f => f.kickoff_at).sort();
  if (!kickoffs.length) return [...versions];
  for (let offset = 0; ; offset += 1000) {
    const { data: rounds, error } = await admin.from("fantasy_rounds").select("id, starts_at, ends_at, scoring_rule_version")
      .lte("starts_at", kickoffs[kickoffs.length - 1]).gte("ends_at", kickoffs[0]).order("id").range(offset, offset + 999);
    if (error) throw new Error(`Cannot read pinned scoring versions: ${error.message}`);
    for (const round of rounds ?? []) if (kickoffs.some(k => k >= round.starts_at && k < round.ends_at)) versions.add(scoringVersion(round.scoring_rule_version));
    if ((rounds ?? []).length < 1000) break;
  }
  return [...versions];
}
