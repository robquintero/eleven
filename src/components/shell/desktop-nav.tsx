"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { primaryNav } from "@/lib/navigation";
import { cn } from "@/lib/utils";

export function DesktopNav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-0.5">
      {primaryNav.map((item, index) => {
        const isActive =
          item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        const Icon = item.icon;

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive ? "page" : undefined}
            title={`${item.label} — G ${item.shortcutKey.toUpperCase()}`}
            className={cn(
              "flex items-center gap-3 border-l-2 py-2 pr-3 pl-2.5 text-sm font-medium transition-colors",
              isActive
                ? "border-l-accent bg-surface-elevated text-foreground"
                : "border-l-transparent text-foreground-secondary hover:bg-surface hover:text-foreground"
            )}
          >
            <span
              className={cn(
                "label-system w-4 shrink-0 text-[10px]",
                isActive ? "text-accent" : "text-foreground-tertiary"
              )}
            >
              {String(index + 1).padStart(2, "0")}
            </span>
            <Icon className="size-[18px] shrink-0" strokeWidth={isActive ? 2.25 : 1.75} />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
