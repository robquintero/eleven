import type { Player } from "@/lib/types/fantasy";
import { cn } from "@/lib/utils";

/** First word of a fantasy team name, e.g. "Camden Wolves" → "CAMDEN". */
export function shortTeamName(name: string) {
  return name.split(" ")[0].toUpperCase();
}

export function ownershipLabel(player: Player) {
  switch (player.ownership) {
    case "mine":
      return "MINE";
    case "owned":
      return player.ownerTeamName ? `OWNED / ${shortTeamName(player.ownerTeamName)}` : "OWNED";
    case "waivers":
      return "WAIVERS";
    case "free":
    default:
      return "FREE";
  }
}

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
      {ownershipLabel(player)}
    </span>
  );
}
