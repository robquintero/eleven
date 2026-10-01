import { leagueLabels } from "@/lib/leagues";
import { PlayerAvatar } from "@/components/players/player-avatar";
import { Button } from "@/components/ui/button";
import type { Player } from "@/lib/types/fantasy";
import { cn } from "@/lib/utils";

/**
 * Pass 11: the Players page is the free-agent market — `onAdd`/`onDrop`
 * are optional specifically so this same row (also used by Home's
 * Starting XI, which has no market context at all) only grows a market
 * action where one is actually wired up. The action button is a nested
 * `<button>` with `stopPropagation` so clicking ADD/DROP never also
 * triggers the row's own `onSelect` (opening the player drawer) —
 * "never expose an action that can't succeed," so OWNED (by someone
 * else) renders a truthful label, never a disabled button pretending an
 * action exists.
 */
export function PlayerRow({
  player,
  selected = false,
  onSelect,
  onAdd,
  onDrop,
  actionPending = false,
}: {
  player: Player;
  selected?: boolean;
  onSelect?: () => void;
  onAdd?: () => void;
  onDrop?: () => void;
  actionPending?: boolean;
}) {
  const showAdd = player.ownership === "free" && onAdd;
  const showDrop = player.ownership === "mine" && onDrop;

  return (
    <div
      className={cn(
        "flex w-full items-center gap-3 border-l-2 border-l-transparent py-3 pr-1 pl-2 transition-colors",
        selected ? "border-l-accent bg-accent/10" : "hover:bg-surface"
      )}
    >
      <button type="button" onClick={onSelect} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <PlayerAvatar name={player.name} nationality={player.nationality} size="sm" />

        <span className="label-system flex w-9 shrink-0 items-center justify-center rounded-md bg-muted py-1 text-[11px] font-semibold text-foreground-secondary">
          {player.position}
        </span>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">
            {player.name}
          </p>
          <p className="label-system truncate text-[11px] text-foreground-tertiary">
            {player.club.shortName} · {leagueLabels[player.club.league]}
          </p>
        </div>

        <span className="label-system shrink-0 text-sm font-semibold text-foreground">
          {player.fantasyPoints}
        </span>
      </button>

      {showAdd && (
        <Button
          size="xs"
          variant="outline"
          disabled={actionPending}
          onClick={(e) => {
            e.stopPropagation();
            onAdd();
          }}
        >
          Add
        </Button>
      )}
      {showDrop && (
        <Button
          size="xs"
          variant="ghost"
          disabled={actionPending}
          onClick={(e) => {
            e.stopPropagation();
            onDrop();
          }}
        >
          Drop
        </Button>
      )}
      {player.ownership === "owned" && (
        <span className="label-system shrink-0 text-[10px] text-foreground-tertiary">OWNED</span>
      )}
    </div>
  );
}
