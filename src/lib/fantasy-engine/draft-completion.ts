import "server-only";
import { createAdminClient, isSupabaseAdminConfigured } from "../supabase/admin.ts";
import { ensureFirstRoundOpened } from "./rounds.ts";

/**
 * Moved out of `src/app/(app)/draft/actions.ts` (Pass 10.5C.3) into its own
 * plain module so the real-final-pick regression test
 * (`draft-engine.integration.test.ts`) can import and call the EXACT
 * function `submitDraftPickAction`/`resolveExpiredPickAction` invoke after
 * a real pick — not a reimplementation of it, and not one of the
 * lower-level functions (`ensureFirstRoundOpened`/`openNextRound`) that
 * previous investigations called in isolation and were misled by (those
 * had already been proven to work; the real bug, if any, lives in whether
 * this function actually gets invoked and succeeds after a REAL pick).
 * `draft/actions.ts` imports `next/cache` (`revalidatePath`), which plain
 * Node module resolution can't load outside the Next.js bundler — moving
 * this function out of that file is what makes it importable from a
 * `node --experimental-strip-types` test at all. No behavior change.
 *
 * The moment a draft completes, Eleven opens the league's first fantasy
 * round immediately (rather than leaving every roster bench-only until
 * some later manual/scheduled trigger) so a manager's automatically-
 * initialized starting XI (see `./lineup.ts`'s `createRoundLineupSlots`)
 * is visible right away. Best-effort: `ensureFirstRoundOpened` itself
 * never throws, so a transient failure here self-heals the next time
 * anyone looks at their squad (`ensureFirstRoundOpenedAction`,
 * `src/app/(app)/team/actions.ts`) instead of leaving it permanently
 * bench-only.
 */
export async function maybeOpenFirstRound(draftId: string): Promise<boolean> {
  if (!isSupabaseAdminConfigured()) return false;
  const admin = createAdminClient();

  const { data: draft } = await admin.from("drafts").select("league_id,status").eq("id", draftId).maybeSingle();
  if (!draft || draft.status !== "completed") return false;

  await ensureFirstRoundOpened(admin, draft.league_id);
  return true;
}
