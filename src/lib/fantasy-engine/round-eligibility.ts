import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { roundWindowContaining, nextRoundWindow } from "../../domain/fantasy/round-calendar.ts";
import type { RoundWindow } from "../../domain/fantasy/round-calendar.ts";
import type { Database } from "../supabase/database.types.ts";

const MAX_BLANK_WEEKS_TO_SKIP = 12;

/**
 * The next Tue->Mon window, strictly after `afterWindow` (or containing
 * `now` if there is no previous round yet), that actually has at least
 * one stored fixture — international-break weeks are skipped entirely,
 * never represented as an empty round (docs/game-rules.md "Round
 * generation"). Bounded search (12 weeks ~= an international-break-heavy
 * quarter) so a genuinely fixture-less stretch (e.g. querying far past
 * the end of the stored season) returns `null` rather than looping
 * forever.
 */
export async function findNextEligibleWindow(
  admin: SupabaseClient<Database>,
  afterWindow: RoundWindow | null,
  now: Date
): Promise<RoundWindow | null> {
  let candidate = afterWindow ? nextRoundWindow(afterWindow) : roundWindowContaining(now);

  for (let i = 0; i < MAX_BLANK_WEEKS_TO_SKIP; i++) {
    const { count } = await admin
      .from("fixtures")
      .select("*", { count: "exact", head: true })
      .gte("kickoff_at", candidate.startsAt.toISOString())
      .lt("kickoff_at", candidate.endsAt.toISOString());

    if (count && count > 0) return candidate;
    candidate = nextRoundWindow(candidate);
  }

  return null;
}

/** Every stored fixture's id whose kickoff falls inside `window`. */
export async function getEligibleFixtureIds(admin: SupabaseClient<Database>, window: RoundWindow): Promise<string[]> {
  const { data } = await admin
    .from("fixtures")
    .select("id")
    .gte("kickoff_at", window.startsAt.toISOString())
    .lt("kickoff_at", window.endsAt.toISOString());
  return (data ?? []).map((f) => f.id);
}
