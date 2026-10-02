import "server-only";
import { createAdminClient } from "../supabase/admin.ts";

export type DeleteAccountErrorCode = "HAS_LEAGUES" | "UNKNOWN";

export class DeleteAccountError extends Error {
  code: DeleteAccountErrorCode;
  constructor(code: DeleteAccountErrorCode, message?: string) {
    super(message ?? code);
    this.code = code;
    this.name = "DeleteAccountError";
  }
}

/**
 * Pass 12F's audited deletion contract (see docs/auth-deletion-contract.md
 * for the full relationship-by-relationship findings). Every table that
 * references `auth.users` either CASCADEs (profiles, league_memberships,
 * fantasy_teams the caller owns, and everything those in turn cascade
 * into: roster_entries, matchups, drafts, trades, lineup_slots, etc.) or
 * SET NULLs (`transactions`/`domain_events.actor_user_id` — the log rows
 * survive, attribution clears) — EXCEPT `fantasy_leagues.
 * created_by_user_id`, which RESTRICTs. Deleting a league-creator's
 * account would either violate that constraint outright, or (if the
 * league were deleted first) destroy every OTHER real member's data in
 * that league without their knowledge — never an acceptable side effect
 * of one person's own "delete my account" click.
 *
 * So: self-deletion is only performed here for an account that has
 * created zero leagues. An account that HAS created one or more leagues
 * is refused with `HAS_LEAGUES` — a real commissioner-transfer or
 * league-deletion-with-consent flow is a genuine, separate product
 * decision (who becomes commissioner? what happens to the other
 * managers' season?) deliberately deferred rather than forced into this
 * pass, per the brief's own "do not force Delete Account into this pass
 * if safe implementation requires large unrelated schema changes."
 *
 * Never callable from `src/app/*`/`src/data-access/*` directly — those
 * roots are architecturally forbidden from importing the admin client
 * (see `no-provider-imports-in-app.test.ts`); the Server Action in
 * `src/app/(app)/account/actions.ts` calls this one function instead,
 * the same pattern `activateKeptRosterSeason` (src/lib/fantasy-engine/
 * season.ts) already established for Pass 12B.
 */
export async function deleteOwnAccount(userId: string): Promise<void> {
  const admin = createAdminClient();

  const { count, error: countError } = await admin
    .from("fantasy_leagues")
    .select("id", { count: "exact", head: true })
    .eq("created_by_user_id", userId);
  if (countError) throw new DeleteAccountError("UNKNOWN", countError.message);
  if (count && count > 0) {
    throw new DeleteAccountError(
      "HAS_LEAGUES",
      `This account is the commissioner of ${count} league${count === 1 ? "" : "s"}. Transfer commissionership or delete ${count === 1 ? "that league" : "those leagues"} first.`
    );
  }

  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) throw new DeleteAccountError("UNKNOWN", error.message);
}
