import type { StandingsRow } from "@/data-access/matchups";
import { cn } from "@/lib/utils";

/**
 * League's first-class standings surface (Pass 11.5) -- rank, team,
 * W-L-D, points for/against, and differential, all from the existing
 * authoritative `getStandings` (derived from real completed matchups,
 * never a stored win/loss column). The signed-in manager's own row is
 * marked with a restrained left accent bar + "YOU" tag, never an
 * oversized special card.
 */
export function StandingsTable({ standings, myTeamId }: { standings: StandingsRow[]; myTeamId: string | null }) {
  if (standings.length === 0) {
    return <p className="p-4 text-center text-sm text-foreground-secondary">NO RESULTS YET</p>;
  }

  return (
    <div>
      <div className="grid grid-cols-[1.75rem_1fr_4.5rem_3rem_3rem_3.5rem] items-center gap-2 border-b border-border px-4 py-2 text-right">
        <span />
        <span className="label-system text-left text-[10px] text-foreground-tertiary">TEAM</span>
        <span className="label-system text-[10px] text-foreground-tertiary">W-L-D</span>
        <span className="label-system text-[10px] text-foreground-tertiary">PF</span>
        <span className="label-system text-[10px] text-foreground-tertiary">PA</span>
        <span className="label-system text-[10px] text-foreground-tertiary">DIFF</span>
      </div>
      <div className="divide-y divide-border">
        {standings.map((row, index) => {
          const isMe = row.fantasyTeamId === myTeamId;
          const diff = Math.round((row.pointsFor - row.pointsAgainst) * 100) / 100;
          return (
            <div
              key={row.fantasyTeamId}
              className={cn(
                "grid grid-cols-[1.75rem_1fr_4.5rem_3rem_3rem_3.5rem] items-center gap-2 border-l-2 px-4 py-2 text-right",
                isMe ? "border-l-accent bg-accent/5" : "border-l-transparent"
              )}
            >
              <span className="label-system text-left text-xs text-foreground-tertiary">{index + 1}</span>
              <span className="flex min-w-0 items-center gap-1.5 text-left">
                <span className="truncate text-sm font-medium text-foreground">{row.teamName}</span>
                {isMe && <span className="label-system shrink-0 text-[9px] text-accent">YOU</span>}
              </span>
              <span className="label-system text-xs tabular-nums text-foreground-secondary">
                {row.wins}-{row.losses}-{row.draws}
              </span>
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
            </div>
          );
        })}
      </div>
    </div>
  );
}
