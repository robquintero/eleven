import { TeamName } from "@/components/ui/team-name";
import { formatRoundPoints } from "@/lib/team-fixture";
import type { LeagueMatchupSummary } from "@/data-access/matchups";
import { TransitionLink } from "@/components/shell/transition-link";
import { pad2 } from "@/lib/team-fixture";
import { cn } from "@/lib/utils";

const statusLabel: Record<LeagueMatchupSummary["status"], string> = {
  scheduled: "UPCOMING",
  live: "LIVE",
  final: "FINAL",
};

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
  const isMine = myTeamId !== null && (matchup.homeTeamId === myTeamId || matchup.awayTeamId === myTeamId);
  const isLive = matchup.status === "live";

  const content = (
    <div className="flex items-center gap-2.5 px-3 sm:px-4 py-2.5">
      <span className="label-system w-10 shrink-0 text-[10px] text-foreground-tertiary">RD {pad2(matchup.roundNumber)}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <TeamName name={matchup.homeTeamName} className="text-sm text-foreground" />
          <span className="label-system shrink-0 text-sm font-semibold tabular-nums text-foreground">
            {formatRoundPoints(matchup.homePoints)}
          </span>
        </div>
        <div className="mt-0.5 flex items-center justify-between gap-2">
          <TeamName name={matchup.awayTeamName} className="text-sm text-foreground" />
          <span className="label-system shrink-0 text-sm font-semibold tabular-nums text-foreground">
            {formatRoundPoints(matchup.awayPoints)}
          </span>
        </div>
      </div>
      <span
        className={cn(
          "label-system flex shrink-0 items-center gap-1.5 text-[10px]",
          isLive ? "text-live" : "text-foreground-tertiary"
        )}
      >
        {isLive && (
          <span className="relative flex size-1.5">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-live opacity-75" />
            <span className="relative inline-flex size-1.5 rounded-full bg-live" />
          </span>
        )}
        {statusLabel[matchup.status]}
      </span>
    </div>
  );

  if (isMine) {
    return (
      <TransitionLink href="/matchup" label="My Matchup" className="block bg-accent/5 transition-colors hover:bg-accent/10">
        {content}
      </TransitionLink>
    );
  }
  return content;
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
