"use client";

import { useState } from "react";
import { LogOut } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import type { Profile } from "@/data-access/profiles";
import { signOut } from "@/data-access/auth";

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
 * `(app)/layout.tsx` guarantees a real session before `AppShell` ever
 * renders, so `profile` is only ever null in the narrow edge case where a
 * session cookie exists but the `profiles` row lookup itself fails — a
 * neutral placeholder avatar (no name, no dropdown) is the honest state
 * for that, never a fabricated identity.
 */
export function ProfileControl({ profile }: { profile: Profile | null }) {
  const [open, setOpen] = useState(false);

  if (!profile) {
    return (
      <span
        className="flex items-center rounded-full"
        aria-label="Profile unavailable"
      >
        <Avatar>
          <AvatarFallback className="bg-muted font-semibold text-foreground-tertiary">
            —
          </AvatarFallback>
        </Avatar>
      </span>
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
