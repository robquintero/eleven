import { Plus } from "lucide-react";
import { PlayerNode } from "@/components/team/player-node";
import type { Formation, LineupSlot, PlayerPosition } from "@/lib/types/fantasy";
import { cn } from "@/lib/utils";

const legend = [
  { key: "live", label: "LIVE", dotClassName: "bg-live" },
  { key: "locked", label: "LOCKED", dotClassName: "bg-foreground-tertiary" },
  { key: "flag", label: "INJ / SUSP", dotClassName: "bg-destructive" },
] as const;

/**
 * A starting-XI position with no player in it yet (Pass 10.5C) — the
 * pitch always renders exactly the target formation's shape (see
 * `team-workspace.tsx`'s `targetFormation`), never fewer slots than that,
 * so a manager can always see and fill what's missing rather than being
 * stuck looking at an empty pitch with no way to build an XI.
 */
export interface EmptyPitchSlot {
  id: string;
  position: PlayerPosition;
  x: number;
  y: number;
}

export type PitchItem = LineupSlot | EmptyPitchSlot;

function EmptySlotNode({
  position,
  editing,
  selected,
  fillTarget,
  onSelect,
}: {
  position: PlayerPosition;
  editing: boolean;
  selected: boolean;
  fillTarget: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={!editing}
      title={`Empty ${position} slot`}
      className={cn(
        "flex w-16 flex-col items-center gap-1 rounded-xl py-1 text-center transition-all sm:w-20",
        editing && "cursor-pointer",
        selected && "ring-2 ring-accent ring-offset-2 ring-offset-surface-elevated",
        fillTarget && !selected && "ring-2 ring-accent/40"
      )}
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full border-[1.5px] border-dashed border-foreground/20 bg-foreground/3 sm:size-12">
        <Plus className="size-4 text-foreground-tertiary" strokeWidth={2} />
      </span>
      <span className="label-system w-full truncate text-[11px] font-semibold text-foreground-tertiary sm:text-xs">
        {position}
      </span>
      <span className="label-system w-full truncate text-[9px] text-foreground-tertiary">EMPTY</span>
    </button>
  );
}

export function Pitch({
  slots,
  formation,
  editing,
  selectedSlotId,
  swapTargetPosition,
  onSelectSlot,
  selectedEmptySlotId = null,
  fillTargetPosition = null,
  onSelectEmptySlot,
}: {
  slots: PitchItem[];
  formation: Formation;
  editing: boolean;
  selectedSlotId: string | null;
  swapTargetPosition: PlayerPosition | null;
  onSelectSlot: (slot: LineupSlot) => void;
  selectedEmptySlotId?: string | null;
  fillTargetPosition?: PlayerPosition | null;
  onSelectEmptySlot?: (slot: EmptyPitchSlot) => void;
}) {
  return (
    <div className="w-full overflow-hidden border border-border bg-surface-elevated">
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <span className="label-system text-[10px] text-foreground-secondary">
          {formation}
        </span>
        <div className="flex items-center gap-3">
          {legend.map((item) => (
            <span
              key={item.key}
              className="label-system flex items-center gap-1.5 text-[9px] text-foreground-tertiary"
            >
              <span className={`size-1.5 rounded-full ${item.dotClassName}`} />
              {item.label}
            </span>
          ))}
        </div>
      </div>

      {/* Pass 10.5B: flatter on desktop (lg:) specifically — the original
          4/4.6 ratio made the full starting XI require substantial
          scrolling on a typical laptop viewport; mobile keeps the taller
          ratio, which reads fine there since the page is scrolled
          top-to-bottom anyway. */}
      <div className="relative aspect-[4/4.6] w-full lg:aspect-[4/3.1]">
        <div className="pointer-events-none absolute inset-0" aria-hidden>
          <div className="absolute inset-4 border border-foreground/6 sm:inset-6" />
          <div className="absolute inset-x-4 top-1/2 h-px -translate-y-1/2 bg-foreground/6 sm:inset-x-6" />
          <div className="absolute top-1/2 left-1/2 size-20 -translate-x-1/2 -translate-y-1/2 rounded-full border border-foreground/6 sm:size-28" />
          <div className="absolute top-1/2 left-1/2 size-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground/10" />
          <div className="absolute inset-x-[24%] top-4 h-[13%] border border-t-0 border-foreground/6 sm:top-6" />
          <div className="absolute inset-x-[24%] bottom-4 h-[13%] border border-b-0 border-foreground/6 sm:bottom-6" />
        </div>

        {slots.map((item) => (
          <div
            key={item.id}
            className="absolute -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${item.x}%`, top: `${100 - item.y}%` }}
          >
            {!("player" in item) ? (
              <EmptySlotNode
                position={item.position}
                editing={editing}
                selected={selectedEmptySlotId === item.id}
                fillTarget={editing && fillTargetPosition === item.position && selectedEmptySlotId !== item.id}
                onSelect={() => onSelectEmptySlot?.(item)}
              />
            ) : (
              <PlayerNode
                player={item.player}
                editing={editing}
                selected={selectedSlotId === item.id}
                swapTarget={editing && swapTargetPosition === item.position && selectedSlotId !== item.id}
                onSelect={() => onSelectSlot(item)}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
