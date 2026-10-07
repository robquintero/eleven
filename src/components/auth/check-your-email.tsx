"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { AlertCircle, CheckCircle2, Mail } from "lucide-react";
import { resendConfirmationEmail, type ResendConfirmationState } from "@/data-access/auth";
import { Button } from "@/components/ui/button";
import { AuthPanel, AuthPanelSection } from "@/components/auth/auth-panel";

const RESEND_COOLDOWN_SECONDS = 30;

/**
 * Pass 12F: the dedicated post-signup state now that Supabase's "Confirm
 * email" setting is on — replaces the form entirely (never a tiny inline
 * message next to still-visible, still-submittable fields). Shows the
 * real submitted address, explains why nothing happened yet, and offers
 * a real resend action with its own cooldown feedback. The cooldown here
 * is purely a UX courtesy (prevents frantic re-clicking); the actual
 * enforcement is Supabase's own `over_email_send_rate_limit`, surfaced as
 * friendly copy if hit anyway (see `resendConfirmationEmail`).
 */
export function CheckYourEmail({ email }: { email: string }) {
  const [state, formAction, pending] = useActionState<ResendConfirmationState, FormData>(resendConfirmationEmail, undefined);
  const [cooldown, setCooldown] = useState(0);

  // Reacting to a just-resolved action result by adjusting state during
  // render (React's documented "adjusting state when a prop changes"
  // pattern via a previous-value comparison) rather than in a `useEffect`
  // — avoids an extra cascading render for something that isn't actually
  // synchronizing with an external system.
  const [prevState, setPrevState] = useState(state);
  if (state !== prevState) {
    setPrevState(state);
    if (state?.sent) setCooldown(RESEND_COOLDOWN_SECONDS);
  }

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  return (
    <AuthPanel>
      <AuthPanelSection>
        <div className="flex flex-col items-center gap-3 py-2 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-accent/10 text-accent">
            <Mail className="size-5" strokeWidth={1.75} />
          </span>
          <h1 className="auth-title">Check your email</h1>
          <p className="max-w-xs text-sm text-foreground-secondary">
            We sent a confirmation link to <span className="font-medium text-foreground">{email}</span>. Click it to
            activate your account, then come back and sign in.
          </p>
        </div>

        <form action={formAction} className="mt-5 space-y-3">
          <input type="hidden" name="email" value={email} />
          <Button type="submit" disabled={pending || cooldown > 0} variant="outline" className="w-full rounded-control">
            {cooldown > 0 ? `Resend in ${cooldown}s` : pending ? "Sending…" : "Resend confirmation email"}
          </Button>
          {state?.error && (
            <p role="alert" className="flex items-start gap-2 text-sm text-destructive">
              <AlertCircle className="mt-0.5 size-3.5 shrink-0" strokeWidth={2} />
              {state.error}
            </p>
          )}
          {state?.sent && (
            <p role="status" className="flex items-start gap-2 text-sm text-live">
              <CheckCircle2 className="mt-0.5 size-3.5 shrink-0" strokeWidth={2} />
              Sent — check your inbox (and spam folder).
            </p>
          )}
        </form>
      </AuthPanelSection>

      <AuthPanelSection>
        <p className="auth-footer">
          Wrong email or already confirmed?{" "}
          <Link href="/login" className="text-accent hover:underline">
            Return to sign in
          </Link>
        </p>
      </AuthPanelSection>
    </AuthPanel>
  );
}
