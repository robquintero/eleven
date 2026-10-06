import type { PlayerPosition } from "@/lib/types/fantasy";
import { cn } from "@/lib/utils";

const POSITION_TONES: Record<PlayerPosition, { text: string; badge: string }> = {
  GK: { text: "text-position-gk", badge: "bg-position-gk/10 ring-position-gk/20" },
  DEF: { text: "text-position-def", badge: "bg-position-def/10 ring-position-def/20" },
  MID: { text: "text-position-mid", badge: "bg-position-mid/10 ring-position-mid/20" },
  FWD: { text: "text-position-fwd", badge: "bg-position-fwd/10 ring-position-fwd/20" },
};

/** Inline identity uses the same semantic text tone without changing surrounding typography. */
export function PositionLabel({ position }: { position: string }) {
  const tone = Object.hasOwn(POSITION_TONES, position) ? POSITION_TONES[position as PlayerPosition].text : undefined;
  return <span title={position} aria-label={position} className={tone}>{position}</span>;
}

/** Quiet position identity, distinct from the brighter live/warning/action status colors. */
export function PositionBadge({ position, compact = false, className }: {
  position: PlayerPosition;
  compact?: boolean;
  className?: string;
}) {
  return <span title={position} aria-label={position} className={cn(
    "label-system inline-flex shrink-0 items-center justify-center rounded-control text-[10px] font-semibold ring-1 ring-inset",
    POSITION_TONES[position].text,
    POSITION_TONES[position].badge,
    compact ? "w-3 py-0.5" : "w-9 py-1",
    className,
  )}>{compact ? { GK: "G", DEF: "D", MID: "M", FWD: "F" }[position] : position}</span>;
}
