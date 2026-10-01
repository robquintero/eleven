"use client";

import { useState } from "react";
import { resolveAvatarSource } from "@/lib/player-avatar";
import { cn } from "@/lib/utils";

const SIZE_CLASSES = {
  sm: "size-6 text-[9px]",
  md: "size-8 text-[11px]",
  lg: "size-12 text-sm",
} as const;

/**
 * Shared circular player avatar (Pass 10.5C.5) — a nationality flag when
 * one is available (`src/lib/countries.ts`), else the player's initials,
 * so every surface that identifies a player (Team bench, Draft board,
 * Players list, Home's Starting XI, the player drawer) renders it the
 * same way instead of each reimplementing its own circle. See
 * `src/lib/player-avatar.ts`'s own doc comment for the exact fallback
 * rules this follows.
 *
 * Deliberately NOT used on the Team pitch (`PlayerNode`) — that circle
 * shows the player's shirt number, a different and already-deliberate
 * design (see this pass's own report), not a generic initials
 * placeholder, so changing it would be a pitch redesign this pass
 * explicitly avoids.
 *
 * `onError` swaps to the initials fallback at runtime for any reason the
 * flag image doesn't load (dead URL, offline, CDN hiccup) — a broken
 * image is never left on screen.
 */
export function PlayerAvatar({
  name,
  nationality,
  size = "md",
  className,
}: {
  name: string;
  nationality?: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const { flagUrl, flagAlt, initials } = resolveAvatarSource(name, nationality);
  const [imageFailed, setImageFailed] = useState(false);
  const showFlag = flagUrl !== null && !imageFailed;

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-muted",
        SIZE_CLASSES[size],
        className
      )}
    >
      {showFlag ? (
        <img
          src={flagUrl}
          alt={`${flagAlt} flag`}
          className="size-full object-cover"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <span className="label-system font-semibold text-foreground-secondary" aria-hidden="true">
          {initials}
        </span>
      )}
    </span>
  );
}
