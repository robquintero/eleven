"use client";

import { useActionState } from "react";
import Link from "next/link";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AuthPanel, AuthPanelSection } from "@/components/auth/auth-panel";
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
    title: "Sign in",
    submitLabel: "Sign in",
    footerPrompt: "New to Eleven?",
    footerHref: "/signup",
    footerLinkLabel: "Create an account",
  },
  "sign-up": {
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
    <AuthPanel>
      <AuthPanelSection>
        <h1 className="auth-title">
          {text.title}
        </h1>

        <form action={formAction} aria-busy={pending} className="mt-5 space-y-4">
          {callbackError && (
            <p role="alert" className="flex items-start gap-2 text-sm text-destructive">
              <AlertCircle className="mt-0.5 size-3.5 shrink-0" strokeWidth={2} />
              {callbackError}
            </p>
          )}

          {mode === "sign-up" && (
            <label className="block">
              <span className="auth-label">
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
            <span className="auth-label">Email</span>
            <Input
              name="email"
              type="email" autoCapitalize="none" spellCheck={false}
              autoComplete="email"
              required
              className="mt-1.5"
              placeholder="you@example.com"
            />
          </label>

          <div className="block">
            <div className="flex items-center justify-between gap-3">
              <label htmlFor="auth-password" className="auth-label">Password</label>
              {mode === "sign-in" && (
                <Link href="/forgot-password" className="label-system text-[11px] text-accent hover:underline">
                  Forgot password?
                </Link>
              )}
            </div>
            <Input
              id="auth-password"
              name="password"
              type="password"
              autoComplete={mode === "sign-up" ? "new-password" : "current-password"}
              required
              minLength={mode === "sign-up" ? 8 : undefined}
              className="mt-1.5"
              placeholder="••••••••"
            />
          </div>

          {state?.error && (
            <p role="alert" className="flex items-start gap-2 text-sm text-destructive">
              <AlertCircle className="mt-0.5 size-3.5 shrink-0" strokeWidth={2} />
              {state.error}
            </p>
          )}

          <Button type="submit" disabled={pending} className="w-full rounded-control">
            {pending ? mode === "sign-in" ? "Signing in…" : "Creating account…" : text.submitLabel}
          </Button>
        </form>

        {state?.unconfirmedEmail && <ResendInline email={state.unconfirmedEmail} />}
      </AuthPanelSection>

      <AuthPanelSection>
        <p className="auth-footer">
          {text.footerPrompt}{" "}
          <Link href={text.footerHref} className="text-accent hover:underline">
            {text.footerLinkLabel}
          </Link>
        </p>
      </AuthPanelSection>
    </AuthPanel>
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
      {state?.error && <p role="alert" className="mt-2 text-sm text-destructive">{state.error}</p>}
    </form>
  );
}
