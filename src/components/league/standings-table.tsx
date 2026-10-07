import { TransitionLink } from "@/components/shell/transition-link";
import { TeamName } from "@/components/ui/team-name";
import { formatRoundPoints } from "@/lib/team-fixture";
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
export function StandingsTable({
  standings,
  myTeamId,
  emptyContext,
  variant = "default",
}: {
  standings: StandingsRow[];
  variant?: "default" | "v2";
  myTeamId: string | null;
  /** Pass 13 (§10): real, specific reason the table is empty (e.g. "ROUND 1 HAS NOT CLOSED YET") in place of a flat "NO RESULTS YET" with no context -- `undefined` falls back to the plain label rather than fabricating a reason when the caller doesn't have one. */
  emptyContext?: string;
}) {
  if (variant === "v2") return <V2Standings standings={standings} myTeamId={myTeamId} emptyContext={emptyContext} />;
  if (standings.length === 0) {
    return (
      <div className="p-4 text-center">
        <p className="label-system text-sm text-foreground-secondary">NO RESULTS YET</p>
        {emptyContext && (
          <p className="label-system mt-1 text-[11px] text-foreground-tertiary">{emptyContext}</p>
        )}
      </div>
    );
  }

  const gridCols = "grid-cols-[1.5rem_minmax(9rem,1fr)_2rem_2rem_2rem_2rem_4.25rem_4.25rem_4.75rem_2.5rem]";

  return (
    <div className="overflow-x-auto outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent" tabIndex={0} role="region" aria-label="League standings; scroll horizontally for all statistics">
      <div className={cn("grid min-w-[44rem] items-center gap-2 border-b border-border px-4 py-2 text-right", gridCols)}>
        <span />
        <span className="sticky left-0 z-10 bg-surface label-system text-left text-[10px] text-foreground-tertiary">TEAM</span>
        <span className="label-system text-[10px] text-foreground-tertiary">P</span>
        <span className="label-system text-[10px] text-foreground-tertiary">W</span>
        <span className="label-system text-[10px] text-foreground-tertiary">D</span>
        <span className="label-system text-[10px] text-foreground-tertiary">L</span>
        <span className="label-system text-[10px] text-foreground-tertiary">PF</span>
        <span className="label-system text-[10px] text-foreground-tertiary">PA</span>
        <span className="label-system text-[10px] text-foreground-tertiary">DIFF</span>
        <span className="label-system text-[10px] text-foreground-tertiary">PTS</span>
      </div>
      <div className="min-w-[44rem] divide-y divide-border">
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
              <span className="sticky left-0 z-10 flex min-w-0 items-center gap-1.5 bg-surface text-left">
                <TransitionLink href={isMe ? "/team" : `/team/${row.fantasyTeamId}`} label={row.teamName} className="inline-flex min-h-8 min-w-0 items-center text-sm font-medium text-foreground hover:underline max-sm:min-h-11"><TeamName name={row.teamName} /></TransitionLink>
                {isMe && <span className="label-system shrink-0 text-[9px] text-accent">YOU</span>}
              </span>
              <span className="label-system text-xs tabular-nums text-foreground-secondary">{row.played}</span>
              <span className="label-system text-xs tabular-nums text-foreground-secondary">{row.wins}</span>
              <span className="label-system text-xs tabular-nums text-foreground-secondary">{row.draws}</span>
              <span className="label-system text-xs tabular-nums text-foreground-secondary">{row.losses}</span>
              <span className="label-system text-xs tabular-nums text-foreground-tertiary">{formatRoundPoints(row.pointsFor)}</span>
              <span className="label-system text-xs tabular-nums text-foreground-tertiary">{formatRoundPoints(row.pointsAgainst)}</span>
              <span
                className={cn(
                  "label-system text-xs font-semibold tabular-nums",
                  diff > 0 ? "text-live" : diff < 0 ? "text-destructive" : "text-foreground-tertiary"
                )}
              >
                {diff > 0 ? "+" : ""}
                {formatRoundPoints(diff)}
              </span>
              <span className="label-system text-sm font-semibold tabular-nums text-foreground">{row.leaguePoints}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Semantic table; values, row order and UUID navigation match the original. */
function V2Standings({ standings, myTeamId, emptyContext }: { standings: StandingsRow[]; myTeamId: string | null; emptyContext?: string }) {
  if (!standings.length) return <div className="px-5 pb-6"><p className="v2-secondary">No results yet</p>{emptyContext && <p className="v2-meta mt-1">{emptyContext}</p>}</div>;
  return <div className="overflow-x-auto rounded-b-[var(--v2-radius-module)]" tabIndex={0} role="region" aria-label="League standings; scroll horizontally for all statistics">
    <table className="v2-table">
      <caption className="sr-only">League standings, based on official completed results</caption>
      <thead><tr>{["Rank", "Team", "P", "W", "D", "L", "PF", "PA", "Diff", "Pts"].map((label, i) => <th key={label} scope="col" className={i === 1 ? "v2-team-cell v2-sticky-team" : ""}>{label}</th>)}</tr></thead>
      <tbody>{standings.map((row, i) => {
        const own = row.fantasyTeamId === myTeamId;
        const diff = Math.round((row.pointsFor - row.pointsAgainst) * 100) / 100;
        return <tr key={row.fantasyTeamId} className={own ? "v2-own-standing" : ""}>
          <td className={`v2-number ${own ? "border-l-2 border-l-[var(--v2-accent)]" : ""}`}>{i + 1}</td>
          <th scope="row" className="v2-team-cell v2-sticky-team">
            <div className="flex min-w-0 items-center gap-2"><TransitionLink href={own ? "/team" : `/team/${row.fantasyTeamId}`} label={row.teamName} className="flex min-h-11 min-w-0 items-center text-[14px] font-medium hover:underline"><TeamName name={row.teamName} /></TransitionLink>{own && <span className="text-[10px] text-[var(--v2-accent)]">You</span>}</div>
          </th>
          {[row.played,row.wins,row.draws,row.losses].map((value, j) => <td key={j} className="v2-number">{value}</td>)}
          <td className="v2-number">{formatRoundPoints(row.pointsFor)}</td><td className="v2-number">{formatRoundPoints(row.pointsAgainst)}</td>
          <td className={`v2-number font-medium ${diff > 0 ? "v2-positive" : diff < 0 ? "v2-negative" : ""}`}>{diff > 0 ? "+" : ""}{formatRoundPoints(diff)}</td>
          <td className="v2-number text-[18px] font-semibold">{row.leaguePoints}</td>
        </tr>;
      })}</tbody>
    </table>
  </div>;
}
