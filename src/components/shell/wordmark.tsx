import Link from "next/link";

/**
 * Pass 10C: the geometric "11" mark (public/brand/mark.svg, refined from
 * the approved brand reference — see docs/SEO.md) replaces the plain
 * text badge. `aria-label` on the link itself (not the image) gives this
 * an accessible name on every screen size — the visible "Eleven" text is
 * hidden below `sm`, which previously left the mobile link as an
 * icon-only control with no accessible name at all; the image's own
 * `alt=""` avoids announcing "Eleven" twice once the link already has it.
 */
export function Wordmark() {
  return (
    <Link
      href="/"
      aria-label="Eleven — home"
      className="flex items-center gap-2 text-[15px] font-semibold tracking-tight text-foreground"
    >
      <span className="flex size-7 items-center justify-center rounded-soft bg-accent p-1">
        {/* eslint-disable-next-line @next/next/no-img-element -- small static brand SVG, not a candidate for next/image's optimizer */}
        <img src="/brand/mark.svg" alt="" className="size-full object-contain" />
      </span>
      <span aria-hidden="true" className="hidden sm:inline">
        Eleven
      </span>
    </Link>
  );
}
