import { PlayerNode } from "@/components/team/player-node";
import type { Formation, LineupSlot, PlayerPosition } from "@/lib/types/fantasy";

const legend = [
  { key: "live", label: "LIVE", dotClassName: "bg-live" },
  { key: "locked", label: "LOCKED", dotClassName: "bg-foreground-tertiary" },
  { key: "flag", label: "INJ / SUSP", dotClassName: "bg-destructive" },
] as const;

export function Pitch({
  slots,
  formation,
  editing,
  selectedSlotId,
  swapTargetPosition,
  onSelectSlot,
}: {
  slots: LineupSlot[];
  formation: Formation;
  editing: boolean;
  selectedSlotId: string | null;
  swapTargetPosition: PlayerPosition | null;
  onSelectSlot: (slot: LineupSlot) => void;
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

        {slots.map((slot) => (
          <div
            key={slot.id}
            className="absolute -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${slot.x}%`, top: `${100 - slot.y}%` }}
          >
            <PlayerNode
              player={slot.player}
              editing={editing}
              selected={selectedSlotId === slot.id}
              swapTarget={
                editing &&
                swapTargetPosition === slot.position &&
                selectedSlotId !== slot.id
              }
              onSelect={() => onSelectSlot(slot)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
