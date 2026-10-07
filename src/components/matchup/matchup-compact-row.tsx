import { Lock } from "lucide-react";
import { formatRoundPoints, isPlayerLocked, playerStateWord } from "@/lib/team-fixture";
import { PositionBadge } from "@/components/players/position-badge";
import type { Player } from "@/lib/types/fantasy";
import { cn } from "@/lib/utils";
const toneClass = {
  destructive: "text-destructive",
  warning: "text-warning",
  live: "text-live",
  neutral: "text-foreground-secondary",
};

/** Narrow side-by-side contribution row. Points and the existing state word
 * stay separate; full identity/details are available in the shared Inspector. */
export function MatchupCompactRow({ player, onSelect }: { player: Player; onSelect: () => void }) {
  const status = playerStateWord(player);
  const isLive = status.tone === "live";
  const isFlagged = player.availability === "injured" || player.availability === "suspended";
  const isDoubtful = player.availability === "doubtful";
  // Pass 14.5: the points number is ALWAYS shown (never a "–" placeholder
  // that reads as missing data) -- a locked-but-not-yet-kicked-off player
  // truthfully has 0.0 so far, exactly like a "ready" one; the Lock icon
  // is what distinguishes "can't be moved" from "hasn't started," not the
  // absence of a number.
  const isLocked = isPlayerLocked(player);
  const compactPoints = formatRoundPoints(player.fantasyPoints ?? 0);

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-label={`${player.name}, ${player.position}, ${status.text}, ${compactPoints} points`}
      className={cn("core-compact-player outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset", isLocked && "bg-foreground/2")}
    >
      <span className="flex w-full items-center justify-between gap-1"><PositionBadge position={player.position} /><span className="core-compact-points">{compactPoints}</span></span>
      <span className="core-compact-name" title={player.name}>{player.name}</span>
      <span className="core-compact-meta"><span className="truncate">{player.club.shortName}</span><span className={cn("flex items-center gap-1",toneClass[status.tone])}>{isLive && <span className="size-1 rounded-full bg-live" />}{isLocked && <Lock className="size-2.5" aria-hidden="true" />}{status.text === "FT" ? "FT" : status.text.charAt(0) + status.text.slice(1).toLowerCase()}</span></span>
      {(isFlagged || isDoubtful) && <span className="sr-only">{player.availability}</span>}
    </button>
  );
}
