import "server-only";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export interface AccountIdentity {
  userId: string;
  email: string | null;
  displayName: string;
}

/**
 * Pass 12E: the signed-in user's own account identity for the Account
 * page — email (from `auth.users`, never stored redundantly elsewhere)
 * plus the real `profiles.display_name`. Deliberately a separate function
 * from `getCurrentProfile` (src/data-access/profiles.ts) rather than
 * adding `email` to that widely-used type: `Profile` is read by every
 * other league member too (league membership lists, standings team
 * names), and an email address has no business being fetched/exposed
 * there. `null` only when there's genuinely no session.
 */
export async function getAccountIdentity(): Promise<AccountIdentity | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle();

  return {
    userId: user.id,
    email: user.email ?? null,
    displayName: profile?.display_name ?? "Manager",
  };
}

export type UpdateDisplayNameErrorCode = "NOT_AUTHENTICATED" | "INVALID_NAME" | "UNKNOWN";

export class UpdateDisplayNameError extends Error {
  code: UpdateDisplayNameErrorCode;
  constructor(code: UpdateDisplayNameErrorCode, message?: string) {
    super(message ?? code);
    this.code = code;
    this.name = "UpdateDisplayNameError";
  }
}

/**
 * Updates the caller's own display name — a plain, RLS-respecting UPDATE
 * through the normal authenticated client, not a new RPC: `profiles`
 * already has a real `"users can update their own profile"` policy
 * (`auth.uid() = id`, supabase/migrations/20260929141143_rls.sql), so no
 * privileged write path is needed for this self-scoped, non-sensitive
 * field.
 */
export async function updateDisplayName(displayName: string): Promise<void> {
  const trimmed = displayName.trim();
  if (trimmed.length < 1 || trimmed.length > 60) {
    throw new UpdateDisplayNameError("INVALID_NAME", "Display name must be 1-60 characters.");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new UpdateDisplayNameError("NOT_AUTHENTICATED");

  const { error } = await supabase.from("profiles").update({ display_name: trimmed }).eq("id", user.id);
  if (error) throw new UpdateDisplayNameError("UNKNOWN", error.message);
}
