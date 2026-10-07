"use client";

import { useActionState, useState } from "react";
import { deleteAccountAction, type DeleteAccountActionState } from "@/app/(app)/account/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Pass 12F: a visually-separated destructive area with a deliberate
 * confirmation (typing the account's own email exactly) — never a single
 * click. When `blockedReason` is set (the account created one or more
 * leagues — see docs/auth-deletion-contract.md), shows that truthful
 * explanation instead of a form that would just fail on submit.
 */
export function DeleteAccountSection({ email, blockedReason }: { email: string; blockedReason: string | null }) {
  const [state, formAction, pending] = useActionState<DeleteAccountActionState, FormData>(deleteAccountAction, undefined);
  const [confirmText, setConfirmText] = useState("");
  const canSubmit = confirmText.trim().toLowerCase() === email.toLowerCase();

  return (
    <div className="account-delete">

      {blockedReason ? (
        <p className="mt-1.5 text-sm text-foreground-secondary">{blockedReason}</p>
      ) : (
        <>
          <p className="mt-1.5 text-sm text-foreground-secondary">
            This permanently deletes your account and removes you from every league you&apos;ve joined. This cannot be undone.
          </p>
          <form action={formAction} className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
            <label className="block flex-1">
              <span className="auth-label [overflow-wrap:anywhere]">Type {email} to confirm</span>
              <Input
                name="confirmEmail"
                autoCapitalize="none"
                spellCheck={false}
                required
                autoComplete="off"
                className="mt-1.5"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
              />
            </label>
            <Button type="submit" variant="destructive" disabled={pending || !canSubmit} className="rounded-control">
              {pending ? "Deleting…" : "Delete account"}
            </Button>
          </form>
          {state?.error && <p role="alert" className="mt-2 text-sm text-destructive">{state.error}</p>}
        </>
      )}
    </div>
  );
}
