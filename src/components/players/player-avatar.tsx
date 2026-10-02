"use client";

import { useState } from "react";
import { resolveAvatarSource } from "@/lib/player-avatar";
import { cn } from "@/lib/utils";

const SIZE_CLASSES = {
  sm: "size-6 text-[9px]",
  md: "size-8 text-[11px]",
  lg: "size-12 text-sm",
  // Pass 13 (§7): slightly smaller than the original size-10/sm:size-12
  // (Pass 10.5C.5A) -- the audit found the flag carrying more visual
  // weight than the player's own name below it; this plus the matching
  // name-emphasis bump in player-node.tsx rebalances that without
  // touching the pitch's own layout/geometry.
  pitch: "size-9 text-[12px] sm:size-11 sm:text-[14px]",
} as const;

/**
 * Shared circular player avatar (Pass 10.5C.5) — a nationality flag when
 * one is available (`src/lib/countries.ts`), else the player's initials,
 * so every surface that identifies a player (Team pitch, Team bench,
 * Draft board, Players list, Home's Starting XI, the player drawer)
 * renders it the same way instead of each reimplementing its own circle.
 * See `src/lib/player-avatar.ts`'s own doc comment for the exact fallback
 * rules this follows.
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
  size?: "sm" | "md" | "lg" | "pitch";
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
