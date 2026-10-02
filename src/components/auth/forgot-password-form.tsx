"use client";

import { useActionState } from "react";
import Link from "next/link";
import { AlertCircle, Mail } from "lucide-react";
import { requestPasswordReset, type ForgotPasswordState } from "@/data-access/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TerminalPanel, TerminalPanelSection } from "@/components/ui/terminal-panel";

/**
 * Pass 12F: "enter email → neutral sent state" — the sent state is
 * IDENTICAL regardless of whether that email belongs to a real account
 * (see `requestPasswordReset`'s own doc comment on why), so this never
 * needs to branch on the result beyond "did the request itself succeed
 * infrastructurally."
 */
export function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState<ForgotPasswordState, FormData>(requestPasswordReset, undefined);

  if (state && "sent" in state) {
    return (
      <TerminalPanel header="CHECK_YOUR_EMAIL">
        <TerminalPanelSection>
          <div className="flex flex-col items-center gap-3 py-2 text-center">
            <span className="flex size-12 items-center justify-center rounded-full bg-accent/10 text-accent">
              <Mail className="size-5" strokeWidth={1.75} />
            </span>
            <h1 className="text-xl font-semibold tracking-tight text-foreground">Check your email</h1>
            <p className="max-w-xs text-sm text-foreground-secondary">
              If an account exists for that address, we sent a link to reset your password.
            </p>
          </div>
        </TerminalPanelSection>
        <TerminalPanelSection>
          <p className="text-center text-xs text-foreground-tertiary">
            <Link href="/login" className="text-accent hover:underline">
              Return to sign in
            </Link>
          </p>
        </TerminalPanelSection>
      </TerminalPanel>
    );
  }

  return (
    <TerminalPanel header="FORGOT_PASSWORD">
      <TerminalPanelSection>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Reset your password</h1>
        <p className="mt-1.5 text-sm text-foreground-secondary">
          Enter your account email and we&apos;ll send you a link to reset your password.
        </p>

        <form action={formAction} className="mt-5 space-y-4">
          <label className="block">
            <span className="label-system text-[11px] text-foreground-tertiary">Email</span>
            <Input name="email" type="email" autoComplete="email" required className="mt-1.5" placeholder="you@example.com" />
          </label>

          {state?.error && (
            <p className="flex items-start gap-2 text-xs text-destructive">
              <AlertCircle className="mt-0.5 size-3.5 shrink-0" strokeWidth={2} />
              {state.error}
            </p>
          )}

          <Button type="submit" disabled={pending} className="w-full rounded-control">
            {pending ? "Sending…" : "Send reset link"}
          </Button>
        </form>
      </TerminalPanelSection>

      <TerminalPanelSection>
        <p className="text-center text-xs text-foreground-tertiary">
          <Link href="/login" className="text-accent hover:underline">
            Return to sign in
          </Link>
        </p>
      </TerminalPanelSection>
    </TerminalPanel>
  );
}
