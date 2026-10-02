"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { updateDisplayName, UpdateDisplayNameError } from "@/data-access/account";
import { updatePassword, type UpdatePasswordState } from "@/data-access/auth";
import { deleteOwnAccount, DeleteAccountError } from "@/lib/account/delete-account";
import { createClient } from "@/lib/supabase/server";

export type AccountActionState = { error?: string; success?: boolean } | undefined;

const ERROR_COPY: Record<string, string> = {
  NOT_AUTHENTICATED: "Sign in to do that.",
  INVALID_NAME: "Display name must be 1-60 characters.",
  UNKNOWN: "Something went wrong. Try again.",
};

export async function updateDisplayNameAction(
  _prevState: AccountActionState,
  formData: FormData
): Promise<AccountActionState> {
  const displayName = String(formData.get("displayName") ?? "");

  try {
    await updateDisplayName(displayName);
  } catch (err) {
    const code = err instanceof UpdateDisplayNameError ? err.code : "UNKNOWN";
    return { error: ERROR_COPY[code] };
  }

  revalidatePath("/account");
  revalidatePath("/", "layout");
  return { success: true };
}

/** Change Password for an already-authenticated manager — the exact same `updatePassword` the recovery-link flow uses; it operates on "the current session" either way, never a second implementation. */
export async function changePasswordAction(
  _prevState: UpdatePasswordState,
  formData: FormData
): Promise<UpdatePasswordState> {
  return updatePassword(_prevState, formData);
}

export type DeleteAccountActionState = { error?: string } | undefined;

/**
 * Pass 12F — Delete Account. Server-side only: re-resolves the caller's
 * own identity from their own session (never trusts a client-supplied
 * user id), requires them to type their own email as a deliberate
 * confirmation step, then delegates to the audited deletion contract
 * (`src/lib/account/delete-account.ts`). Signs the session out and
 * returns to the public landing page on success — there is no account
 * left to show anything to.
 */
export async function deleteAccountAction(
  _prevState: DeleteAccountActionState,
  formData: FormData
): Promise<DeleteAccountActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sign in to do that." };

  const confirmation = String(formData.get("confirmEmail") ?? "")
    .trim()
    .toLowerCase();
  if (!user.email || confirmation !== user.email.toLowerCase()) {
    return { error: "Type your email exactly to confirm." };
  }

  try {
    await deleteOwnAccount(user.id);
  } catch (err) {
    if (err instanceof DeleteAccountError) return { error: err.message };
    return { error: "Something went wrong. Try again." };
  }

  await supabase.auth.signOut();
  redirect("/");
}
