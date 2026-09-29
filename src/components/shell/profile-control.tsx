"use client";

import { useState } from "react";
import { LogOut } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import type { Profile } from "@/data-access/profiles";
import { signOut } from "@/data-access/auth";
import type { FantasyManager } from "@/lib/types/fantasy";

function initialsFor(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
}

/**
 * Falls back to the existing mock `manager` avatar (no dropdown, exact
 * prior behavior) when `profile` is null — signed out, or Supabase isn't
 * configured. Demo screens must keep working with zero auth setup.
 */
export function ProfileControl({
  manager,
  profile,
}: {
  manager: FantasyManager;
  profile: Profile | null;
}) {
  const [open, setOpen] = useState(false);

  if (!profile) {
    return (
      <button
        type="button"
        className="flex items-center rounded-full transition-opacity hover:opacity-80"
        aria-label={`${manager.displayName} profile`}
      >
        <Avatar>
          <AvatarFallback className="bg-accent/15 font-semibold text-accent">
            {manager.initials}
          </AvatarFallback>
        </Avatar>
      </button>
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex items-center rounded-full transition-opacity hover:opacity-80"
        aria-label={`${profile.displayName} profile`}
      >
        <Avatar>
          <AvatarFallback className="bg-accent/15 font-semibold text-accent">
            {initialsFor(profile.displayName)}
          </AvatarFallback>
        </Avatar>
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-label="Close profile menu"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 cursor-default"
          />
          <div
            role="menu"
            className="absolute top-full right-0 z-50 mt-1 w-56 border border-border bg-surface-elevated shadow-lg shadow-black/30"
          >
            <div className="border-b border-border px-3 py-2.5">
              <p className="truncate text-sm font-medium text-foreground">
                {profile.displayName}
              </p>
              <p className="label-system mt-0.5 text-[10px] text-foreground-tertiary">
                SIGNED IN
              </p>
            </div>
            <form action={signOut}>
              <button
                type="submit"
                role="menuitem"
                className="label-system flex w-full items-center gap-2 px-3 py-2.5 text-left text-xs text-foreground-secondary transition-colors hover:bg-surface hover:text-foreground"
              >
                <LogOut className="size-3.5" strokeWidth={2} />
                Sign out
              </button>
            </form>
          </div>
        </>
      )}
    </div>
  );
}
