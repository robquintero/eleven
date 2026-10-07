"use client";

import { TransitionLink } from "@/components/shell/transition-link";
import { usePathname } from "next/navigation";
import { primaryNav } from "@/lib/navigation";

export function DesktopNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Primary" className="v2-desktop-nav">
      {primaryNav.map((item) => {
        const isActive =
          item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        const Icon = item.icon;

        return (
          <TransitionLink
            key={item.href}
            href={item.href}
            label={item.label}
            aria-current={isActive ? "page" : undefined}
            title={`${item.label} — G ${item.shortcutKey.toUpperCase()}`}
            className="v2-nav-link"
          >
            <Icon className="size-[18px] shrink-0" strokeWidth={isActive ? 2.25 : 1.75} />
            <span>{item.label}</span>
          </TransitionLink>
        );
      })}
    </nav>
  );
}
