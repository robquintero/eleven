"use server";

import { revalidatePath } from "next/cache";
import { updateDisplayName, UpdateDisplayNameError } from "@/data-access/account";

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
