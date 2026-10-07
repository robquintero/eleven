"use client";

import { useActionState } from "react";
import { updateDisplayNameAction, type AccountActionState } from "@/app/(app)/account/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function DisplayNameForm({ currentName }: { currentName: string }) {
  const [state, formAction, pending] = useActionState<AccountActionState, FormData>(
    updateDisplayNameAction,
    undefined
  );

  return (
    <form action={formAction} aria-busy={pending} className="account-form">
      <label className="block flex-1">
        <span className="auth-label">Display name</span>
        <Input name="displayName" required minLength={1} maxLength={60} defaultValue={currentName} className="mt-1.5" />
      </label>
      <Button type="submit" disabled={pending} className="rounded-control">
        {pending ? "Saving…" : "Save"}
      </Button>
      {state?.error && <p role="alert" className="account-feedback text-sm text-destructive">{state.error}</p>}
      {state?.success && <p role="status" className="account-feedback text-sm text-live">Saved.</p>}
    </form>
  );
}
