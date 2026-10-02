"use client";

import { useActionState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { updatePassword, type UpdatePasswordState } from "@/data-access/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TerminalPanel, TerminalPanelSection } from "@/components/ui/terminal-panel";

export function ResetPasswordForm() {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<UpdatePasswordState, FormData>(updatePassword, undefined);

  if (state?.updated) {
    return (
      <TerminalPanel header="PASSWORD_UPDATED">
        <TerminalPanelSection>
          <div className="flex flex-col items-center gap-3 py-2 text-center">
            <span className="flex size-12 items-center justify-center rounded-full bg-live/10 text-live">
              <CheckCircle2 className="size-5" strokeWidth={1.75} />
            </span>
            <h1 className="text-xl font-semibold tracking-tight text-foreground">Password updated</h1>
            <p className="max-w-xs text-sm text-foreground-secondary">
              Your password has been changed. Sign in with your new password.
            </p>
          </div>
          <Button className="mt-5 w-full rounded-control" onClick={() => router.push("/login")}>
            Go to sign in
          </Button>
        </TerminalPanelSection>
      </TerminalPanel>
    );
  }

  return (
    <TerminalPanel header="SET_NEW_PASSWORD">
      <TerminalPanelSection>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Set a new password</h1>

        <form action={formAction} className="mt-5 space-y-4">
          <label className="block">
            <span className="label-system text-[11px] text-foreground-tertiary">New password</span>
            <Input name="password" type="password" autoComplete="new-password" required minLength={8} className="mt-1.5" placeholder="••••••••" />
          </label>

          <label className="block">
            <span className="label-system text-[11px] text-foreground-tertiary">Confirm new password</span>
            <Input name="confirmPassword" type="password" autoComplete="new-password" required minLength={8} className="mt-1.5" placeholder="••••••••" />
          </label>

          {state?.error && (
            <p className="flex items-start gap-2 text-xs text-destructive">
              <AlertCircle className="mt-0.5 size-3.5 shrink-0" strokeWidth={2} />
              {state.error}
            </p>
          )}

          <Button type="submit" disabled={pending} className="w-full rounded-control">
            {pending ? "Updating…" : "Update password"}
          </Button>
        </form>
      </TerminalPanelSection>

      <TerminalPanelSection>
        <p className="text-center text-xs text-foreground-tertiary">
          <Link href="/forgot-password" className="text-accent hover:underline">
            Request a new link
          </Link>
        </p>
      </TerminalPanelSection>
    </TerminalPanel>
  );
}
