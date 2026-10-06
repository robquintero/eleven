import { TeamName } from "@/components/ui/team-name";
import { formatRoundPoints } from "@/lib/team-fixture";
import type { LeagueMatchupSummary } from "@/data-access/matchups";
import { TransitionLink } from "@/components/shell/transition-link";
import { pad2 } from "@/lib/team-fixture";
import { MatchupStatus } from "@/components/football/matchup-status";
import { formatRoundWindow } from "@/lib/team-fixture";

/** A single, unambiguous matchup link; team links live on its detail view. */
function MatchupRow({ matchup, myTeamId }: { matchup: LeagueMatchupSummary; myTeamId: string | null }) {
  const isMine = myTeamId !== null && (matchup.homeTeamId === myTeamId || matchup.awayTeamId === myTeamId);
  const final = matchup.resultState === "final" && matchup.homePoints !== null && matchup.awayPoints !== null;
  const winner = final ? matchup.homePoints === matchup.awayPoints ? "DRAW" : `WINNER · ${matchup.homePoints! > matchup.awayPoints! ? matchup.homeTeamName : matchup.awayTeamName}` : null;
  return <TransitionLink href={`/matchup/${matchup.id}`} label={`${matchup.homeTeamName} vs ${matchup.awayTeamName}`} className={`block transition-colors hover:bg-foreground/5 ${isMine ? "bg-accent/5" : ""}`}>
    <div className="flex min-h-11 items-center gap-2.5 px-3 py-2.5 sm:px-4">
      <span className="label-system w-10 shrink-0 text-[10px] text-foreground-tertiary">RD {pad2(matchup.roundNumber)}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2"><TeamName name={matchup.homeTeamName} className="text-sm text-foreground" /><span className="label-system shrink-0 text-sm font-semibold tabular-nums text-foreground">{matchup.homePoints === null ? "—" : formatRoundPoints(matchup.homePoints)}</span></div>
        <div className="mt-0.5 flex items-center justify-between gap-2"><TeamName name={matchup.awayTeamName} className="text-sm text-foreground" /><span className="label-system shrink-0 text-sm font-semibold tabular-nums text-foreground">{matchup.awayPoints === null ? "—" : formatRoundPoints(matchup.awayPoints)}</span></div>
        {isMine && <span className="label-system text-[9px] text-accent">YOUR MATCHUP</span>}
      </div>
      <MatchupStatus state={matchup.resultState} />
    </div>
    {(winner || matchup.resultState === "pending") && <p className="label-system px-3 pb-2.5 text-[9px] leading-relaxed text-foreground-tertiary [overflow-wrap:anywhere] sm:px-4">
      {formatRoundWindow(matchup.roundStartsAt, matchup.roundEndsAt)} · {winner ?? "Finalizing result"}
    </p>}
  </TransitionLink>;
}

export function LeagueMatchups({
  matchups,
  myTeamId,
  emptyLabel,
}: {
  matchups: LeagueMatchupSummary[];
  myTeamId: string | null;
  emptyLabel: string;
}) {
  if (matchups.length === 0) {
    return <p className="p-4 text-center text-sm text-foreground-secondary">{emptyLabel}</p>;
  }
  return (
    <div className="divide-y divide-border">
      {matchups.map((m) => (
        <MatchupRow key={m.id} matchup={m} myTeamId={myTeamId} />
      ))}
    </div>
  );
}
