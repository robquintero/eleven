"use client";

import { useActionState } from "react";
import Link from "next/link";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TerminalPanel, TerminalPanelSection } from "@/components/ui/terminal-panel";
import { CheckYourEmail } from "@/components/auth/check-your-email";
import { resendConfirmationEmail, type AuthActionState, type ResendConfirmationState } from "@/data-access/auth";

interface AuthFormProps {
  mode: "sign-in" | "sign-up";
  action: (state: AuthActionState, formData: FormData) => Promise<AuthActionState>;
  /** Pre-mapped, already-friendly copy forwarded from `/auth/callback`'s `authError` query param (e.g. an expired confirmation/recovery link) — never a raw Supabase message. */
  callbackError?: string;
}

const copy = {
  "sign-in": {
    header: "SIGN_IN",
    title: "Sign in",
    submitLabel: "Sign in",
    footerPrompt: "New to Eleven?",
    footerHref: "/signup",
    footerLinkLabel: "Create an account",
  },
  "sign-up": {
    header: "CREATE_ACCOUNT",
    title: "Create your account",
    submitLabel: "Create account",
    footerPrompt: "Already have an account?",
    footerHref: "/login",
    footerLinkLabel: "Sign in",
  },
} as const;

export function AuthForm({ mode, action, callbackError }: AuthFormProps) {
  const [state, formAction, pending] = useActionState<AuthActionState, FormData>(
    action,
    undefined
  );
  const text = copy[mode];

  if (state && "awaitingConfirmation" in state) {
    return <CheckYourEmail email={state.email} />;
  }

  return (
    <TerminalPanel header={text.header}>
      <TerminalPanelSection>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          {text.title}
        </h1>

        <form action={formAction} className="mt-5 space-y-4">
          {callbackError && (
            <p className="flex items-start gap-2 text-xs text-destructive">
              <AlertCircle className="mt-0.5 size-3.5 shrink-0" strokeWidth={2} />
              {callbackError}
            </p>
          )}

          {mode === "sign-up" && (
            <label className="block">
              <span className="label-system text-[11px] text-foreground-tertiary">
                Display name
              </span>
              <Input
                name="displayName"
                type="text"
                autoComplete="name"
                required
                className="mt-1.5"
                placeholder="Robert Q."
              />
            </label>
          )}

          <label className="block">
            <span className="label-system text-[11px] text-foreground-tertiary">Email</span>
            <Input
              name="email"
              type="email"
              autoComplete="email"
              required
              className="mt-1.5"
              placeholder="you@example.com"
            />
          </label>

          <label className="block">
            <div className="flex items-baseline justify-between">
              <span className="label-system text-[11px] text-foreground-tertiary">
                Password
              </span>
              {mode === "sign-in" && (
                <Link href="/forgot-password" className="label-system text-[11px] text-accent hover:underline">
                  Forgot password?
                </Link>
              )}
            </div>
            <Input
              name="password"
              type="password"
              autoComplete={mode === "sign-up" ? "new-password" : "current-password"}
              required
              minLength={mode === "sign-up" ? 8 : undefined}
              className="mt-1.5"
              placeholder="••••••••"
            />
          </label>

          {state?.error && (
            <p className="flex items-start gap-2 text-xs text-destructive">
              <AlertCircle className="mt-0.5 size-3.5 shrink-0" strokeWidth={2} />
              {state.error}
            </p>
          )}

          <Button type="submit" disabled={pending} className="w-full rounded-control">
            {pending ? "Working…" : text.submitLabel}
          </Button>
        </form>

        {state?.unconfirmedEmail && <ResendInline email={state.unconfirmedEmail} />}
      </TerminalPanelSection>

      <TerminalPanelSection>
        <p className="text-center text-xs text-foreground-tertiary">
          {text.footerPrompt}{" "}
          <Link href={text.footerHref} className="text-accent hover:underline">
            {text.footerLinkLabel}
          </Link>
        </p>
      </TerminalPanelSection>
    </TerminalPanel>
  );
}

/**
 * Pass 12F: shown inline under a sign-in attempt that failed specifically
 * because the account's email isn't confirmed yet — never for a plain
 * wrong-password failure. Reuses the exact same `resendConfirmationEmail`
 * action the dedicated Check Your Email page uses, with the same
 * client-side cooldown courtesy.
 */
function ResendInline({ email }: { email: string }) {
  const [state, formAction, pending] = useActionState<ResendConfirmationState, FormData>(
    resendConfirmationEmail,
    undefined
  );

  return (
    <form action={formAction} className="mt-3 border-t border-border pt-3">
      <input type="hidden" name="email" value={email} />
      <Button type="submit" disabled={pending || state?.sent} variant="outline" size="sm" className="w-full rounded-control">
        {pending ? "Sending…" : state?.sent ? "Sent — check your inbox" : "Resend confirmation email"}
      </Button>
      {state?.error && <p className="mt-2 text-xs text-destructive">{state.error}</p>}
    </form>
  );
}
