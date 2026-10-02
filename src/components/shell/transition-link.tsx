"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentProps, MouseEvent } from "react";
import { isPlainLeftClick, useNavigationTransition } from "@/components/shell/navigation-transition";

/**
 * Pass 12F (§9): the single interception point for the "ELEVEN / <LABEL>"
 * navigation overlay everywhere OUTSIDE the primary nav. DesktopNav and
 * MobileNav wire `begin()` directly against their own active-route
 * highlighting, but every other contextual in-page link (League → My
 * Matchup, League → Season Archive, Players/Account navigation, dashboard
 * shortcuts, etc.) rendered a bare next/link `Link` and never triggered the
 * overlay at all. Routing those call sites through this component instead
 * makes transition coverage a property of which component is used, not of
 * remembering to wire an onClick at every link -- the centralized fix the
 * brief asked for rather than patching each site individually.
 */
export function TransitionLink({
  href,
  label,
  onClick,
  ...rest
}: ComponentProps<typeof Link> & { label: string }) {
  const pathname = usePathname();
  const { begin } = useNavigationTransition();
  const hrefString = typeof href === "string" ? href : (href.pathname ?? "");
  const isActive = hrefString === pathname;

  return (
    <Link
      href={href}
      onClick={(event: MouseEvent<HTMLAnchorElement>) => {
        onClick?.(event);
        if (!isActive && isPlainLeftClick(event)) begin(hrefString, label);
      }}
      {...rest}
    />
  );
}
