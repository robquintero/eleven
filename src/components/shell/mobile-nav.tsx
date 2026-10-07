"use client";

import { TransitionLink } from "@/components/shell/transition-link";
import { usePathname } from "next/navigation";
import { primaryNav } from "@/lib/navigation";
import { cn } from "@/lib/utils";

export function MobileNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="v2-mobile-nav fixed inset-x-0 bottom-0 z-50 border-t border-border pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      <ul className="mx-auto flex max-w-md items-stretch justify-between px-2">
        {primaryNav.map((item) => {
          const isActive =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);
          const Icon = item.icon;

          return (
            <li key={item.href} className="min-w-0 flex-1">
              <TransitionLink
                href={item.href}
                label={item.label}
                aria-current={isActive ? "page" : undefined}
                className="flex min-h-14 flex-col outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent items-center justify-center gap-1 py-2.5 text-[11px] font-medium transition-colors active:bg-surface"
              >
                <Icon
                  className={cn(
                    "size-[22px] transition-colors",
                    isActive ? "text-accent" : "text-foreground-tertiary"
                  )}
                  strokeWidth={isActive ? 2.25 : 1.75}
                />
                <span
                  className={cn(
                    "transition-colors",
                    isActive ? "text-accent" : "text-foreground-tertiary"
                  )}
                >
                  {item.label}
                </span>
              </TransitionLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
