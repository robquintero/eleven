"use client";

import { useActionState } from "react";
import { changePasswordAction } from "@/app/(app)/account/actions";
import type { UpdatePasswordState } from "@/data-access/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function ChangePasswordForm() {
  const [state, formAction, pending] = useActionState<UpdatePasswordState, FormData>(changePasswordAction, undefined);

  return (
    <form action={formAction} aria-busy={pending} className="account-form">
      <label className="block flex-1">
        <span className="auth-label">New password</span>
        <Input name="password" type="password" autoComplete="new-password" required minLength={8} className="mt-1.5" placeholder="••••••••" />
      </label>
      <label className="block flex-1">
        <span className="auth-label">Confirm new password</span>
        <Input name="confirmPassword" type="password" autoComplete="new-password" required minLength={8} className="mt-1.5" placeholder="••••••••" />
      </label>
      <Button type="submit" disabled={pending} className="rounded-control">
        {pending ? "Updating…" : "Update password"}
      </Button>
      {state?.error && <p role="alert" className="account-feedback text-sm text-destructive">{state.error}</p>}
      {state?.updated && <p role="status" className="account-feedback text-sm text-live">Password updated.</p>}
    </form>
  );
}
