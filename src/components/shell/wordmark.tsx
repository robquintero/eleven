import Link from "next/link";
import { TransitionLink } from "@/components/shell/transition-link";

/**
 * Pass 11.5: the generated geometric "11" mark (formerly public/brand/
 * mark.svg) has been removed from the product UI — Eleven intentionally
 * has no graphical logo inside the app for now. This renders as the
 * lowercase word "eleven" in the app's existing sans typography, not a
 * new decorative wordmark treatment. `aria-label` on the link gives it an
 * accessible name distinct from the visible lowercase text (so a screen
 * reader still announces it as "Eleven," not the literal lowercase
 * string).
 *
 * Pass 12F (§9): the authenticated app shell renders this via
 * `authenticated` — outside AppShell (marketing/auth pages) it stays a
 * bare Link to the public entrance. Authenticated clicks go directly to /home
 * without a second root auth lookup and redirect.
 */
export function Wordmark({ authenticated = false }: { authenticated?: boolean }) {
  if (authenticated) {
    return (
      <TransitionLink
        href="/home"
        label="Home"
        aria-label="Eleven — home"
        className="flex items-center text-[15px] font-semibold tracking-tight text-foreground"
      >
        eleven
      </TransitionLink>
    );
  }
  return (
    <Link
      href="/"
      aria-label="Eleven — home"
      className="flex items-center text-[15px] font-semibold tracking-tight text-foreground"
    >
      eleven
    </Link>
  );
}
