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
    <form action={formAction} className="flex flex-col gap-2 sm:flex-row sm:items-end sm:gap-3">
      <label className="block flex-1">
        <span className="label-system text-[11px] text-foreground-tertiary">Display name</span>
        <Input name="displayName" required minLength={1} maxLength={60} defaultValue={currentName} className="mt-1.5" />
      </label>
      <Button type="submit" disabled={pending} className="rounded-control">
        {pending ? "Saving…" : "Save"}
      </Button>
      {state?.error && <p className="text-xs text-destructive sm:w-full">{state.error}</p>}
      {state?.success && <p className="text-xs text-live sm:w-full">Saved.</p>}
    </form>
  );
}
