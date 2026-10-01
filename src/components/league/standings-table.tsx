import type { StandingsRow } from "@/data-access/matchups";
import { cn } from "@/lib/utils";

/**
 * Pass 12A: the soccer-style table (brief's REQUIRED gameplay change) --
 * Rank/Team/P/W/D/L/PF/PA/DIFF/PTS, derived from the authoritative
 * `getStandings` (real completed matchups for the league's current
 * season, never a stored win/loss column). `PTS` is the 3/1/0 league
 * table points; `PF` is fantasy points scored -- the two are deliberately
 * never conflated. On narrow screens the row scrolls horizontally rather
 * than wrapping or dropping columns, so every value stays reachable. The
 * signed-in manager's own row is marked with a restrained left accent bar
 * + "YOU" tag, never an oversized special card.
 */
export function StandingsTable({ standings, myTeamId }: { standings: StandingsRow[]; myTeamId: string | null }) {
  if (standings.length === 0) {
    return <p className="p-4 text-center text-sm text-foreground-secondary">NO RESULTS YET</p>;
  }

  const gridCols = "grid-cols-[1.5rem_9rem_2rem_2rem_2rem_2rem_3rem_3rem_3.5rem_2.5rem]";

  return (
    <div className="overflow-x-auto">
      <div className={cn("grid min-w-xl items-center gap-2 border-b border-border px-4 py-2 text-right", gridCols)}>
        <span />
        <span className="label-system text-left text-[10px] text-foreground-tertiary">TEAM</span>
        <span className="label-system text-[10px] text-foreground-tertiary">P</span>
        <span className="label-system text-[10px] text-foreground-tertiary">W</span>
        <span className="label-system text-[10px] text-foreground-tertiary">D</span>
        <span className="label-system text-[10px] text-foreground-tertiary">L</span>
        <span className="label-system text-[10px] text-foreground-tertiary">PF</span>
        <span className="label-system text-[10px] text-foreground-tertiary">PA</span>
        <span className="label-system text-[10px] text-foreground-tertiary">DIFF</span>
        <span className="label-system text-[10px] text-foreground-tertiary">PTS</span>
      </div>
      <div className="min-w-xl divide-y divide-border">
        {standings.map((row, index) => {
          const isMe = row.fantasyTeamId === myTeamId;
          const diff = Math.round((row.pointsFor - row.pointsAgainst) * 100) / 100;
          return (
            <div
              key={row.fantasyTeamId}
              className={cn(
                "grid items-center gap-2 border-l-2 px-4 py-2 text-right",
                gridCols,
                isMe ? "border-l-accent bg-accent/5" : "border-l-transparent"
              )}
            >
              <span className="label-system text-left text-xs text-foreground-tertiary">{index + 1}</span>
              <span className="flex min-w-0 items-center gap-1.5 text-left">
                <span className="truncate text-sm font-medium text-foreground">{row.teamName}</span>
                {isMe && <span className="label-system shrink-0 text-[9px] text-accent">YOU</span>}
              </span>
              <span className="label-system text-xs tabular-nums text-foreground-secondary">{row.played}</span>
              <span className="label-system text-xs tabular-nums text-foreground-secondary">{row.wins}</span>
              <span className="label-system text-xs tabular-nums text-foreground-secondary">{row.draws}</span>
              <span className="label-system text-xs tabular-nums text-foreground-secondary">{row.losses}</span>
              <span className="label-system text-xs tabular-nums text-foreground-tertiary">{row.pointsFor.toFixed(1)}</span>
              <span className="label-system text-xs tabular-nums text-foreground-tertiary">{row.pointsAgainst.toFixed(1)}</span>
              <span
                className={cn(
                  "label-system text-xs font-semibold tabular-nums",
                  diff > 0 ? "text-live" : diff < 0 ? "text-destructive" : "text-foreground-tertiary"
                )}
              >
                {diff > 0 ? "+" : ""}
                {diff.toFixed(1)}
              </span>
              <span className="label-system text-xs font-semibold tabular-nums text-foreground">{row.leaguePoints}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
