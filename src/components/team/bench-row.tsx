import { Ban, Lock } from "lucide-react";
import { PlayerAvatar } from "@/components/players/player-avatar";
import {
  formatRoundPoints,
  isPlayerLocked,
  playerFixtureCode,
  playerFixtureParticipantLabel,
  playerStateWord,
} from "@/lib/team-fixture";
import type { Player } from "@/lib/types/fantasy";
import { cn } from "@/lib/utils";

const toneClass = {
  destructive: "text-destructive",
  warning: "text-warning",
  live: "text-live",
  neutral: "text-foreground-tertiary",
};

export function BenchRow({
  index,
  player,
  editing = false,
  selected = false,
  swapTarget = false,
  disabled = false,
  onSelect,
}: {
  index: number;
  player: Player;
  editing?: boolean;
  selected?: boolean;
  swapTarget?: boolean;
  /** Pass 10.5C.2: true when an empty slot of a DIFFERENT position is selected -- this player can't legally fill it. Genuinely non-interactive (native `disabled`), not just dimmed, and never relies on color alone: a Ban icon + reduced opacity + `cursor-not-allowed` all carry the same meaning independently. */
  disabled?: boolean;
  onSelect: () => void;
}) {
  const isFlagged =
    player.availability === "injured" || player.availability === "suspended";
  const isDoubtful = player.availability === "doubtful";
  const state = playerStateWord(player);
  const isLive = state.tone === "live";
  // Pass 14.5: a locked bench player can't be swapped IN while editing --
  // same "immovable" fact as a locked starter, rendered the same way
  // (restrained row tint + Lock icon) but never treated as "disabled" the
  // way a wrong-position bench player is (that's a Ban-icon, opacity-40
  // state about this slot specifically, unrelated to this player's own
  // lock).
  const locked = isPlayerLocked(player);
  const lockedForEditing = editing && locked;
  const effectivelyDisabled = disabled || lockedForEditing;

  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={effectivelyDisabled}
      aria-label={
        disabled
          ? `${player.name} (wrong position for the selected slot)`
          : lockedForEditing
            ? `${player.name} (locked -- their match has already started)`
            : undefined
      }
      className={cn(
        "grid w-full grid-cols-[1.25rem_1.5rem_2.25rem_1fr_auto] items-center gap-2 border-l-2 border-l-transparent py-2 pr-2 pl-1 text-left transition-colors sm:grid-cols-[1.25rem_1.5rem_2rem_1fr_2.25rem_4.25rem]",
        editing && !effectivelyDisabled && "cursor-pointer",
        // Pass 13 (DESIGN.md §20): selection is a left-edge indicator, the
        // same pattern player-table.tsx/standings-table.tsx use -- never a
        // rounded ring highlight.
        selected && "border-l-accent bg-accent/10",
        swapTarget && !selected && !effectivelyDisabled && "border-l-accent/30 bg-accent/5",
        disabled && "cursor-not-allowed opacity-40",
        !disabled && locked && "bg-foreground/2",
        !disabled && lockedForEditing && "cursor-not-allowed"
      )}
    >
      <span className="label-system text-[11px] text-foreground-tertiary">
        {disabled ? (
          <Ban className="size-3" strokeWidth={2} aria-hidden="true" />
        ) : locked ? (
          <Lock className="size-3" strokeWidth={2} aria-hidden="true" />
        ) : (
          String(index + 1).padStart(2, "0")
        )}
      </span>

      <PlayerAvatar name={player.name} nationality={player.nationality} size="sm" />

      <span className="label-system flex w-7 shrink-0 items-center justify-center rounded-md bg-muted py-1 text-[10px] font-semibold text-foreground-secondary sm:w-8">
        {player.position}
      </span>

      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 truncate text-sm font-medium text-foreground">
          {player.name}
          {isFlagged && (
            <span className="size-1.5 shrink-0 rounded-full bg-destructive" />
          )}
          {isDoubtful && (
            <span className="size-1.5 shrink-0 rounded-full bg-warning" />
          )}
        </p>
        <p className="label-system truncate text-[11px] text-foreground-tertiary sm:hidden">
          {playerFixtureParticipantLabel(player)} · {playerFixtureCode(player)}
        </p>
      </div>

      <span className="label-system hidden truncate text-xs text-foreground-tertiary sm:block">
        {player.club.shortName}
      </span>

      {/* Pass 14.5: round points are the most prominent value; the
          READY/LOCKED/LIVE/FT word is a smaller secondary line, never
          merged into one ambiguous string. */}
      <div className="flex flex-col items-end gap-0.5">
        <span className="label-system tabular-nums text-xs font-semibold text-foreground">
          {formatRoundPoints(player.fantasyPoints)}
        </span>
        <span className={cn("label-system flex items-center gap-1 text-[10px]", toneClass[state.tone])}>
          {isLive && (
            <span className="relative flex size-1.5">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-live opacity-75" />
              <span className="relative inline-flex size-1.5 rounded-full bg-live" />
            </span>
          )}
          {locked && !isLive && <Lock className="size-2.5" strokeWidth={2} aria-hidden="true" />}
          {state.text}
        </span>
      </div>
    </button>
  );
}
