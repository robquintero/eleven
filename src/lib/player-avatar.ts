import { flagUrlForNationality } from "./countries.ts";

export interface AvatarSource {
  /** `null` when there's no usable flag mapping -- caller renders `initials` instead. */
  flagUrl: string | null;
  /** The country name for the flag's `alt` text; `null` exactly when `flagUrl` is `null`. */
  flagAlt: string | null;
  /** Always computed, even when a flag IS available -- the component's own `onError` fallback needs this ready without re-deriving it. */
  initials: string;
}

/** First + last initial (e.g. "Lamine Yamal" -> "LY"); a single-word name uses its first two letters; an empty/whitespace-only name falls back to "?". Never throws on unusual input. */
export function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Pure decision logic for `PlayerAvatar` (Pass 10.5C.5) -- kept separate
 * from the React component so the fallback rules are unit-testable
 * without rendering anything, matching this codebase's existing
 * convention of pure `.ts` logic behind thin `.tsx` presentation.
 *
 * Graceful fallback, per the brief:
 *   flag available            -> circular flag avatar
 *   nationality known, no map -> initials avatar
 *   nationality missing       -> initials avatar
 * A flag URL that 404s/fails to load at runtime is the component's own
 * concern (`onError` swapping to `initials`), not this function's --
 * this only answers "do we have a mapping to try."
 */
export function resolveAvatarSource(name: string, nationality: string | null | undefined): AvatarSource {
  const flagUrl = flagUrlForNationality(nationality);
  return {
    flagUrl,
    flagAlt: flagUrl ? (nationality as string) : null,
    initials: initialsFor(name),
  };
}
