/**
 * Open-redirect guard for `/auth/callback`'s `next` query param: an
 * attacker fully controls this value in a crafted confirmation/recovery
 * link, so it must always resolve to a path on THIS app, never an
 * absolute or protocol-relative URL pointing at a different host. Pure
 * and dependency-free so it's directly unit-testable without a Next.js
 * request/response — matches this codebase's convention of keeping pure
 * decision logic (e.g. `determineFixtureSyncCadence`) separate from the
 * route/handler that calls it.
 */
export function safeNextPath(next: string | null | undefined): string {
  if (!next) return "/league";
  // A single leading slash with no second slash immediately after is a
  // same-origin relative path. `//evil.com` and `/\evil.com` (browsers
  // treat a leading backslash as a slash) are both protocol-relative —
  // rejected. An absolute URL (`https://evil.com`) never starts with `/`
  // at all and is already rejected by the first check.
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return "/league";
  return next;
}
