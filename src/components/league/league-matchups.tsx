import { TeamName } from "@/components/ui/team-name";
import { formatRoundPoints } from "@/lib/team-fixture";
import type { LeagueMatchupSummary } from "@/data-access/matchups";
import { TransitionLink } from "@/components/shell/transition-link";
import { pad2 } from "@/lib/team-fixture";
import { MatchupStatus } from "@/components/football/matchup-status";
import { formatRoundWindow } from "@/lib/team-fixture";

/**
 * One matchup row -- "TEAM A score / vs / TEAM B score" per the brief's
 * own spec, with real authoritative status (never invented). Links into
 * the user's own Matchup page when this row IS the caller's own matchup
 * (the only place that route currently resolves a specific contest);
 * every other row is informational only -- Eleven doesn't have a
 * matchup-by-id route yet, so this never links somewhere that can't
 * actually render that specific contest.
 */
function MatchupRow({ matchup, myTeamId }: { matchup: LeagueMatchupSummary; myTeamId: string | null }) {
  const isMine = matchup.resultState !== "pending" && matchup.resultState !== "final" && myTeamId !== null && (matchup.homeTeamId === myTeamId || matchup.awayTeamId === myTeamId);

  const content = (
    <div className="flex items-center gap-2.5 px-3 sm:px-4 py-2.5">
      <span className="label-system w-10 shrink-0 text-[10px] text-foreground-tertiary">RD {pad2(matchup.roundNumber)}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <TeamName name={matchup.homeTeamName} className="text-sm text-foreground" />
          <span className="label-system shrink-0 text-sm font-semibold tabular-nums text-foreground">
            {matchup.homePoints === null ? "—" : formatRoundPoints(matchup.homePoints)}
          </span>
        </div>
        <div className="mt-0.5 flex items-center justify-between gap-2">
          <TeamName name={matchup.awayTeamName} className="text-sm text-foreground" />
          <span className="label-system shrink-0 text-sm font-semibold tabular-nums text-foreground">
            {matchup.awayPoints === null ? "—" : formatRoundPoints(matchup.awayPoints)}
          </span>
        </div>
      </div>
      <MatchupStatus state={matchup.resultState} />
    </div>
  );

  if (isMine) {
    return (
      <TransitionLink href="/matchup" label="My Matchup" className="block bg-accent/5 transition-colors hover:bg-accent/10">
        {content}
      </TransitionLink>
    );
  }
  return <div>{content}
    {(matchup.resultState === "pending" || matchup.resultState === "final") && <p className="label-system px-3 pb-2.5 text-[9px] leading-relaxed text-foreground-tertiary sm:px-4">
      {formatRoundWindow(matchup.roundStartsAt, matchup.roundEndsAt)}
      {matchup.resultState === "pending" && <span className="ml-2 normal-case tracking-normal">Finalizing result</span>}
    </p>}
  </div>;
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
