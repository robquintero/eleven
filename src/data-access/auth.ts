"use server";

import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { authErrorMessage } from "@/lib/errors/auth-error";
import { SITE_URL } from "@/lib/site-config";

/**
 * Pass 12F: Supabase's project-level "Confirm email" setting is now ON in
 * production, so `signUp()` never returns a usable session on success —
 * only ever `{ awaitingConfirmation: true, email }`. `signIn()` can now
 * also genuinely fail with `email_not_confirmed` for a real (correct)
 * password, which is NOT the same failure as a wrong password and must
 * never be described as one.
 */
export type AuthActionState =
  | { error?: string; unconfirmedEmail?: string }
  | { awaitingConfirmation: true; email: string }
  | undefined;

export async function signUp(
  _prevState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  if (!isSupabaseConfigured()) {
    return { error: "Supabase is not configured for this environment yet." };
  }

  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const displayName = String(formData.get("displayName") ?? "").trim();

  if (!displayName) return { error: "Enter a display name." };
  if (!email) return { error: "Enter your email." };
  if (password.length < 8) return { error: "Password must be at least 8 characters." };

  const supabase = await createClient();
  // `redirect()` below throws a Next.js-internal control-flow signal that
  // must never be caught — isolating the actual network call in its own
  // try/catch (never wrapping the redirect) is what makes that safe while
  // still turning a genuine network failure (DNS/fetch failure, never
  // wrapped into Supabase's own `{ data, error }` shape) into friendly
  // copy instead of an unhandled exception/generic 500.
  let result: Awaited<ReturnType<typeof supabase.auth.signUp>>;
  try {
    result = await supabase.auth.signUp({
      email,
      password,
      options: { data: { display_name: displayName } },
    });
  } catch {
    return { error: "Network error — check your connection and try again." };
  }
  const { data, error } = result;

  if (error) return { error: authErrorMessage(error, "Something went wrong. Try again.") };

  // With "Confirm email" on, a genuine new signup never returns a session
  // — only a confirmation email. Supabase ALSO reaches this same
  // no-error, no-session branch when `email` already belongs to an
  // existing (often already-confirmed) account, deliberately returning a
  // user-shaped response with `identities: []` rather than an error, to
  // avoid leaking which emails are registered. Both cases get the exact
  // same "check your email" state here — never a different message that
  // would reveal the distinction.
  if (!data.session) {
    return { awaitingConfirmation: true, email };
  }

  redirect("/league");
}

export async function signIn(
  _prevState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  if (!isSupabaseConfigured()) {
    return { error: "Supabase is not configured for this environment yet." };
  }

  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) return { error: "Enter your email and password." };

  const supabase = await createClient();
  let result: Awaited<ReturnType<typeof supabase.auth.signInWithPassword>>;
  try {
    result = await supabase.auth.signInWithPassword({ email, password });
  } catch {
    return { error: "Network error — check your connection and try again." };
  }
  const { error } = result;

  if (error) {
    if (error.code === "email_not_confirmed") {
      return { error: authErrorMessage(error, "Confirm your email before signing in."), unconfirmedEmail: email };
    }
    return { error: authErrorMessage(error, "Invalid email or password.") };
  }

  redirect("/league");
}

export async function signOut(): Promise<void> {
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }
  redirect("/login");
}

export type ResendConfirmationState = { error?: string; sent?: boolean } | undefined;

/**
 * Resends the signup confirmation email — Supabase's own `auth.resend`
 * enforces the real rate limit server-side (`over_email_send_rate_limit`),
 * which this surfaces as friendly copy rather than a raw error; the
 * client also applies a short cooldown of its own purely for UX (see
 * `CheckYourEmail`), never as the actual enforcement.
 */
export async function resendConfirmationEmail(
  _prevState: ResendConfirmationState,
  formData: FormData
): Promise<ResendConfirmationState> {
  if (!isSupabaseConfigured()) {
    return { error: "Supabase is not configured for this environment yet." };
  }

  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { error: "Missing email address." };

  const supabase = await createClient();
  let result: Awaited<ReturnType<typeof supabase.auth.resend>>;
  try {
    result = await supabase.auth.resend({ type: "signup", email });
  } catch {
    return { error: "Network error — check your connection and try again." };
  }

  if (result.error) return { error: authErrorMessage(result.error, "Couldn't resend the email. Try again.") };
  return { sent: true };
}

export type ForgotPasswordState = { sent: true } | { error: string } | undefined;

/**
 * Always resolves to the SAME neutral "sent" state regardless of whether
 * `email` actually belongs to a real account — the standard
 * anti-enumeration pattern (never confirm or deny account existence via a
 * password-reset form). Only a genuine infrastructure failure (not
 * configured, network error) produces a different, honest state, since
 * neither of those reveals anything about any specific email address.
 */
export async function requestPasswordReset(
  _prevState: ForgotPasswordState,
  formData: FormData
): Promise<ForgotPasswordState> {
  if (!isSupabaseConfigured()) {
    return { error: "Supabase is not configured for this environment yet." };
  }

  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { error: "Enter your email." };

  const supabase = await createClient();
  try {
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${SITE_URL}/auth/callback?next=/reset-password`,
    });
  } catch {
    return { error: "Network error — check your connection and try again." };
  }

  // Deliberately ignores any error Supabase itself returns here (besides
  // the network-failure case above) — e.g. a rate-limit error would leak
  // "something about this email was recently requested," which is itself
  // a (weaker) enumeration signal. The real rate limit still applies
  // server-side; this UI just never differentiates on it.
  return { sent: true };
}

export type UpdatePasswordState = { error?: string; updated?: boolean } | undefined;

/**
 * Sets a new password for the CURRENT session — only ever meaningful
 * right after the recovery-link callback has established a real (if
 * short-lived-in-intent) session; see `/reset-password`'s own page, which
 * checks for that session before ever rendering this form. Supabase
 * itself re-validates there's an active session server-side regardless
 * (`AuthSessionMissingError` if not), so this is defense in depth, not
 * the only gate.
 */
export async function updatePassword(
  _prevState: UpdatePasswordState,
  formData: FormData
): Promise<UpdatePasswordState> {
  if (!isSupabaseConfigured()) {
    return { error: "Supabase is not configured for this environment yet." };
  }

  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (password.length < 8) return { error: "Password must be at least 8 characters." };
  if (password !== confirmPassword) return { error: "Passwords don't match." };

  const supabase = await createClient();
  let result: Awaited<ReturnType<typeof supabase.auth.updateUser>>;
  try {
    result = await supabase.auth.updateUser({ password });
  } catch {
    return { error: "Network error — check your connection and try again." };
  }

  if (result.error) {
    if (result.error.message.toLowerCase().includes("session")) {
      return { error: "This link has expired or already been used. Request a new one." };
    }
    return { error: authErrorMessage(result.error, "Couldn't update your password. Try again.") };
  }

  return { updated: true };
}
