"use client";

import { useMenuFocus } from "./use-menu-focus";
import { useState } from "react";
import { LogOut, Settings } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { TransitionLink } from "@/components/shell/transition-link";
import type { Profile } from "@/data-access/profiles";
import { signOut } from "@/data-access/auth";

function initialsFor(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const selected = words.length > 1 ? [words[0], words[words.length - 1]] : words;
  const segments = new Intl.Segmenter(undefined, { granularity: "grapheme" });
  return selected.map(word => segments.segment(word)[Symbol.iterator]().next().value?.segment ?? "").join("").toUpperCase() || "—";
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
  const { triggerRef, menuRef } = useMenuFocus(open, setOpen);

  if (!profile) {
    return (
      <span
        className="flex size-11 shrink-0 items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-accent"
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
        ref={triggerRef}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex size-11 shrink-0 items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-accent transition-opacity hover:opacity-80"
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
            onClick={() => { setOpen(false); triggerRef.current?.focus(); }}
            onPointerDown={event => event.preventDefault()}
            tabIndex={-1}
            className="fixed inset-0 z-40 cursor-default"
          />
          <div
            ref={menuRef}
            role="menu"
            aria-label="Account"
            className="v2-shell-menu absolute top-full right-0 z-50 mt-2 w-56 border border-border bg-surface-elevated shadow-lg shadow-black/30"
          >
            <div className="border-b border-border px-3 py-2.5">
              <p className="profile-name text-sm font-medium text-foreground">
                {profile.displayName}
              </p>
              <p className="mt-0.5 text-[12px] text-foreground-tertiary">
                Signed in
              </p>
            </div>
            <TransitionLink
              href="/account"
              label="Account"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-xs text-foreground-secondary transition-colors hover:bg-surface hover:text-foreground"
            >
              <Settings className="size-3.5" strokeWidth={2} />
              Account settings
            </TransitionLink>
            <form action={signOut}>
              <button
                type="submit"
                role="menuitem"
                className="flex w-full items-center gap-2 border-t border-border px-3 py-2.5 text-left text-xs text-foreground-secondary transition-colors hover:bg-surface hover:text-foreground"
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
