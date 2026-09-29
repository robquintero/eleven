import "server-only";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export type DraftStatus = "scheduled" | "in_progress" | "completed";

/**
 * A league's draft row, or `null` if none exists yet. `drafts` has at most
 * one row per league (see the UNIQUE constraint in
 * supabase/migrations/20260929141135_draft.sql) — the draft ENGINE isn't
 * built (Pass 8+), so in practice this is `null` for every league today.
 * Callers must treat `null` as "not started," never assume a row exists.
 */
export async function getDraftStatus(leagueId: string): Promise<DraftStatus | null> {
  if (!isSupabaseConfigured()) return null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("drafts")
    .select("status")
    .eq("league_id", leagueId)
    .maybeSingle();

  if (error || !data) return null;

  return data.status as DraftStatus;
}
