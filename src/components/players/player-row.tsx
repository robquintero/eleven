import { leagueLabels } from "@/lib/leagues";
import type { Player } from "@/lib/types/fantasy";

export function PlayerRow({ player }: { player: Player }) {
  return (
    <div className="flex items-center gap-3 py-3">
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
    </div>
  );
}
