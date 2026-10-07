"use client";

import { useActionState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { updatePassword, type UpdatePasswordState } from "@/data-access/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AuthPanel, AuthPanelSection } from "@/components/auth/auth-panel";

export function ResetPasswordForm() {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<UpdatePasswordState, FormData>(updatePassword, undefined);

  if (state?.updated) {
    return (
      <AuthPanel>
        <AuthPanelSection>
          <div className="flex flex-col items-center gap-3 py-2 text-center">
            <span className="flex size-12 items-center justify-center rounded-full bg-live/10 text-live">
              <CheckCircle2 className="size-5" strokeWidth={1.75} />
            </span>
            <h1 className="auth-title">Password updated</h1>
            <p className="max-w-xs text-sm text-foreground-secondary">
              Your password has been changed. Sign in with your new password.
            </p>
          </div>
          <Button className="mt-5 w-full rounded-control" onClick={() => router.push("/login")}>
            Go to sign in
          </Button>
        </AuthPanelSection>
      </AuthPanel>
    );
  }

  return (
    <AuthPanel>
      <AuthPanelSection>
        <h1 className="auth-title">Set a new password</h1>

        <form action={formAction} aria-busy={pending} className="mt-5 space-y-4">
          <label className="block">
            <span className="auth-label">New password</span>
            <Input name="password" type="password" autoComplete="new-password" required minLength={8} className="mt-1.5" placeholder="••••••••" />
          </label>

          <label className="block">
            <span className="auth-label">Confirm new password</span>
            <Input name="confirmPassword" type="password" autoComplete="new-password" required minLength={8} className="mt-1.5" placeholder="••••••••" />
          </label>

          {state?.error && (
            <p role="alert" className="flex items-start gap-2 text-sm text-destructive">
              <AlertCircle className="mt-0.5 size-3.5 shrink-0" strokeWidth={2} />
              {state.error}
            </p>
          )}

          <Button type="submit" disabled={pending} className="w-full rounded-control">
            {pending ? "Updating…" : "Update password"}
          </Button>
        </form>
      </AuthPanelSection>

      <AuthPanelSection>
        <p className="auth-footer">
          <Link href="/forgot-password" className="text-accent hover:underline">
            Request a new link
          </Link>
        </p>
      </AuthPanelSection>
    </AuthPanel>
  );
}
