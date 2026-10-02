"use client";

import { useActionState } from "react";
import { changePasswordAction } from "@/app/(app)/account/actions";
import type { UpdatePasswordState } from "@/data-access/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function ChangePasswordForm() {
  const [state, formAction, pending] = useActionState<UpdatePasswordState, FormData>(changePasswordAction, undefined);

  return (
    <form action={formAction} className="flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-3">
      <label className="block flex-1">
        <span className="label-system text-[11px] text-foreground-tertiary">New password</span>
        <Input name="password" type="password" autoComplete="new-password" required minLength={8} className="mt-1.5" placeholder="••••••••" />
      </label>
      <label className="block flex-1">
        <span className="label-system text-[11px] text-foreground-tertiary">Confirm new password</span>
        <Input name="confirmPassword" type="password" autoComplete="new-password" required minLength={8} className="mt-1.5" placeholder="••••••••" />
      </label>
      <Button type="submit" disabled={pending} className="rounded-control">
        {pending ? "Updating…" : "Update"}
      </Button>
      {state?.error && <p className="text-xs text-destructive sm:w-full">{state.error}</p>}
      {state?.updated && <p className="text-xs text-live sm:w-full">Password updated.</p>}
    </form>
  );
}
