/**
 * Pass 12F: maps a Supabase Auth error's `code` (the stable, documented
 * identifier — see `@supabase/auth-js`'s `ErrorCode` union — never the
 * free-text `message`, which can change wording across versions) to
 * Eleven-native copy. Shared by sign up, sign in, resend-confirmation,
 * and password recovery so none of them ever dump a raw Supabase error
 * string into the UI. Dependency-free so it's plain, directly testable
 * TypeScript — matches this codebase's established
 * `toLeagueActionError`/`toDraftActionError` pattern.
 *
 * Takes only the one field it actually reads (`code`), duck-typed, rather
 * than the full `AuthError` class — this is also what lets the auth
 * callback route reuse it for Supabase's `error_code` QUERY PARAM (sent
 * when a link is already invalid/expired, before any real `AuthError` is
 * ever thrown) without constructing a fake one.
 */
export function authErrorMessage(error: { code?: string | null } | null | undefined, fallback: string): string {
  if (!error) return fallback;

  switch (error.code) {
    case "email_not_confirmed":
      return "Confirm your email before signing in — check your inbox for the link.";
    case "invalid_credentials":
      return "Invalid email or password.";
    case "user_already_exists":
    case "email_exists":
    case "identity_already_exists":
      // Deliberately the SAME neutral copy a genuine new signup gets —
      // never confirm or deny whether an email is already registered
      // (the same anti-enumeration principle Supabase's own API follows
      // for this exact case).
      return "Check your email to finish setting up your account.";
    case "over_email_send_rate_limit":
    case "over_request_rate_limit":
    case "over_sms_send_rate_limit":
      return "Too many attempts — wait a few minutes and try again.";
    case "weak_password":
      return "Choose a stronger password.";
    case "email_address_invalid":
      return "Enter a valid email address.";
    case "user_banned":
      return "This account is no longer active.";
    case "signup_disabled":
    case "email_provider_disabled":
      return "New accounts aren't being accepted right now. Try again later.";
    case "same_password":
      return "Choose a different password than your current one.";
    case "otp_expired":
    case "flow_state_expired":
      return "This link has expired. Request a new one.";
    case "bad_code_verifier":
    case "flow_state_not_found":
      return "This link is invalid or has already been used.";
    case "session_not_found":
    case "session_expired":
    case "refresh_token_not_found":
      return "Your session has expired. Sign in again.";
    default:
      return fallback;
  }
}
