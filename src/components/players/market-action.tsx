import { Button } from "@/components/ui/button";
import { OwnershipStatus } from "@/components/players/ownership-status";
import type { Player } from "@/lib/types/fantasy";

/**
 * Pass 11: the one place ADD/DROP render — reused by both the desktop
 * table and the mobile list so the market action never has two slightly
 * different implementations. "Never expose an action that can't succeed"
 * — a player owned by someone else always falls through to the existing,
 * truthful `OwnershipStatus` label, never a disabled button.
 *
 * Pass 14.6: ADD and DROP now share identical dimensions/typography/
 * radius/spacing (same `size="xs"` Button) AND the same visual WEIGHT —
 * both get a filled background (never a near-invisible `ghost` next to a
 * clearly-bordered `outline`, the exact "look like they came from
 * different apps" inconsistency this pass fixes). `outline`/`destructive`
 * are the one `buttonVariants` system's own restrained semantic colors,
 * not a bespoke drop-specific style.
 */
export function MarketAction({
  player,
  onAdd,
  onDrop,
  pending,
}: {
  player: Player;
  onAdd?: (player: Player) => void;
  onDrop?: (player: Player) => void;
  pending: boolean;
}) {
  if (player.ownership === "free" && onAdd) {
    return (
      <Button
        size="xs"
        variant="outline"
        disabled={pending}
        onClick={(e) => {
          e.stopPropagation();
          onAdd(player);
        }}
      >
        Add
      </Button>
    );
  }

  if (player.ownership === "mine" && onDrop) {
    return (
      <Button
        size="xs"
        variant="destructive"
        disabled={pending}
        onClick={(e) => {
          e.stopPropagation();
          onDrop(player);
        }}
      >
        Drop
      </Button>
    );
  }

  return <OwnershipStatus player={player} className="justify-self-end text-[11px]" />;
}
