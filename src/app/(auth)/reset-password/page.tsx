import type { Metadata } from "next";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { ExpiredRecovery } from "@/components/auth/expired-recovery";
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

  if (!hasSession) return <ExpiredRecovery />;

  return <ResetPasswordForm />;
}
