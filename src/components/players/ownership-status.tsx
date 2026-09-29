import { getOwnershipLabel } from "@/lib/selectors/player";
import type { Player } from "@/lib/types/fantasy";
import { cn } from "@/lib/utils";

const toneClass: Record<NonNullable<Player["ownership"]>, string> = {
  mine: "text-accent",
  owned: "text-foreground-tertiary",
  waivers: "text-warning",
  free: "text-foreground-secondary",
};

export function OwnershipStatus({ player, className }: { player: Player; className?: string }) {
  const ownership = player.ownership ?? "free";
  return (
    <span className={cn("label-system text-xs font-semibold", toneClass[ownership], className)}>
      {getOwnershipLabel(player)}
    </span>
  );
}
