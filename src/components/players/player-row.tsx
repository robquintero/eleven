import { leagueLabels } from "@/lib/leagues";
import type { Player } from "@/lib/types/fantasy";
import { cn } from "@/lib/utils";

export function PlayerRow({
  player,
  selected = false,
  onSelect,
}: {
  player: Player;
  selected?: boolean;
  onSelect?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex w-full items-center gap-3 border-l-2 border-l-transparent py-3 pr-1 pl-2 text-left transition-colors",
        selected ? "border-l-accent bg-accent/10" : "hover:bg-surface"
      )}
    >
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
  );
}
