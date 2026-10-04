import type { Metadata } from "next";
import Link from "next/link";
import { KeyRound } from "lucide-react";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { TerminalPanel, TerminalPanelSection } from "@/components/ui/terminal-panel";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Set new password" };

/**
 * Reached only after `/auth/callback` exchanges a real recovery-link code
 * for a session — if there's no session here (link already used twice,
 * never actually clicked, or the exchange itself failed and redirected to
 * `/login` instead), show a truthful "invalid or expired" state rather
 * than a password form with nothing real to submit against.
 */
export default async function ResetPasswordPage() {
  const hasSession = isSupabaseConfigured() ? Boolean((await (await createClient()).auth.getUser()).data.user) : false;

  if (!hasSession) {
    return (
      <TerminalPanel header="LINK_EXPIRED">
        <TerminalPanelSection>
          <div className="flex flex-col items-center gap-3 py-2 text-center">
            <span className="flex size-12 items-center justify-center rounded-full bg-muted text-foreground-secondary">
              <KeyRound className="size-5" strokeWidth={1.75} />
            </span>
            <h1 className="text-xl font-semibold tracking-tight text-foreground">This link is invalid or has expired</h1>
            <p className="max-w-xs text-sm text-foreground-secondary">
              Password reset links can only be used once. Request a new one to continue.
            </p>
          </div>
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

  return <ResetPasswordForm />;
}
