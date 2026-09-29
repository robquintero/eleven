"use client";

import { useActionState } from "react";
import Link from "next/link";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TerminalPanel, TerminalPanelSection } from "@/components/ui/terminal-panel";
import type { AuthActionState } from "@/data-access/auth";

interface AuthFormProps {
  mode: "sign-in" | "sign-up";
  action: (state: AuthActionState, formData: FormData) => Promise<AuthActionState>;
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

export function AuthForm({ mode, action }: AuthFormProps) {
  const [state, formAction, pending] = useActionState<AuthActionState, FormData>(
    action,
    undefined
  );
  const text = copy[mode];

  return (
    <TerminalPanel header={text.header}>
      <TerminalPanelSection>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          {text.title}
        </h1>

        <form action={formAction} className="mt-5 space-y-4">
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
            <span className="label-system text-[11px] text-foreground-tertiary">
              Password
            </span>
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

          {state?.message && (
            <p className="flex items-start gap-2 text-xs text-live">
              <CheckCircle2 className="mt-0.5 size-3.5 shrink-0" strokeWidth={2} />
              {state.message}
            </p>
          )}

          <Button type="submit" disabled={pending} className="w-full rounded-control">
            {pending ? "Working…" : text.submitLabel}
          </Button>
        </form>
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
