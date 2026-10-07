import { PositionBadge } from "@/components/players/position-badge";
import { ArrowLeftRight, Ban, Lock, Plus } from "lucide-react";
import { PlayerAvatar } from "@/components/players/player-avatar";
import {
  formatRoundPoints,
  isPlayerLocked,
  playerFixtureCode,
  playerFixtureParticipantLabel,
  playerStateWord,
} from "@/lib/team-fixture";
import type { Player, PlayerPosition } from "@/lib/types/fantasy";
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
  compatibleLocked = false,
  disabled = false,
  onSelect,
}: {
  index: number;
  player: Player;
  editing?: boolean;
  selected?: boolean;
  swapTarget?: boolean;
  /** Pass 14.6.3: right position for the active selection, but THIS player's own lineup slot is already locked -- "correct position, but unavailable." Distinct from `swapTarget` (right position, swappable now), `disabled` (wrong position), and `selected`. Never clickable INTO a swap -- the click still fires (same as any other locked row) to surface the existing lock explanation, never silently does nothing. Caller computes exactly one of `swapTarget`/`compatibleLocked`/`disabled` true at a time for a given row. */
  compatibleLocked?: boolean;
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
  // Pass 14.6: a locked player while editing is NOT given native `disabled`
  // -- the click must still fire so the parent can show an explanatory
  // error ("that player's match has already started"), matching how a
  // locked STARTER already behaves (`handleSelectStarterOrPending`). Only
  // the externally-passed `disabled` (wrong position for the selected
  // empty slot / swap) is genuinely inert -- there's nothing useful to
  // explain beyond the dimmed Ban-icon treatment itself.
  const lockedForEditing = editing && locked;

  return (
    <div className="@container min-w-0">
      <button
        type="button"
        onClick={onSelect}
        disabled={disabled}
        aria-pressed={editing ? selected : undefined}
        aria-label={
          disabled
            ? `${player.name} (wrong position for the selected slot)`
            : lockedForEditing
              ? `${player.name} (locked -- their match has already started)`
              : undefined
        }
        className={cn(
          "core-player-row w-full border-l-2 border-l-transparent text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset",
          // Pass 14.7 Phase 1: this row is ALWAYS genuinely clickable (opens
          // the player record, or drives Team's swap flow) regardless of
          // `editing` -- `cursor-pointer` must not be gated on it. Only
          // `lockedForEditing` (mid-swap-selection only) makes the click
          // "informational but not a valid swap," which keeps its own
          // not-allowed cursor below.
          !disabled && !lockedForEditing && "cursor-pointer",
          // Pass 13 (DESIGN.md §20): selection is a left-edge indicator, the
          // same pattern player-table.tsx/standings-table.tsx use -- never a
          // rounded ring highlight.
          selected && "border-l-accent bg-accent/10",
          // Pass 14.7 Phase 4: "you selected this player, now choose who
          // replaces him" -- a single restrained 150ms nudge the instant a
          // row becomes the swap source, never a looping/bouncing animation.
          // `motion-reduce:animate-none` drops it entirely under the OS
          // reduced-motion preference; the static selected tint above still
          // communicates the state either way.
          selected && "animate-in slide-in-from-left-1 duration-150 ease-out motion-reduce:animate-none",
          swapTarget && !selected && !disabled && !lockedForEditing && "border-l-accent/30 bg-accent/5",
          // Pass 14.6.3: restrained amber -- "correct position, but locked" --
          // deliberately distinct from the accent-blue valid-target tint
          // above, the grey/opacity-40 `disabled` treatment below, and the
          // plain neutral `locked` tint a non-swap-relevant locked row gets.
          compatibleLocked && !selected && "border-l-warning/50 bg-warning/5",
          disabled && "cursor-not-allowed opacity-40",
          !disabled && locked && !compatibleLocked && "bg-foreground/2",
          !disabled && lockedForEditing && "cursor-not-allowed",
          // Pass 14.7 Phase 1: "locked does not mean visually dead" -- a
          // row with no more specific tint (selected/swapTarget/
          // compatibleLocked) still responds to hover/focus, including when
          // it's locked (in a slightly dimmer tone than the plain hover, so
          // it never gets confused with an unlocked row).
          !disabled &&
            !selected &&
            !swapTarget &&
            !compatibleLocked &&
            (locked ? "hover:bg-foreground/5" : "hover:bg-surface")
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

        <PositionBadge position={player.position} />

        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-sm font-medium leading-snug text-foreground">
            <span className="min-w-0 line-clamp-2 [overflow-wrap:anywhere]" title={player.name}>{player.name}</span>
            {isFlagged && (
              <span className="size-1.5 shrink-0 rounded-full bg-destructive" />
            )}
            {isDoubtful && (
              <span className="size-1.5 shrink-0 rounded-full bg-warning" />
            )}
          </p>
          <p className="core-player-fixture truncate text-[11px] text-foreground-tertiary">
            {playerFixtureParticipantLabel(player)} · {playerFixtureCode(player)}
          </p>
        </div>

        <span className="core-lineup-club truncate text-xs text-foreground-tertiary">
          {player.club.shortName}
        </span>

        {/* Pass 14.5: round points are the most prominent value; the
            READY/LOCKED/LIVE/FT word is a smaller secondary line, never
            merged into one ambiguous string. Pass 14.7 Phase 4: the
            ArrowLeftRight icon is a small, steady "this row can be swapped"
            affordance nested in this SAME grid cell (never its own grid
            item, which would desync column alignment with EmptySlotRow) --
            never a separate click target, the whole row is already one
            button. Only shown where a swap is genuinely possible right now:
            editing, not wrong-position, not already mid-swap-selection as a
            locked target. */}
        <div className="core-player-result min-w-0">
          <span className="core-player-points label-system tabular-nums text-xs font-semibold text-foreground">
            {formatRoundPoints(player.fantasyPoints)}
          </span>
          <span className={cn("core-player-state flex items-center gap-1 text-[10px]", toneClass[state.tone])}>
            {editing && !disabled && !lockedForEditing && (
              <ArrowLeftRight className="mr-auto size-3 shrink-0 text-foreground-tertiary/70" strokeWidth={2} aria-hidden="true" />
            )}
            {isLive && (
              <span className="relative flex size-1.5">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-live opacity-75" />
                <span className="relative inline-flex size-1.5 rounded-full bg-live" />
              </span>
            )}
            {locked && <Lock className="size-2.5" strokeWidth={2} aria-hidden="true" />}
            {state.text === "FT" ? "FT" : state.text.charAt(0) + state.text.slice(1).toLowerCase()}
          </span>
          {Boolean(player.preAcquisitionPoints) && (
            <span
              className="text-[9px] leading-snug text-warning [overflow-wrap:anywhere]"
              title="Points earned before this player joined your squad do not count toward your matchup."
            >
              +{formatRoundPoints(player.preAcquisitionPoints!)} before acquisition
            </span>
          )}
        </div>
      </button>
    </div>
  );
}

/**
 * Pass 14.6: the empty-slot row for Team's new row-based Starting XI --
 * same dense grid shape as `BenchRow` (so a section's occupied and empty
 * rows line up identically), replacing `pitch.tsx`'s `EmptySlotNode`. An
 * editable empty slot activates editing on click directly (no separate
 * "Edit lineup" click first), same affordance the pitch version had.
 */
export function EmptySlotRow({
  position,
  editing,
  selected = false,
  fillTarget = false,
  onSelect,
}: {
  position: PlayerPosition;
  editing: boolean;
  selected?: boolean;
  fillTarget?: boolean;
  onSelect: () => void;
}) {
  return (
    <div className="@container min-w-0">
      <button
        type="button"
        onClick={onSelect}
        disabled={!editing}
        aria-pressed={editing ? selected : undefined}
        aria-label={`Empty ${position} slot`}
        className={cn(
          "core-player-row w-full border-l-2 border-l-transparent text-left outline-none transition-colors",
          editing && "cursor-pointer focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset",
          selected && "border-l-accent bg-accent/10",
          fillTarget && !selected && "border-l-accent/30 bg-accent/5"
        )}
      >
        <span />
        <span className="flex size-6 shrink-0 items-center justify-center rounded-full border-[1.5px] border-dashed border-foreground/20 bg-foreground/3">
          <Plus className="size-3 text-foreground-tertiary" strokeWidth={2} />
        </span>
        <PositionBadge position={position} />
        <span className="label-system min-w-0 text-xs text-foreground-tertiary">Empty {position} slot</span>
      </button>
    </div>
  );
}
