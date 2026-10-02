import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { authErrorMessage } from "@/lib/errors/auth-error";
import { safeNextPath } from "@/lib/auth/safe-redirect";

/**
 * Exchanges an email-confirmation/magic-link/password-recovery `code` for
 * a session. Shared by every Supabase email link Eleven sends — signup
 * confirmation redirects here with no `next` (falls back to `/league`),
 * password recovery redirects here with `next=/reset-password`
 * (`requestPasswordReset`, src/data-access/auth.ts).
 *
 * Only reached when the Supabase project has email confirmation enabled —
 * see the note in src/data-access/auth.ts's `signUp()`.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeNextPath(searchParams.get("next"));

  // Supabase redirects here with these params INSTEAD of `code` when the
  // link itself is already invalid (expired, already used, malformed) —
  // never attempt an exchange in that case, and never show a bare
  // "something went wrong": surface the real, specific reason.
  const providerErrorCode = searchParams.get("error_code");
  if (providerErrorCode) {
    const message = authErrorMessage({ code: providerErrorCode }, "That link is invalid or has expired.");
    return NextResponse.redirect(`${origin}/login?authError=${encodeURIComponent(message)}`);
  }

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
    const message = authErrorMessage(error, "That link is invalid or has already been used.");
    return NextResponse.redirect(`${origin}/login?authError=${encodeURIComponent(message)}`);
  }

  return NextResponse.redirect(`${origin}/login?authError=${encodeURIComponent("That link is invalid or has expired.")}`);
}
